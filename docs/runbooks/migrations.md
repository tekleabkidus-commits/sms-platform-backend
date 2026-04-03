# Migration Runbook

## Standard Procedure

1. Confirm the target backend image has passed CI.
2. Verify PostgreSQL primary health and replica lag.
3. Run `node scripts/prepare-database.mjs` locally against staging first.
4. For Kubernetes, apply `k8s/jobs/migration-job.yaml` with the target backend image.
5. Wait for the migration job to complete before rolling out API or workers.

## Safety Notes

- Apply migrations before worker and API rollout.
- Never start a new backend image that expects a schema the cluster has not migrated to.
- Partition-heavy changes should be run during low-traffic windows.
- The migration runner now uses an advisory lock to avoid concurrent schema changes.

## Failure Handling

- If the migration job fails, do not continue the rollout.
- Inspect the job logs and database transaction state.
- If the failed migration partially modified objects outside a transaction, follow the rollback runbook before retrying.
