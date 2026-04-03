import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('migration schema', () => {
  const migration = readFileSync(join(__dirname, '..', 'migrations', '001_init.sql'), 'utf8');

  it('contains the hardened phase 1 and 2 tables and columns', () => {
    expect(migration).toContain('CREATE TABLE retry_policies');
    expect(migration).toContain('CREATE TABLE provider_circuit_state');
    expect(migration).toContain('CREATE TABLE audit_logs');
    expect(migration).toContain('CREATE TABLE opt_outs');
    expect(migration).toContain('CREATE TABLE suppression_lists');
    expect(migration).toContain('CREATE TABLE reconciliation_events');
    expect(migration).toContain('version INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('state_changed_at TIMESTAMPTZ NOT NULL DEFAULT now()');
    expect(migration).toContain('timezone VARCHAR(64) NOT NULL DEFAULT \'UTC\'');
    expect(migration).toContain('key_salt BYTEA NOT NULL');
    expect(migration).toContain('last_rotated_at TIMESTAMPTZ');
  });

  it('includes indexes for outbox, DLR correlation, and reconciliation lookups', () => {
    expect(migration).toContain('CREATE INDEX idx_outbox_status_created');
    expect(migration).toContain('CREATE INDEX idx_messages_provider_msgid');
    expect(migration).toContain('CREATE INDEX idx_dlr_webhooks_provider_msgid');
    expect(migration).toContain('CREATE INDEX idx_reconciliation_events_lookup');
  });

  it('protects message transitions at the database layer', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION enforce_message_state_transition()');
    expect(migration).toContain('CREATE TRIGGER trg_messages_enforce_state_transition');
    expect(migration).toContain('illegal message status transition');
  });
});
