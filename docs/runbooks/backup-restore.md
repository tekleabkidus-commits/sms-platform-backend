# Backup and Restore Notes

## PostgreSQL

- Use managed backups or `pg_basebackup`/WAL archiving at the platform layer.
- Test restores at least monthly against a staging restore target.
- Keep partition retention aligned with archive/export jobs.

## Redis

- Treat Redis as reconstructable operational state.
- Enable AOF or managed persistence for circuit state and rate-limit resilience, but do not treat Redis as the sole source of truth.

## Kafka

- Size retention for replay and outage absorption.
- Replication factor should be at least 3 in production.

## Restore Drill Checklist

1. restore PostgreSQL to a clean target
2. restore or re-seed Kafka/Redis as appropriate
3. run migrations
4. start API only
5. run smoke checks
6. start workers
7. verify dashboards and tenant-critical flows
