# Staging Deployment

## Goals

- Regression verification for API, workers, and control-plane
- Provider sandbox validation
- Load-test dry runs against non-production credentials

## Flow

1. Build and push backend and control-plane images.
2. Run the migration job with the new backend image.
3. Apply `k8s/overlays/staging`.
4. Wait for API, dispatch, DLR, outbox, and control-plane rollouts.
5. Run smoke checks and a short k6 scenario.

## Commands

```bash
kustomize build k8s/overlays/staging | kubectl apply -f -
kubectl apply -f k8s/jobs/migration-job.yaml
kubectl rollout status deployment/sms-platform-api --timeout=10m
kubectl rollout status deployment/sms-platform-worker-dispatch --timeout=10m
kubectl rollout status deployment/sms-platform-control-plane --timeout=10m
SMOKE_BACKEND_URL=https://staging-api.example.com/api/v1/health/ready SMOKE_FRONTEND_URL=https://staging-app.example.com/api/health node scripts/smoke-check.mjs
```

## Staging-Specific Guidance

- Use sandbox provider credentials exposed through `env:` secret references.
- Keep test tenants isolated from customer tenant IDs.
- Reset low-balance, sender-approval, and suppression-list fixtures before each regression cycle.
- For DigitalOcean App Platform, follow [digitalocean-app-platform.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/deployment/digitalocean-app-platform.md) and use the staging-only accounts documented in [staging-test-accounts.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/deployment/staging-test-accounts.md).
