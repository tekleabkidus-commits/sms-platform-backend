CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  default_currency CHAR(3) NOT NULL DEFAULT 'ETB',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Addis_Ababa',
  api_rate_limit_rps INTEGER NOT NULL DEFAULT 100,
  submit_tps_limit INTEGER NOT NULL DEFAULT 100,
  priority_tier SMALLINT NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE wallets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  currency CHAR(3) NOT NULL DEFAULT 'ETB',
  available_balance_minor BIGINT NOT NULL DEFAULT 0,
  reserved_balance_minor BIGINT NOT NULL DEFAULT 0,
  credit_limit_minor BIGINT NOT NULL DEFAULT 0,
  low_balance_threshold_minor BIGINT NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE providers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  default_protocol VARCHAR(16) NOT NULL CHECK (default_protocol IN ('smpp', 'http')),
  supported_protocols JSONB NOT NULL DEFAULT '["http"]'::jsonb,
  http_base_url TEXT,
  max_global_tps INTEGER NOT NULL DEFAULT 100,
  priority SMALLINT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  health_status VARCHAR(20) NOT NULL DEFAULT 'healthy',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE smpp_configs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id BIGINT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL,
  system_id VARCHAR(100) NOT NULL,
  secret_ref TEXT NOT NULL,
  bind_mode VARCHAR(20) NOT NULL DEFAULT 'transceiver',
  max_sessions INTEGER NOT NULL DEFAULT 10,
  session_tps INTEGER NOT NULL DEFAULT 50,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE routing_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  country_code VARCHAR(8) NOT NULL DEFAULT 'ET',
  network_code VARCHAR(16),
  traffic_type VARCHAR(20) NOT NULL DEFAULT 'transactional',
  provider_id BIGINT NOT NULL REFERENCES providers(id),
  smpp_config_id BIGINT REFERENCES smpp_configs(id),
  preferred_protocol VARCHAR(16) CHECK (preferred_protocol IN ('http', 'smpp')),
  priority INTEGER NOT NULL DEFAULT 100,
  weight INTEGER NOT NULL DEFAULT 100,
  max_tps INTEGER,
  cost_rank INTEGER NOT NULL DEFAULT 100,
  failover_order INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pricing_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('sell', 'cost')),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id BIGINT REFERENCES providers(id) ON DELETE CASCADE,
  country_code VARCHAR(8) NOT NULL DEFAULT 'ET',
  network_code VARCHAR(16),
  traffic_type VARCHAR(20) NOT NULL DEFAULT 'transactional',
  parts_from SMALLINT NOT NULL DEFAULT 1,
  parts_to SMALLINT NOT NULL DEFAULT 10,
  unit_price_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ETB',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE retry_policies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id BIGINT REFERENCES providers(id) ON DELETE CASCADE,
  traffic_type VARCHAR(20),
  max_attempts INTEGER NOT NULL DEFAULT 3,
  retry_intervals JSONB NOT NULL DEFAULT '[5,30,300]'::jsonb,
  retry_on_errors JSONB NOT NULL DEFAULT '["timeout","throttle","http_provider_error","provider_dispatch_exception","circuit_open"]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE provider_circuit_state (
  provider_id BIGINT PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
  state VARCHAR(20) NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half_open')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  opened_reason TEXT,
  last_changed TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_probe_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaigns (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  source_type VARCHAR(20) NOT NULL DEFAULT 'api',
  scheduled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaign_schedules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  template_ref VARCHAR(100) NOT NULL,
  sender_id VARCHAR(20) NOT NULL,
  contact_group_id BIGINT,
  contact_upload_id BIGINT,
  recurrence_cron VARCHAR(64),
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  next_run_at TIMESTAMPTZ NOT NULL,
  shard_count INTEGER NOT NULL DEFAULT 4,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaign_jobs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_upload_id BIGINT,
  source_type VARCHAR(20) NOT NULL DEFAULT 'api',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  total_records BIGINT NOT NULL DEFAULT 0,
  processed_records BIGINT NOT NULL DEFAULT 0,
  accepted_records BIGINT NOT NULL DEFAULT 0,
  failed_records BIGINT NOT NULL DEFAULT 0,
  shard_count INTEGER NOT NULL DEFAULT 1,
  priority SMALLINT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE contacts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  name VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source VARCHAR(20) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone_number)
);

CREATE TABLE contact_groups (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE contact_group_members (
  group_id BIGINT NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
  contact_id BIGINT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, contact_id)
);

CREATE TABLE contact_uploads (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  target_group_id BIGINT REFERENCES contact_groups(id) ON DELETE SET NULL,
  storage_uri TEXT NOT NULL,
  original_file_name VARCHAR(255) NOT NULL,
  checksum_sha256 CHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'uploaded',
  total_rows BIGINT NOT NULL DEFAULT 0,
  valid_rows BIGINT NOT NULL DEFAULT 0,
  invalid_rows BIGINT NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE contact_upload_errors (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_upload_id BIGINT NOT NULL REFERENCES contact_uploads(id) ON DELETE CASCADE,
  row_number BIGINT NOT NULL,
  raw_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE campaign_jobs
  ADD CONSTRAINT fk_campaign_jobs_contact_uploads
  FOREIGN KEY (contact_upload_id) REFERENCES contact_uploads(id) ON DELETE SET NULL;

ALTER TABLE campaign_schedules
  ADD CONSTRAINT fk_campaign_schedules_contact_groups
  FOREIGN KEY (contact_group_id) REFERENCES contact_groups(id) ON DELETE SET NULL;

ALTER TABLE campaign_schedules
  ADD CONSTRAINT fk_campaign_schedules_contact_uploads
  FOREIGN KEY (contact_upload_id) REFERENCES contact_uploads(id) ON DELETE SET NULL;

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key_prefix VARCHAR(16) NOT NULL UNIQUE,
  key_hash TEXT NOT NULL,
  key_salt BYTEA NOT NULL,
  name VARCHAR(100) NOT NULL,
  scopes JSONB NOT NULL DEFAULT '["sms:send"]'::jsonb,
  rate_limit_rps INTEGER,
  daily_quota BIGINT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  last_rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sender_ids (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id BIGINT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  sender_name VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_id, sender_name)
);

CREATE TABLE templates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_key UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  body TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  merge_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fraud_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  rule_type VARCHAR(32) NOT NULL,
  action VARCHAR(16) NOT NULL,
  values JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE opt_outs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone_number)
);

CREATE TABLE suppression_lists (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone_number)
);

CREATE TABLE messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  submit_date DATE NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES campaigns(id) ON DELETE SET NULL,
  client_message_id VARCHAR(100),
  api_idempotency_key VARCHAR(128),
  source_addr VARCHAR(32),
  phone_number VARCHAR(20) NOT NULL,
  body TEXT NOT NULL,
  encoding VARCHAR(16) NOT NULL DEFAULT 'gsm7',
  message_parts SMALLINT NOT NULL DEFAULT 1,
  traffic_type VARCHAR(20) NOT NULL DEFAULT 'transactional',
  priority SMALLINT NOT NULL DEFAULT 5,
  status VARCHAR(32) NOT NULL DEFAULT 'accepted',
  billing_state VARCHAR(20) NOT NULL DEFAULT 'pending',
  provider_id BIGINT REFERENCES providers(id) ON DELETE SET NULL,
  smpp_config_id BIGINT REFERENCES smpp_configs(id) ON DELETE SET NULL,
  route_rule_id BIGINT REFERENCES routing_rules(id) ON DELETE SET NULL,
  provider_message_id VARCHAR(128),
  price_minor BIGINT NOT NULL DEFAULT 0,
  cost_minor BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'ETB',
  attempt_count SMALLINT NOT NULL DEFAULT 0,
  last_error_code VARCHAR(40),
  last_error_message TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  template_ref VARCHAR(100),
  body_hash CHAR(64),
  version INTEGER NOT NULL DEFAULT 0,
  state_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (submit_date, tenant_id, id)
) PARTITION BY RANGE (submit_date);

CREATE TABLE messages_default PARTITION OF messages DEFAULT;

CREATE OR REPLACE FUNCTION enforce_message_state_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'messages.version must increment by exactly 1';
  END IF;

  IF NEW.state_changed_at <= OLD.state_changed_at THEN
    RAISE EXCEPTION 'messages.state_changed_at must move forward';
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'accepted' AND NEW.status = 'routed' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'routed' AND NEW.status = 'submitting' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'submitting' AND NEW.status IN ('provider_accepted', 'failed') THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'provider_accepted' AND NEW.status = 'delivered' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'provider_accepted'
    AND NEW.status = 'failed'
    AND COALESCE(NEW.last_error_code, '') = 'dlr_failed' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'illegal message status transition % -> %', OLD.status, NEW.status;
END;
$$;

CREATE TRIGGER trg_messages_enforce_state_transition
BEFORE UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION enforce_message_state_transition();

CREATE TABLE message_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  log_date DATE NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_submit_date DATE NOT NULL,
  message_id BIGINT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  status_from VARCHAR(32),
  status_to VARCHAR(32),
  provider_id BIGINT REFERENCES providers(id) ON DELETE SET NULL,
  provider_message_id VARCHAR(128),
  attempt_no SMALLINT NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (log_date, id)
) PARTITION BY RANGE (log_date);

CREATE TABLE message_logs_default PARTITION OF message_logs DEFAULT;

CREATE TABLE transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  ledger_date DATE NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wallet_id BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  message_submit_date DATE,
  message_id BIGINT,
  campaign_id BIGINT REFERENCES campaigns(id) ON DELETE SET NULL,
  provider_id BIGINT REFERENCES providers(id) ON DELETE SET NULL,
  kind VARCHAR(20) NOT NULL,
  amount_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ETB',
  balance_before_minor BIGINT NOT NULL,
  balance_after_minor BIGINT NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ledger_date, id)
) PARTITION BY RANGE (ledger_date);

CREATE TABLE transactions_default PARTITION OF transactions DEFAULT;

CREATE TABLE outbox_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  topic_name VARCHAR(100) NOT NULL,
  partition_key VARCHAR(100) NOT NULL,
  dedupe_key VARCHAR(150) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  retry_count SMALLINT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  PRIMARY KEY (event_date, id)
) PARTITION BY RANGE (event_date);

CREATE TABLE outbox_events_default PARTITION OF outbox_events DEFAULT;

CREATE TABLE dlr_webhooks (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  provider_id BIGINT REFERENCES providers(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  provider_message_id VARCHAR(128),
  callback_id VARCHAR(128),
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL,
  normalized_status VARCHAR(32),
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processing_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  PRIMARY KEY (received_date, id)
) PARTITION BY RANGE (received_date);

CREATE TABLE dlr_webhooks_default PARTITION OF dlr_webhooks DEFAULT;

CREATE TABLE audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id VARCHAR(100),
  source_ip INET,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (log_date, id)
) PARTITION BY RANGE (log_date);

CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

CREATE TABLE provider_health_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  provider_id BIGINT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  smpp_config_id BIGINT REFERENCES smpp_configs(id) ON DELETE SET NULL,
  protocol VARCHAR(16) NOT NULL CHECK (protocol IN ('smpp', 'http')),
  status VARCHAR(20) NOT NULL,
  latency_ms INTEGER,
  error_rate NUMERIC(5,4),
  success_tps INTEGER,
  throttle_count INTEGER NOT NULL DEFAULT 0,
  sample_window_sec INTEGER NOT NULL DEFAULT 60,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (recorded_date, id)
) PARTITION BY RANGE (recorded_date);

CREATE TABLE provider_health_logs_default PARTITION OF provider_health_logs DEFAULT;

CREATE TABLE reconciliation_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id BIGINT REFERENCES providers(id) ON DELETE SET NULL,
  message_submit_date DATE,
  message_id BIGINT,
  kind VARCHAR(50) NOT NULL,
  reason VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_date, id)
) PARTITION BY RANGE (event_date);

CREATE TABLE reconciliation_events_default PARTITION OF reconciliation_events DEFAULT;

CREATE TABLE archival_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL,
  partition_name VARCHAR(150) NOT NULL,
  storage_uri TEXT NOT NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'pending',
  checksum_sha256 CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_users_tenant_active ON users (tenant_id, is_active);
CREATE INDEX idx_routing_rules_lookup ON routing_rules (tenant_id, traffic_type, is_active, priority, failover_order);
CREATE INDEX idx_pricing_rules_sell_lookup ON pricing_rules (kind, tenant_id, country_code, traffic_type, effective_from DESC);
CREATE INDEX idx_pricing_rules_cost_lookup ON pricing_rules (kind, provider_id, country_code, traffic_type, effective_from DESC);
CREATE INDEX idx_retry_policies_lookup ON retry_policies (tenant_id, provider_id, traffic_type, is_active);
CREATE INDEX idx_sender_ids_tenant_status ON sender_ids (tenant_id, status);
CREATE INDEX idx_templates_tenant_name ON templates (tenant_id, name, version DESC);
CREATE INDEX idx_fraud_rules_tenant_active ON fraud_rules (tenant_id, is_active);
CREATE INDEX idx_contacts_tenant_phone ON contacts (tenant_id, phone_number);
CREATE INDEX idx_contact_upload_errors_upload_row ON contact_upload_errors (contact_upload_id, row_number);
CREATE INDEX idx_opt_outs_tenant_phone ON opt_outs (tenant_id, phone_number) WHERE is_active = TRUE;
CREATE INDEX idx_suppression_lists_tenant_phone ON suppression_lists (tenant_id, phone_number) WHERE is_active = TRUE;
CREATE INDEX idx_campaign_jobs_tenant_status_created ON campaign_jobs (tenant_id, status, created_at DESC);
CREATE INDEX idx_campaign_schedules_next_run ON campaign_schedules (is_active, next_run_at);
CREATE INDEX idx_messages_tenant_status ON messages (tenant_id, status, accepted_at DESC);
CREATE INDEX idx_messages_phone_number ON messages (tenant_id, phone_number, accepted_at DESC);
CREATE INDEX idx_messages_provider_msgid ON messages (provider_id, provider_message_id);
CREATE INDEX idx_messages_phone_sent_at ON messages (tenant_id, phone_number, sent_at DESC) WHERE sent_at IS NOT NULL;
CREATE INDEX idx_messages_tenant_api_key ON messages (tenant_id, api_key_id, accepted_at DESC);
CREATE UNIQUE INDEX uq_messages_api_idempotency ON messages (submit_date, tenant_id, api_idempotency_key);
CREATE INDEX idx_message_logs_message ON message_logs (tenant_id, message_submit_date, message_id, created_at DESC);
CREATE INDEX idx_transactions_tenant_created ON transactions (tenant_id, created_at DESC);
CREATE UNIQUE INDEX uq_transactions_idempotency ON transactions (ledger_date, tenant_id, idempotency_key);
CREATE INDEX idx_api_keys_tenant_active ON api_keys (tenant_id, is_active);
CREATE INDEX idx_outbox_status_created ON outbox_events (status, next_attempt_at, created_at);
CREATE INDEX idx_outbox_tenant_created ON outbox_events (tenant_id, created_at DESC);
CREATE UNIQUE INDEX uq_outbox_dedupe ON outbox_events (event_date, dedupe_key);
CREATE INDEX idx_dlr_webhooks_processed_received ON dlr_webhooks (processed, received_at);
CREATE INDEX idx_dlr_webhooks_provider_msgid ON dlr_webhooks (provider_id, provider_message_id);
CREATE UNIQUE INDEX uq_dlr_webhooks_callback_id ON dlr_webhooks (received_date, provider_id, callback_id) WHERE callback_id IS NOT NULL;
CREATE INDEX idx_audit_logs_tenant_created ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_provider_health_provider_time ON provider_health_logs (provider_id, recorded_at DESC);
CREATE INDEX idx_reconciliation_events_lookup ON reconciliation_events (status, created_at DESC, provider_id);
