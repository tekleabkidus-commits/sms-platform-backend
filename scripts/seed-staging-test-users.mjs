import { randomBytes, scryptSync } from 'node:crypto';
import { Client } from 'pg';
import { loadLocalEnv } from './lib/env-loader.mjs';

loadLocalEnv();

const ACTUAL_ROLES = ['owner', 'admin', 'finance', 'support', 'developer', 'viewer'];
const DEFAULT_SHARED_PASSWORD = 'xSMS-Staging-2026!FRA#7NqLm4Pz';

const DEFAULTS = {
  appEnv: (process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development').toLowerCase(),
  allowSeed: process.env.ALLOW_STAGING_TEST_USER_SEED === 'true',
  postgresHost: process.env.POSTGRES_HOST ?? 'localhost',
  postgresPort: Number(process.env.POSTGRES_PORT ?? 5432),
  postgresUser: process.env.POSTGRES_USER ?? 'postgres',
  postgresPassword: process.env.POSTGRES_PASSWORD ?? 'postgres',
  postgresDatabase: process.env.POSTGRES_DATABASE ?? 'sms_platform',
  tenantCode: process.env.STAGING_TEST_TENANT_CODE ?? 'staging',
  tenantName: process.env.STAGING_TEST_TENANT_NAME ?? 'X SMS Staging',
  tenantTimezone: process.env.STAGING_TEST_TENANT_TIMEZONE ?? 'Africa/Addis_Ababa',
  emailDomain: process.env.STAGING_TEST_EMAIL_DOMAIN ?? 'x-sms.local',
  sharedPassword: process.env.STAGING_TEST_SHARED_PASSWORD ?? DEFAULT_SHARED_PASSWORD,
  senderId: process.env.STAGING_TEST_SENDER_ID ?? 'XSMSQA',
  contactGroupName: process.env.STAGING_TEST_CONTACT_GROUP ?? 'Staging QA Group',
  contactPhoneNumber: process.env.STAGING_TEST_CONTACT_PHONE ?? '+251911111111',
  contactName: process.env.STAGING_TEST_CONTACT_NAME ?? 'Staging Test Contact',
  templateName: process.env.STAGING_TEST_TEMPLATE_NAME ?? 'otp-staging',
  templateBody:
    process.env.STAGING_TEST_TEMPLATE_BODY ?? 'Hello {{name}}, your staging OTP is {{code}}.',
  providerCode: process.env.STAGING_TEST_PROVIDER_CODE ?? 'staging-http',
  providerName: process.env.STAGING_TEST_PROVIDER_NAME ?? 'Staging HTTP Provider',
  providerUrl:
    process.env.STAGING_TEST_PROVIDER_URL ?? 'https://example.invalid/staging-provider',
  forceRotationWarning:
    process.env.STAGING_TEST_FORCE_ROTATION_WARNING ?? 'Rotate or disable after staging verification.',
};

function printUsage() {
  console.log(`
Usage:
  node scripts/seed-staging-test-users.mjs
  node scripts/seed-staging-test-users.mjs --plan

This script seeds staging-only test accounts for every RBAC role supported by the
platform. It is blocked when APP_ENV or NODE_ENV is production and also requires
ALLOW_STAGING_TEST_USER_SEED=true for any mutating run.
`);
}

function makePasswordHash(password) {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt.toString('base64url')}$${digest}`;
}

function buildUsers(config) {
  return ACTUAL_ROLES.map((role) => ({
    role,
    email: `${role}@${config.emailDomain}`,
  }));
}

function assertSeedAllowed() {
  if (DEFAULTS.appEnv === 'production') {
    throw new Error('Staging test-user seeding is blocked when APP_ENV or NODE_ENV is production.');
  }

  if (!['development', 'test', 'staging'].includes(DEFAULTS.appEnv)) {
    throw new Error(
      `Staging test-user seeding is allowed only in development, test, or staging environments. Received "${DEFAULTS.appEnv}".`,
    );
  }

  if (!DEFAULTS.allowSeed) {
    throw new Error('Set ALLOW_STAGING_TEST_USER_SEED=true to run the staging test-user seed.');
  }
}

function buildPlan(config) {
  return {
    environment: {
      appEnv: config.appEnv,
      allowSeed: config.allowSeed,
    },
    database: {
      host: config.postgresHost,
      port: config.postgresPort,
      user: config.postgresUser,
      database: config.postgresDatabase,
    },
    tenant: {
      code: config.tenantCode,
      name: config.tenantName,
      timezone: config.tenantTimezone,
    },
    credentials: {
      tenantCode: config.tenantCode,
      sharedPassword: config.sharedPassword,
      users: buildUsers(config),
      warning: 'Staging/dev only. Never use these credentials in production.',
      forceRotationWarning: config.forceRotationWarning,
    },
    fixtures: {
      senderId: config.senderId,
      contactGroup: config.contactGroupName,
      contactPhoneNumber: config.contactPhoneNumber,
      template: `${config.templateName}@1`,
      providerCode: config.providerCode,
    },
  };
}

async function upsertTenant(client, config) {
  const result = await client.query(
    `
      INSERT INTO tenants (
        code,
        name,
        status,
        timezone,
        api_rate_limit_rps,
        submit_tps_limit,
        priority_tier,
        metadata
      )
      VALUES ($1, $2, 'active', $3, 250, 250, 1, $4)
      ON CONFLICT (code)
      DO UPDATE SET
        name = EXCLUDED.name,
        status = 'active',
        timezone = EXCLUDED.timezone,
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING id
    `,
    [
      config.tenantCode,
      config.tenantName,
      config.tenantTimezone,
      JSON.stringify({
        seed: 'staging-test-users',
        nonProductionOnly: true,
        forceRotationWarning: config.forceRotationWarning,
      }),
    ],
  );
  return result.rows[0]?.id;
}

async function upsertWallet(client, tenantId) {
  const result = await client.query(
    `
      INSERT INTO wallets (
        tenant_id,
        currency,
        available_balance_minor,
        reserved_balance_minor,
        credit_limit_minor,
        low_balance_threshold_minor,
        metadata
      )
      VALUES ($1, 'ETB', 25000000, 0, 0, 500000, $2)
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        available_balance_minor = GREATEST(wallets.available_balance_minor, EXCLUDED.available_balance_minor),
        low_balance_threshold_minor = EXCLUDED.low_balance_threshold_minor,
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING id
    `,
    [tenantId, JSON.stringify({ seed: 'staging-test-users', nonProductionOnly: true })],
  );
  return result.rows[0]?.id;
}

async function upsertUsers(client, tenantId, config) {
  const seededUsers = [];

  for (const user of buildUsers(config)) {
    const passwordHash = makePasswordHash(config.sharedPassword);
    const result = await client.query(
      `
        INSERT INTO users (tenant_id, email, password_hash, role, is_active)
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (tenant_id, email)
        DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role,
          is_active = TRUE,
          updated_at = now()
        RETURNING id, email, role
      `,
      [tenantId, user.email, passwordHash, user.role],
    );

    const row = result.rows[0];
    if (row) {
      seededUsers.push(row);
    }
  }

  return seededUsers;
}

async function upsertProvider(client, config) {
  const result = await client.query(
    `
      INSERT INTO providers (
        code,
        name,
        default_protocol,
        supported_protocols,
        http_base_url,
        max_global_tps,
        priority,
        is_active,
        health_status,
        metadata
      )
      VALUES ($1, $2, 'http', $3, $4, 2000, 10, TRUE, 'healthy', $5)
      ON CONFLICT (code)
      DO UPDATE SET
        name = EXCLUDED.name,
        default_protocol = EXCLUDED.default_protocol,
        supported_protocols = EXCLUDED.supported_protocols,
        http_base_url = EXCLUDED.http_base_url,
        max_global_tps = EXCLUDED.max_global_tps,
        priority = EXCLUDED.priority,
        is_active = TRUE,
        health_status = 'healthy',
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING id
    `,
    [
      config.providerCode,
      config.providerName,
      JSON.stringify(['http']),
      config.providerUrl,
      JSON.stringify({ seed: 'staging-test-users', nonProductionOnly: true }),
    ],
  );
  return result.rows[0]?.id;
}

async function upsertSenderId(client, tenantId, providerId, config) {
  const result = await client.query(
    `
      INSERT INTO sender_ids (
        tenant_id,
        provider_id,
        sender_name,
        status,
        approved_at
      )
      VALUES ($1, $2, $3, 'approved', now())
      ON CONFLICT (tenant_id, provider_id, sender_name)
      DO UPDATE SET
        status = 'approved',
        rejection_reason = NULL,
        approved_at = now(),
        updated_at = now()
      RETURNING id
    `,
    [tenantId, providerId, config.senderId],
  );
  return result.rows[0]?.id;
}

async function ensureTemplate(client, tenantId, config) {
  const existing = await client.query(
    `
      SELECT id
      FROM templates
      WHERE tenant_id = $1
        AND name = $2
        AND version = 1
      LIMIT 1
    `,
    [tenantId, config.templateName],
  );

  if (existing.rows[0]?.id) {
    await client.query(
      `
        UPDATE templates
        SET body = $3,
            merge_fields = $4,
            is_active = TRUE
        WHERE id = $1
          AND tenant_id = $2
      `,
      [
        existing.rows[0].id,
        tenantId,
        config.templateBody,
        JSON.stringify(['name', 'code']),
      ],
    );
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `
      INSERT INTO templates (
        tenant_id,
        name,
        body,
        version,
        merge_fields,
        is_active
      )
      VALUES ($1, $2, $3, 1, $4, TRUE)
      RETURNING id
    `,
    [tenantId, config.templateName, config.templateBody, JSON.stringify(['name', 'code'])],
  );
  return inserted.rows[0]?.id;
}

async function upsertContactGroup(client, tenantId, config) {
  const result = await client.query(
    `
      INSERT INTO contact_groups (tenant_id, name)
      VALUES ($1, $2)
      ON CONFLICT (tenant_id, name)
      DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `,
    [tenantId, config.contactGroupName],
  );
  return result.rows[0]?.id;
}

async function upsertContact(client, tenantId, config) {
  const result = await client.query(
    `
      INSERT INTO contacts (tenant_id, phone_number, name, source, metadata)
      VALUES ($1, $2, $3, 'seed', $4)
      ON CONFLICT (tenant_id, phone_number)
      DO UPDATE SET
        name = EXCLUDED.name,
        source = 'seed',
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING id
    `,
    [
      tenantId,
      config.contactPhoneNumber,
      config.contactName,
      JSON.stringify({ seed: 'staging-test-users', nonProductionOnly: true }),
    ],
  );
  return result.rows[0]?.id;
}

async function ensureGroupMember(client, groupId, contactId) {
  await client.query(
    `
      INSERT INTO contact_group_members (group_id, contact_id)
      VALUES ($1, $2)
      ON CONFLICT (group_id, contact_id) DO NOTHING
    `,
    [groupId, contactId],
  );
}

async function ensureRoutingRule(client, tenantId, providerId) {
  const existing = await client.query(
    `
      SELECT id
      FROM routing_rules
      WHERE tenant_id = $1
        AND name = 'Staging primary route'
      LIMIT 1
    `,
    [tenantId],
  );

  if (existing.rows[0]?.id) {
    await client.query(
      `
        UPDATE routing_rules
        SET provider_id = $2,
            preferred_protocol = 'http',
            priority = 10,
            weight = 100,
            max_tps = 500,
            failover_order = 1,
            is_active = TRUE,
            updated_at = now()
        WHERE id = $1
      `,
      [existing.rows[0].id, providerId],
    );
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `
      INSERT INTO routing_rules (
        tenant_id,
        name,
        country_code,
        traffic_type,
        provider_id,
        preferred_protocol,
        priority,
        weight,
        max_tps,
        failover_order,
        is_active
      )
      VALUES ($1, 'Staging primary route', 'ET', 'transactional', $2, 'http', 10, 100, 500, 1, TRUE)
      RETURNING id
    `,
    [tenantId, providerId],
  );
  return inserted.rows[0]?.id;
}

async function ensurePricingRule(client, scope, tenantId, providerId) {
  const isSell = scope === 'sell';
  const selector = isSell
    ? {
        query: `
          SELECT id
          FROM pricing_rules
          WHERE kind = 'sell'
            AND tenant_id = $1
            AND metadata ->> 'seed' = 'staging-test-users'
          LIMIT 1
        `,
        params: [tenantId],
      }
    : {
        query: `
          SELECT id
          FROM pricing_rules
          WHERE kind = 'cost'
            AND provider_id = $1
            AND metadata ->> 'seed' = 'staging-test-users'
          LIMIT 1
        `,
        params: [providerId],
      };

  const existing = await client.query(selector.query, selector.params);
  const priceMinor = isSell ? 40 : 25;

  if (existing.rows[0]?.id) {
    await client.query(
      `
        UPDATE pricing_rules
        SET unit_price_minor = $2,
            currency = 'ETB',
            is_active = TRUE,
            metadata = $3
        WHERE id = $1
      `,
      [
        existing.rows[0].id,
        priceMinor,
        JSON.stringify({ seed: 'staging-test-users', nonProductionOnly: true }),
      ],
    );
    return existing.rows[0].id;
  }

  const insertQuery = isSell
    ? `
        INSERT INTO pricing_rules (
          kind,
          tenant_id,
          country_code,
          traffic_type,
          parts_from,
          parts_to,
          unit_price_minor,
          currency,
          metadata,
          is_active
        )
        VALUES ('sell', $1, 'ET', 'transactional', 1, 10, $2, 'ETB', $3, TRUE)
        RETURNING id
      `
    : `
        INSERT INTO pricing_rules (
          kind,
          provider_id,
          country_code,
          traffic_type,
          parts_from,
          parts_to,
          unit_price_minor,
          currency,
          metadata,
          is_active
        )
        VALUES ('cost', $1, 'ET', 'transactional', 1, 10, $2, 'ETB', $3, TRUE)
        RETURNING id
      `;

  const inserted = await client.query(
    insertQuery,
    [
      isSell ? tenantId : providerId,
      priceMinor,
      JSON.stringify({ seed: 'staging-test-users', nonProductionOnly: true }),
    ],
  );
  return inserted.rows[0]?.id;
}

async function writeAuditLogs(client, tenantId, users, config) {
  for (const user of users) {
    await client.query(
      `
        INSERT INTO audit_logs (
          log_date,
          tenant_id,
          user_id,
          action,
          target_type,
          target_id,
          metadata
        )
        VALUES (
          CURRENT_DATE,
          $1,
          NULL,
          'seed.staging_test_user',
          'user',
          $2,
          $3
        )
      `,
      [
        tenantId,
        user.id,
        JSON.stringify({
          email: user.email,
          role: user.role,
          nonProductionOnly: true,
          forceRotationWarning: config.forceRotationWarning,
        }),
      ],
    );
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help') || args.has('-h')) {
    printUsage();
    return;
  }

  const plan = buildPlan(DEFAULTS);
  if (args.has('--plan')) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  assertSeedAllowed();

  const client = new Client({
    host: DEFAULTS.postgresHost,
    port: DEFAULTS.postgresPort,
    user: DEFAULTS.postgresUser,
    password: DEFAULTS.postgresPassword,
    database: DEFAULTS.postgresDatabase,
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    const tenantId = await upsertTenant(client, DEFAULTS);
    const walletId = await upsertWallet(client, tenantId);
    const seededUsers = await upsertUsers(client, tenantId, DEFAULTS);
    const providerId = await upsertProvider(client, DEFAULTS);
    const senderIdId = await upsertSenderId(client, tenantId, providerId, DEFAULTS);
    const templateId = await ensureTemplate(client, tenantId, DEFAULTS);
    const groupId = await upsertContactGroup(client, tenantId, DEFAULTS);
    const contactId = await upsertContact(client, tenantId, DEFAULTS);
    await ensureGroupMember(client, groupId, contactId);
    const routingRuleId = await ensureRoutingRule(client, tenantId, providerId);
    const sellPricingId = await ensurePricingRule(client, 'sell', tenantId, providerId);
    const costPricingId = await ensurePricingRule(client, 'cost', tenantId, providerId);
    await writeAuditLogs(client, tenantId, seededUsers, DEFAULTS);

    await client.query('COMMIT');

    console.log(JSON.stringify({
      status: 'seeded',
      warning: 'Staging/dev only. Rotate or disable these accounts after validation.',
      tenant: {
        code: DEFAULTS.tenantCode,
        name: DEFAULTS.tenantName,
      },
      credentials: {
        tenantCode: DEFAULTS.tenantCode,
        sharedPassword: DEFAULTS.sharedPassword,
        users: seededUsers.map((user) => ({
          email: user.email,
          role: user.role,
        })),
      },
      seededIds: {
        tenantId,
        walletId,
        providerId,
        senderIdId,
        templateId,
        groupId,
        contactId,
        routingRuleId,
        sellPricingId,
        costPricingId,
      },
      fixtures: {
        senderId: DEFAULTS.senderId,
        template: `${DEFAULTS.templateName}@1`,
        contactGroup: DEFAULTS.contactGroupName,
        providerCode: DEFAULTS.providerCode,
      },
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    if (error && typeof error === 'object' && 'code' in error && error.code === '42P01') {
      const relationMessage = 'message' in error ? String(error.message) : 'relation is missing';
      throw new Error(`Staging test-user seed failed because the schema is missing: ${relationMessage}. Run migrations first with \`node scripts/run-migrations.mjs\`.`);
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
