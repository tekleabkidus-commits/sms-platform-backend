# Production Deployment

## Release Order

1. Build and push immutable images.
2. Run the migration job with the target backend image.
3. Apply the production overlay.
4. Wait for API rollout, then dispatch/outbox/DLR workers, then control-plane.
5. Run smoke checks against public endpoints.
6. Watch dashboards and alerts for at least 15 minutes before declaring success.

## Production Notes

- Secrets must be supplied through Kubernetes secrets or external secret operators, never checked into the repo.
- `plain:` secret references remain blocked in production.
- Use PostgreSQL primary + replicas, Redis HA, and Kafka replication before launch.
- Apply `k8s/monitoring` only if the Prometheus Operator CRDs are already installed.
- For DigitalOcean App Platform deployment from GitHub, use [digitalocean-app-platform.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/deployment/digitalocean-app-platform.md) and leave staging-only seed flags disabled.

## Smoke Checks

```bash
SMOKE_BACKEND_URL=https://api.example.com/api/v1/health/ready SMOKE_FRONTEND_URL=https://app.example.com/api/health node scripts/smoke-check.mjs
```

## Rollback Trigger Examples

- sustained API 5xx over 5%
- dispatch failures spiking without provider incident explanation
- outbox backlog climbing after rollout
- readiness probe failures across multiple pods
