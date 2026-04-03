# Rollback Runbook

## Application Rollback

1. Stop the rollout and capture the failing image tag.
2. Roll back deployments in this order:
   - control-plane
   - API
   - workers
3. Keep the migration state in mind before rolling back the backend image.

```bash
kubectl rollout undo deployment/sms-platform-api
kubectl rollout undo deployment/sms-platform-worker-dispatch
kubectl rollout undo deployment/sms-platform-control-plane
```

## Database Rollback

- Prefer forward-fix migrations unless the change is strictly reversible.
- If a rollback migration exists, run it only after confirming application compatibility.
- Restore from backup only when the schema/data state is unsafe and forward-fix is impossible.

## Messaging Safety

- Pause large bulk campaign creation during rollback windows.
- Watch outbox backlog and reconciliation backlog immediately after rollback.
