import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

import { ScheduleCampaignDto } from './dto/schedule-campaign.dto';

@Injectable()
export class CampaignsService implements OnModuleInit {
  private timer?: NodeJS.Timeout;

  constructor(private readonly databaseService: DatabaseService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.materializeDueSchedules();
    }, 30000);
  }

  async scheduleCampaign(tenantId: string, dto: ScheduleCampaignDto): Promise<Record<string, unknown>> {
    return this.databaseService.withTransaction(async ({ client }) => {
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
            recurrence_cron,
            next_run_at,
            shard_count,
            is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
          RETURNING id, next_run_at
        `,
        [
          tenantId,
          campaignId,
          dto.templateRef,
          dto.senderId,
          dto.recurrenceCron ?? null,
          dto.startAt,
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

  async materializeDueSchedules(): Promise<void> {
    await this.databaseService.withTransaction(async ({ client }) => {
      const dueSchedules = await client.query<{
        id: number;
        tenant_id: string;
        campaign_id: number;
        recurrence_cron: string | null;
        shard_count: number;
      }>(
        `
          SELECT id, tenant_id, campaign_id, recurrence_cron, shard_count
          FROM campaign_schedules
          WHERE is_active = TRUE
            AND next_run_at <= now()
          LIMIT 25
          FOR UPDATE SKIP LOCKED
        `,
      );

      for (const schedule of dueSchedules.rows) {
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
            VALUES ($1, $2, 'api', 'queued', 0, 0, $3, 5, now())
          `,
          [schedule.tenant_id, schedule.campaign_id, schedule.shard_count],
        );

        await client.query(
          `
            UPDATE campaign_schedules
            SET next_run_at = CASE
              WHEN recurrence_cron IS NULL THEN now() + interval '100 years'
              ELSE next_run_at + interval '1 day'
            END
            WHERE id = $1
          `,
          [schedule.id],
        );
      }
    });
  }
}
