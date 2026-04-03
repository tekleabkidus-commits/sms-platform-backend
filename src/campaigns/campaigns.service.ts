import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import CronExpressionParser from 'cron-parser';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { RuntimeRoleService } from '../runtime/runtime-role.service';

import { ScheduleCampaignDto } from './dto/schedule-campaign.dto';

@Injectable()
export class CampaignsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly runtimeRoleService: RuntimeRoleService,
  ) {}

  onModuleInit(): void {
    if (!this.runtimeRoleService.hasCapability('campaignScheduler')) {
      return;
    }
    this.timer = setInterval(() => {
      void this.materializeDueSchedules();
    }, 30000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private parseCronExpression(expression: string, timezone: string, referenceDate: Date): Date {
    try {
      const interval = CronExpressionParser.parse(expression, {
        currentDate: referenceDate,
        tz: timezone,
      });
      return interval.next().toDate();
    } catch (error) {
      throw new BadRequestException(`Invalid campaign recurrence cron: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private computeNextRunAt(
    recurrenceCron: string | null,
    timezone: string,
    referenceDate: Date,
    includeReference = false,
  ): Date {
    if (!recurrenceCron) {
      return referenceDate;
    }

    const parserReference = includeReference
      ? new Date(referenceDate.getTime() - 1000)
      : referenceDate;
    return this.parseCronExpression(recurrenceCron, timezone, parserReference);
  }

  async scheduleCampaign(tenantId: string, dto: ScheduleCampaignDto): Promise<Record<string, unknown>> {
    if (!dto.contactGroupId && !dto.contactUploadId) {
      throw new BadRequestException('Campaign scheduling requires contactGroupId or contactUploadId');
    }

    return this.databaseService.withTransaction(async ({ client }) => {
      const tenantResult = await client.query<{ timezone: string }>(
        'SELECT timezone FROM tenants WHERE id = $1 LIMIT 1',
        [tenantId],
      );
      const tenantTimezone = tenantResult.rows[0]?.timezone ?? 'UTC';

      if (dto.contactGroupId) {
        const group = await client.query<{ id: number }>(
          'SELECT id FROM contact_groups WHERE id = $1 AND tenant_id = $2 LIMIT 1',
          [dto.contactGroupId, tenantId],
        );
        if (!group.rows[0]) {
          throw new NotFoundException('Contact group not found');
        }
      }

      if (dto.contactUploadId) {
        const upload = await client.query<{ id: number }>(
          'SELECT id FROM contact_uploads WHERE id = $1 AND tenant_id = $2 LIMIT 1',
          [dto.contactUploadId, tenantId],
        );
        if (!upload.rows[0]) {
          throw new NotFoundException('Contact upload not found');
        }
      }

      const firstRunAt = this.computeNextRunAt(
        dto.recurrenceCron ?? null,
        tenantTimezone,
        new Date(dto.startAt),
        true,
      );

      let campaignId = dto.campaignId;
      if (!campaignId) {
        const created = await client.query<{ id: number }>(
          `
            INSERT INTO campaigns (tenant_id, name, status, source_type, scheduled_at, metadata)
            VALUES ($1, $2, 'scheduled', 'api', $3, $4)
            RETURNING id
          `,
          [
            tenantId,
            dto.campaignName ?? `campaign-${Date.now()}`,
            dto.startAt,
            JSON.stringify({
              templateRef: dto.templateRef,
              senderId: dto.senderId,
              contactGroupId: dto.contactGroupId ?? null,
              contactUploadId: dto.contactUploadId ?? null,
            }),
          ],
        );
        const createdCampaign = created.rows[0];
        if (!createdCampaign) {
          throw new NotFoundException('Unable to create campaign');
        }
        campaignId = createdCampaign.id;
      }

      const schedule = await client.query<{ id: number; next_run_at: string }>(
        `
          INSERT INTO campaign_schedules (
            tenant_id,
            campaign_id,
            template_ref,
            sender_id,
            contact_group_id,
            contact_upload_id,
            recurrence_cron,
            timezone,
            next_run_at,
            shard_count,
            is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
          RETURNING id, next_run_at
        `,
        [
          tenantId,
          campaignId,
          dto.templateRef,
          dto.senderId,
          dto.contactGroupId ?? null,
          dto.contactUploadId ?? null,
          dto.recurrenceCron ?? null,
          tenantTimezone,
          firstRunAt,
          dto.shardCount ?? 4,
        ],
      );

      const job = await client.query<{
        id: number;
        status: string;
        total_records: string;
        processed_records: string;
      }>(
        `
          INSERT INTO campaign_jobs (
            tenant_id,
            campaign_id,
            source_type,
            status,
            total_records,
            processed_records,
            shard_count,
            priority
          )
          VALUES ($1, $2, 'api', 'pending', 0, 0, $3, 5)
          RETURNING id, status, total_records, processed_records
        `,
        [tenantId, campaignId, dto.shardCount ?? 4],
      );
      const scheduleRow = schedule.rows[0];
      const jobRow = job.rows[0];
      if (!scheduleRow || !jobRow) {
        throw new NotFoundException('Unable to schedule campaign');
      }

      await this.auditService.write({
        tenantId,
        action: 'campaigns.schedule.materialized',
        targetType: 'campaign',
        targetId: String(campaignId),
        metadata: {
          scheduleId: scheduleRow.id,
          jobId: jobRow.id,
          contactGroupId: dto.contactGroupId ?? null,
          contactUploadId: dto.contactUploadId ?? null,
          timezone: tenantTimezone,
          shardCount: dto.shardCount ?? 4,
        },
      }, { client });

      return {
        campaignId,
        scheduleId: scheduleRow.id,
        jobId: jobRow.id,
        nextRunAt: scheduleRow.next_run_at,
        status: jobRow.status,
      };
    });
  }

  async getCampaignJob(tenantId: string, jobId: number): Promise<Record<string, unknown>> {
    const result = await this.databaseService.query<{
      id: number;
      campaign_id: number;
      status: string;
      total_records: string;
      processed_records: string;
      accepted_records: string;
      failed_records: string;
      shard_count: number;
      created_at: string;
      started_at: string | null;
      completed_at: string | null;
      last_error: string | null;
    }>(
      `
        SELECT
          id,
          campaign_id,
          status,
          total_records,
          processed_records,
          accepted_records,
          failed_records,
          shard_count,
          created_at,
          started_at,
          completed_at,
          last_error
        FROM campaign_jobs
        WHERE id = $1 AND tenant_id = $2
      `,
      [jobId, tenantId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Campaign job not found');
    }

    return {
      id: row.id,
      campaignId: row.campaign_id,
      status: row.status,
      totalRecords: Number(row.total_records),
      processedRecords: Number(row.processed_records),
      acceptedRecords: Number(row.accepted_records),
      failedRecords: Number(row.failed_records),
      shardCount: row.shard_count,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      lastError: row.last_error,
    };
  }

  async listCampaigns(tenantId: string): Promise<Record<string, unknown>[]> {
    const result = await this.databaseService.query<{
      id: number;
      name: string;
      status: string;
      source_type: string;
      scheduled_at: string | null;
      metadata: Record<string, unknown>;
      created_at: string;
      updated_at: string;
      latest_job_id: number | null;
      latest_job_status: string | null;
      latest_total_records: string | null;
      latest_processed_records: string | null;
    }>(
      `
        SELECT
          c.id,
          c.name,
          c.status,
          c.source_type,
          c.scheduled_at,
          c.metadata,
          c.created_at,
          c.updated_at,
          cj.id AS latest_job_id,
          cj.status AS latest_job_status,
          cj.total_records::text AS latest_total_records,
          cj.processed_records::text AS latest_processed_records
        FROM campaigns c
        LEFT JOIN LATERAL (
          SELECT id, status, total_records, processed_records
          FROM campaign_jobs
          WHERE campaign_id = c.id
          ORDER BY created_at DESC
          LIMIT 1
        ) cj ON TRUE
        WHERE c.tenant_id = $1
        ORDER BY c.created_at DESC
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      sourceType: row.source_type,
      scheduledAt: row.scheduled_at,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      latestJob: row.latest_job_id ? {
        id: row.latest_job_id,
        status: row.latest_job_status,
        totalRecords: Number(row.latest_total_records ?? 0),
        processedRecords: Number(row.latest_processed_records ?? 0),
      } : null,
    }));
  }

  async getCampaignDetail(tenantId: string, campaignId: number): Promise<Record<string, unknown>> {
    const [campaign, schedules, jobs, performance, recentFailures, auditTrail] = await Promise.all([
      this.databaseService.query<{
        id: number;
        name: string;
        status: string;
        source_type: string;
        scheduled_at: string | null;
        metadata: Record<string, unknown>;
        created_at: string;
        updated_at: string;
      }>(
        `
          SELECT id, name, status, source_type, scheduled_at, metadata, created_at, updated_at
          FROM campaigns
          WHERE tenant_id = $1 AND id = $2
          LIMIT 1
        `,
        [tenantId, campaignId],
      ),
      this.databaseService.query<{
        id: number;
        template_ref: string;
        sender_id: string;
        contact_group_id: number | null;
        contact_upload_id: number | null;
        recurrence_cron: string | null;
        timezone: string;
        next_run_at: string;
        shard_count: number;
        is_active: boolean;
      }>(
        `
          SELECT id, template_ref, sender_id, contact_group_id, contact_upload_id, recurrence_cron, timezone, next_run_at, shard_count, is_active
          FROM campaign_schedules
          WHERE tenant_id = $1 AND campaign_id = $2
          ORDER BY created_at DESC
        `,
        [tenantId, campaignId],
      ),
      this.databaseService.query<{
        id: number;
        status: string;
        total_records: string;
        processed_records: string;
        accepted_records: string;
        failed_records: string;
        shard_count: number;
        created_at: string;
        started_at: string | null;
        completed_at: string | null;
        last_error: string | null;
      }>(
        `
          SELECT id, status, total_records::text, processed_records::text, accepted_records::text, failed_records::text, shard_count, created_at, started_at, completed_at, last_error
          FROM campaign_jobs
          WHERE tenant_id = $1 AND campaign_id = $2
          ORDER BY created_at DESC
        `,
        [tenantId, campaignId],
      ),
      this.databaseService.query<{
        total_records: string;
        accepted_records: string;
        delivered_records: string;
        failed_records: string;
        pending_records: string;
      }>(
        `
          SELECT
            COUNT(*)::text AS total_records,
            COUNT(*) FILTER (
              WHERE status IN ('accepted', 'routed', 'submitting', 'provider_accepted', 'sent', 'delivered', 'failed')
            )::text AS accepted_records,
            COUNT(*) FILTER (WHERE status = 'delivered')::text AS delivered_records,
            COUNT(*) FILTER (WHERE status = 'failed')::text AS failed_records,
            COUNT(*) FILTER (
              WHERE status IN ('accepted', 'queued', 'routed', 'submitting', 'provider_accepted', 'sent')
            )::text AS pending_records
          FROM messages
          WHERE tenant_id = $1 AND campaign_id = $2
        `,
        [tenantId, campaignId],
      ),
      this.databaseService.query<{
        id: number;
        submit_date: string;
        phone_number: string;
        status: string;
        failed_at: string | null;
        last_error_code: string | null;
        last_error_message: string | null;
      }>(
        `
          SELECT
            id,
            submit_date,
            phone_number,
            status,
            failed_at,
            last_error_code,
            last_error_message
          FROM messages
          WHERE tenant_id = $1
            AND campaign_id = $2
            AND status = 'failed'
          ORDER BY COALESCE(failed_at, accepted_at) DESC
          LIMIT 10
        `,
        [tenantId, campaignId],
      ),
      this.databaseService.query<{
        id: number;
        action: string;
        metadata: Record<string, unknown>;
        created_at: string;
      }>(
        `
          SELECT id, action, metadata, created_at
          FROM audit_logs
          WHERE tenant_id = $1
            AND (
              (target_type = 'campaign' AND target_id = $2::text)
              OR (metadata ->> 'campaignId') = $2::text
            )
          ORDER BY created_at DESC
          LIMIT 10
        `,
        [tenantId, campaignId],
      ),
    ]);

    const campaignRow = campaign.rows[0];
    if (!campaignRow) {
      throw new NotFoundException('Campaign not found');
    }

    const performanceRow = performance.rows[0];

    return {
      id: campaignRow.id,
      name: campaignRow.name,
      status: campaignRow.status,
      sourceType: campaignRow.source_type,
      scheduledAt: campaignRow.scheduled_at,
      metadata: campaignRow.metadata,
      createdAt: campaignRow.created_at,
      updatedAt: campaignRow.updated_at,
      schedules: schedules.rows.map((row) => ({
        id: row.id,
        templateRef: row.template_ref,
        senderId: row.sender_id,
        contactGroupId: row.contact_group_id,
        contactUploadId: row.contact_upload_id,
        recurrenceCron: row.recurrence_cron,
        timezone: row.timezone,
        nextRunAt: row.next_run_at,
        shardCount: row.shard_count,
        isActive: row.is_active,
      })),
      jobs: jobs.rows.map((row) => ({
        id: row.id,
        status: row.status,
        totalRecords: Number(row.total_records),
        processedRecords: Number(row.processed_records),
        acceptedRecords: Number(row.accepted_records),
        failedRecords: Number(row.failed_records),
        shardCount: row.shard_count,
        createdAt: row.created_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        lastError: row.last_error,
      })),
      performance: {
        totalRecords: Number(performanceRow?.total_records ?? 0),
        acceptedRecords: Number(performanceRow?.accepted_records ?? 0),
        deliveredRecords: Number(performanceRow?.delivered_records ?? 0),
        failedRecords: Number(performanceRow?.failed_records ?? 0),
        pendingRecords: Number(performanceRow?.pending_records ?? 0),
      },
      recentFailures: recentFailures.rows.map((row) => ({
        id: row.id,
        submitDate: row.submit_date,
        phoneNumber: row.phone_number,
        status: row.status,
        failedAt: row.failed_at,
        lastErrorCode: row.last_error_code,
        lastErrorMessage: row.last_error_message,
      })),
      auditTrail: auditTrail.rows.map((row) => ({
        id: row.id,
        action: row.action,
        metadata: row.metadata,
        createdAt: row.created_at,
      })),
    };
  }

  async listSchedules(tenantId: string): Promise<Record<string, unknown>[]> {
    const result = await this.databaseService.query<{
      id: number;
      campaign_id: number;
      template_ref: string;
      sender_id: string;
      recurrence_cron: string | null;
      timezone: string;
      next_run_at: string;
      shard_count: number;
      is_active: boolean;
      created_at: string;
    }>(
      `
        SELECT id, campaign_id, template_ref, sender_id, recurrence_cron, timezone, next_run_at, shard_count, is_active, created_at
        FROM campaign_schedules
        WHERE tenant_id = $1
        ORDER BY created_at DESC
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      campaignId: row.campaign_id,
      templateRef: row.template_ref,
      senderId: row.sender_id,
      recurrenceCron: row.recurrence_cron,
      timezone: row.timezone,
      nextRunAt: row.next_run_at,
      shardCount: row.shard_count,
      isActive: row.is_active,
      createdAt: row.created_at,
    }));
  }

  async setScheduleActive(tenantId: string, scheduleId: number, isActive: boolean): Promise<Record<string, unknown>> {
    const result = await this.databaseService.query<{ id: number; is_active: boolean; next_run_at: string }>(
      `
        UPDATE campaign_schedules
        SET is_active = $3
        WHERE tenant_id = $1 AND id = $2
        RETURNING id, is_active, next_run_at
      `,
      [tenantId, scheduleId, isActive],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Campaign schedule not found');
    }

    return {
      id: row.id,
      isActive: row.is_active,
      nextRunAt: row.next_run_at,
    };
  }

  async cancelCampaign(tenantId: string, campaignId: number): Promise<{ success: true }> {
    await this.databaseService.withTransaction(async ({ client }) => {
      const campaign = await client.query<{ id: number }>(
        `
          UPDATE campaigns
          SET status = 'cancelled', updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id
        `,
        [tenantId, campaignId],
      );
      if (!campaign.rows[0]) {
        throw new NotFoundException('Campaign not found');
      }

      await client.query(
        `
          UPDATE campaign_schedules
          SET is_active = FALSE
          WHERE tenant_id = $1 AND campaign_id = $2
        `,
        [tenantId, campaignId],
      );

      await this.auditService.write({
        tenantId,
        action: 'campaigns.cancel',
        targetType: 'campaign',
        targetId: String(campaignId),
      }, { client });
    });

    return { success: true };
  }

  async materializeDueSchedules(): Promise<void> {
    await this.databaseService.withTransaction(async ({ client }) => {
      const dueSchedules = await client.query<{
        id: number;
        tenant_id: string;
        campaign_id: number;
        contact_group_id: number | null;
        contact_upload_id: number | null;
        recurrence_cron: string | null;
        timezone: string;
        next_run_at: string;
        shard_count: number;
      }>(
        `
          SELECT id, tenant_id, campaign_id, contact_group_id, contact_upload_id, recurrence_cron, timezone, next_run_at, shard_count
          FROM campaign_schedules
          WHERE is_active = TRUE
            AND next_run_at <= now()
          LIMIT 25
          FOR UPDATE SKIP LOCKED
        `,
      );

      for (const schedule of dueSchedules.rows) {
        let totalRecords = 0;
        let sourceType: 'contact_group' | 'upload' | 'api' = 'api';

        if (schedule.contact_group_id) {
          const groupCount = await client.query<{ total: string }>(
            'SELECT COUNT(*)::text AS total FROM contact_group_members WHERE group_id = $1',
            [schedule.contact_group_id],
          );
          totalRecords = Number(groupCount.rows[0]?.total ?? 0);
          sourceType = 'contact_group';
        } else if (schedule.contact_upload_id) {
          const uploadCount = await client.query<{ total: string }>(
            'SELECT valid_rows::text AS total FROM contact_uploads WHERE id = $1 LIMIT 1',
            [schedule.contact_upload_id],
          );
          totalRecords = Number(uploadCount.rows[0]?.total ?? 0);
          sourceType = 'upload';
        }

        await client.query(
          `
            INSERT INTO campaign_jobs (
              tenant_id,
              campaign_id,
              source_type,
              status,
              total_records,
              processed_records,
              shard_count,
              priority,
              started_at
            )
            VALUES ($1, $2, $3, 'queued', $4, 0, $5, 5, now())
          `,
          [schedule.tenant_id, schedule.campaign_id, sourceType, totalRecords, schedule.shard_count],
        );

        const nextRunAt = schedule.recurrence_cron
          ? this.computeNextRunAt(schedule.recurrence_cron, schedule.timezone, new Date(schedule.next_run_at))
          : new Date(Date.now() + (100 * 365 * 24 * 60 * 60 * 1000));

        await client.query(
          `
            UPDATE campaign_schedules
            SET next_run_at = $2,
                is_active = CASE WHEN recurrence_cron IS NULL THEN FALSE ELSE TRUE END
            WHERE id = $1
          `,
          [schedule.id, nextRunAt],
        );

        await this.auditService.write({
          tenantId: schedule.tenant_id,
          action: 'campaign_jobs.materialize',
          targetType: 'campaign_schedule',
          targetId: String(schedule.id),
          metadata: {
            campaignId: schedule.campaign_id,
            sourceType,
            totalRecords,
            timezone: schedule.timezone,
            nextRunAt: schedule.recurrence_cron ? nextRunAt.toISOString() : null,
            shardCount: schedule.shard_count,
          },
        }, { client });
      }
    });
  }
}
