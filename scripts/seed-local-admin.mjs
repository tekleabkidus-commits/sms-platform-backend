import { randomBytes, scryptSync } from 'node:crypto';
import { Client } from 'pg';
import { loadLocalEnv } from './lib/env-loader.mjs';

loadLocalEnv();

const DEFAULTS = {
  appEnv: (process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development').toLowerCase(),
  postgresHost: process.env.POSTGRES_HOST ?? 'localhost',
  postgresPort: Number(process.env.POSTGRES_PORT ?? 5432),
  postgresUser: process.env.POSTGRES_USER ?? 'postgres',
  postgresPassword: process.env.POSTGRES_PASSWORD ?? 'postgres',
  postgresDatabase: process.env.POSTGRES_DATABASE ?? 'sms_platform',
  tenantCode: process.env.LOCAL_SEED_TENANT_CODE ?? 'local',
  tenantName: process.env.LOCAL_SEED_TENANT_NAME ?? 'Local Tenant',
  tenantTimezone: process.env.LOCAL_SEED_TENANT_TIMEZONE ?? 'Africa/Addis_Ababa',
  email: process.env.LOCAL_SEED_EMAIL ?? 'admin@example.com',
  password: process.env.LOCAL_SEED_PASSWORD ?? 'ChangeMe123!',
  role: process.env.LOCAL_SEED_ROLE ?? 'owner',
  senderId: process.env.LOCAL_SEED_SENDER_ID ?? 'LOCALAPP',
  contactGroupName: process.env.LOCAL_SEED_CONTACT_GROUP ?? 'Local Test Group',
  contactPhoneNumber: process.env.LOCAL_SEED_CONTACT_PHONE ?? '+251911234567',
  contactName: process.env.LOCAL_SEED_CONTACT_NAME ?? 'Local Test Contact',
  templateName: process.env.LOCAL_SEED_TEMPLATE_NAME ?? 'otp-login',
  templateBody: process.env.LOCAL_SEED_TEMPLATE_BODY ?? 'Your OTP is {{code}} and expires in {{minutes}} minutes.',
  providerCode: process.env.LOCAL_SEED_PROVIDER_CODE ?? 'local-http',
  providerName: process.env.LOCAL_SEED_PROVIDER_NAME ?? 'Local HTTP Provider',
  providerUrl: process.env.LOCAL_SEED_PROVIDER_URL ?? 'http://127.0.0.1:65535/mock-provider',
};

function assertLocalSeedAllowed() {
  if (DEFAULTS.appEnv === 'production') {
    throw new Error('Local-only seed is blocked when APP_ENV or NODE_ENV is production.');
  }
}

function printUsage() {
  console.log(`
Usage:
  node scripts/seed-local-admin.mjs
  node scripts/seed-local-admin.mjs --plan

This script seeds a localhost-only tenant, owner account, wallet, sender ID,
template, contact group, contact, routing rule, and pricing records using the
current POSTGRES_* environment values or the defaults from .env.example.
It refuses to run when APP_ENV or NODE_ENV is production.
`);
}

function makePasswordHash(password) {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt.toString('base64url')}$${digest}`;
}

function buildPlan(config) {
  return {
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
    login: {
      email: config.email,
      password: config.password,
      role: config.role,
    },
    seededData: {
      senderId: config.senderId,
      contactGroup: config.contactGroupName,
      contactPhoneNumber: config.contactPhoneNumber,
      template: `${config.templateName}@1`,
      provider: config.providerCode,
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
        priority_tier
      )
      VALUES ($1, $2, 'active', $3, 100, 100, 1)
      ON CONFLICT (code)
      DO UPDATE SET
        name = EXCLUDED.name,
        status = 'active',
        timezone = EXCLUDED.timezone,
        updated_at = now()
      RETURNING id
    `,
    [config.tenantCode, config.tenantName, config.tenantTimezone],
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
        low_balance_threshold_minor
      )
      VALUES ($1, 'ETB', 10000000, 0, 0, 100000)
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        available_balance_minor = GREATEST(wallets.available_balance_minor, EXCLUDED.available_balance_minor),
        low_balance_threshold_minor = EXCLUDED.low_balance_threshold_minor,
        updated_at = now()
      RETURNING id
    `,
    [tenantId],
  );
  return result.rows[0]?.id;
}

async function upsertUser(client, tenantId, config) {
  const passwordHash = makePasswordHash(config.password);
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
      RETURNING id
    `,
    [tenantId, config.email, passwordHash, config.role],
  );
  return result.rows[0]?.id;
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
      VALUES ($1, $2, 'http', $3, $4, 1000, 10, TRUE, 'healthy', $5)
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
      JSON.stringify({ seed: 'local-dev' }),
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
        JSON.stringify(['code', 'minutes']),
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
    [tenantId, config.templateName, config.templateBody, JSON.stringify(['code', 'minutes'])],
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
      INSERT INTO contacts (tenant_id, phone_number, name, source)
      VALUES ($1, $2, $3, 'seed')
      ON CONFLICT (tenant_id, phone_number)
      DO UPDATE SET
        name = EXCLUDED.name,
        source = 'seed',
        updated_at = now()
      RETURNING id
    `,
    [tenantId, config.contactPhoneNumber, config.contactName],
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

async function ensureRoutingRule(client, tenantId, providerId, config) {
  const existing = await client.query(
    `
      SELECT id
      FROM routing_rules
      WHERE tenant_id = $1
        AND name = 'Local primary route'
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
      VALUES ($1, 'Local primary route', 'ET', 'transactional', $2, 'http', 10, 100, 500, 1, TRUE)
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
            AND metadata ->> 'seed' = 'local-dev'
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
            AND metadata ->> 'seed' = 'local-dev'
          LIMIT 1
        `,
        params: [providerId],
      };

  const existing = await client.query(selector.query, selector.params);
  const priceMinor = isSell ? 35 : 20;

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
      [existing.rows[0].id, priceMinor, JSON.stringify({ seed: 'local-dev' })],
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
    [isSell ? tenantId : providerId, priceMinor, JSON.stringify({ seed: 'local-dev' })],
  );
  return inserted.rows[0]?.id;
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

  assertLocalSeedAllowed();

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
    const userId = await upsertUser(client, tenantId, DEFAULTS);
    const providerId = await upsertProvider(client, DEFAULTS);
    const senderIdId = await upsertSenderId(client, tenantId, providerId, DEFAULTS);
    const templateId = await ensureTemplate(client, tenantId, DEFAULTS);
    const groupId = await upsertContactGroup(client, tenantId, DEFAULTS);
    const contactId = await upsertContact(client, tenantId, DEFAULTS);
    await ensureGroupMember(client, groupId, contactId);
    const routingRuleId = await ensureRoutingRule(client, tenantId, providerId, DEFAULTS);
    const sellPricingId = await ensurePricingRule(client, 'sell', tenantId, providerId);
    const costPricingId = await ensurePricingRule(client, 'cost', tenantId, providerId);

    await client.query('COMMIT');

    console.log(JSON.stringify({
      status: 'seeded',
      login: {
        tenantCode: DEFAULTS.tenantCode,
        email: DEFAULTS.email,
        password: DEFAULTS.password,
        role: DEFAULTS.role,
      },
      seededIds: {
        tenantId,
        walletId,
        userId,
        providerId,
        senderIdId,
        templateId,
        groupId,
        contactId,
        routingRuleId,
        sellPricingId,
        costPricingId,
      },
      seededData: {
        senderId: DEFAULTS.senderId,
        contactGroup: DEFAULTS.contactGroupName,
        template: `${DEFAULTS.templateName}@1`,
        providerCode: DEFAULTS.providerCode,
      },
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    if (error && typeof error === 'object' && 'code' in error && error.code === '42P01') {
      const relationMessage = 'message' in error ? String(error.message) : 'relation is missing';
      throw new Error(`Local seed failed because the schema is missing: ${relationMessage}. Run migrations first with \`node scripts/run-migrations.mjs\`.`);
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
