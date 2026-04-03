# DigitalOcean App Platform Deployment

This repository is prepared for **DigitalOcean App Platform deployment from GitHub** with the app name slug `x-sms` in region `fra`.

The committed App Platform template is:

- [.do/deploy.template.yaml](/C:/Users/Kidus/Documents/sms-platform-backend/.do/deploy.template.yaml)

Use it as the source of truth for component structure, runtime commands, and environment keys.

## What To Deploy

Use **GitHub source components**, not embedded databases or in-app brokers.

External or managed dependencies:

- PostgreSQL: external managed database
- Redis: external managed cache
- Kafka: external managed Kafka-compatible broker

Do **not** try to run PostgreSQL, Redis, or Kafka inside App Platform app components for this platform.

## Components

| Component | App Platform Type | Source Directory | Build Command | Run Command |
| --- | --- | --- | --- | --- |
| `control-plane` | Service | `control-plane` | `npm run lint && npm run typecheck` | `npm run start` |
| `api` | Service | `.` | `npm run typecheck` | `npm run start:api` |
| `worker-dispatch` | Worker | `.` | `npm run typecheck` | `npm run start:worker-dispatch` |
| `worker-dlr` | Worker | `.` | `npm run typecheck` | `npm run start:worker-dlr` |
| `worker-outbox` | Worker | `.` | `npm run typecheck` | `npm run start:worker-outbox` |
| `worker-campaign` | Worker | `.` | `npm run typecheck` | `npm run start:worker-campaign` |
| `worker-fraud` | Worker | `.` | `npm run typecheck` | `npm run start:worker-fraud` |
| `worker-reconciliation` | Worker | `.` | `npm run typecheck` | `npm run start:worker-reconciliation` |

Notes:

- App Platform's Node buildpack already installs dependencies and runs the normal Node build lifecycle.
- The explicit build commands above are kept for validation and clarity.
- The `api` service is routed publicly at `/backend`.
- The `control-plane` service is routed publicly at `/`.

## Beginner-Friendly First Deployment

### 1. Create the app from GitHub

1. In the DigitalOcean control panel, open **App Platform**.
2. Choose **Create App**.
3. Select **GitHub** as the source.
4. Choose repository `tekleabkidus-commits/sms-platform-backend`.
5. Choose branch `main`.
6. In the App Spec editor, load the contents of [.do/deploy.template.yaml](/C:/Users/Kidus/Documents/sms-platform-backend/.do/deploy.template.yaml).

### 2. Choose staging or production

Before the first deploy, decide whether this app is staging or production:

- staging:
  - set `spec.name` to `x-sms-staging`
  - set `APP_ENV=staging`
  - set `NEXT_PUBLIC_APP_ENV=staging`
  - keep starter instance counts at `1`
- production:
  - keep `spec.name` as `x-sms`
  - keep `APP_ENV=production`
  - keep `NEXT_PUBLIC_APP_ENV=production`
  - increase component counts after staging signoff

### 3. Fill in required environment values

The template includes the required environment keys. Replace the managed-service placeholders with real values before the first deploy.

Required secrets and connection values:

| Key | Scope | Notes |
| --- | --- | --- |
| `APP_ENV` | backend + workers | `staging` or `production` |
| `NODE_ENV` | all backend components | keep `production` on App Platform |
| `POSTGRES_HOST` | backend + workers | managed PostgreSQL hostname |
| `POSTGRES_PORT` | backend + workers | managed PostgreSQL port |
| `POSTGRES_USER` | backend + workers | managed PostgreSQL username |
| `POSTGRES_PASSWORD` | backend + workers | secret |
| `POSTGRES_DATABASE` | backend + workers | database name |
| `REDIS_HOST` | backend + workers | managed Redis hostname |
| `REDIS_PORT` | backend + workers | managed Redis port |
| `REDIS_USERNAME` | backend + workers | use `default` if provider requires it |
| `REDIS_PASSWORD` | backend + workers | secret |
| `KAFKA_BROKERS` | backend + workers | comma-separated brokers |
| `KAFKA_SASL_USERNAME` | backend + workers | managed Kafka username if used |
| `KAFKA_SASL_PASSWORD` | backend + workers | secret |
| `JWT_PUBLIC_KEY` | backend + workers | RS256 public key PEM |
| `JWT_PRIVATE_KEY` | backend + workers | RS256 private key PEM |
| `BACKEND_BASE_URL` | control-plane | keep `http://api:8080/api/v1` |
| `NEXT_PUBLIC_BACKEND_SWAGGER_URL` | control-plane | keep `/backend/api/v1/docs` |
| `NEXT_PUBLIC_APP_ENV` | control-plane | `staging` or `production` |

Safe defaults already present in the template:

- `HOST=0.0.0.0`
- `API_PREFIX=api/v1`
- `TRUST_PROXY=true`
- `POSTGRES_SSL=true`
- `KAFKA_SSL=true`
- `ALLOW_INSECURE_PLAIN_SECRETS=false`
- circuit-breaker, outbox, timeout, and SMPP defaults

## Recommended Deployment Order

1. Deploy the **API** service.
2. Verify `/backend/api/v1/health/ready`.
3. Deploy the **worker** components.
4. Deploy the **control-plane** service.
5. Seed **staging-only** test users if this is a non-production environment.
6. Run smoke checks from the control-plane and the backend health endpoints.

## Staging Test Accounts

See [staging-test-accounts.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/deployment/staging-test-accounts.md).

Seed command from the repository root:

```bash
APP_ENV=staging ALLOW_STAGING_TEST_USER_SEED=true STAGING_TEST_SHARED_PASSWORD=xSMS-Staging-2026!FRA#7NqLm4Pz node scripts/seed-staging-test-users.mjs
```

On App Platform, run the same command from the **API component console** after the app has been deployed successfully.

## What To Verify After Deployment

Backend:

- `https://<default-app-domain>/backend/api/v1/health/live`
- `https://<default-app-domain>/backend/api/v1/health/ready`
- `https://<default-app-domain>/backend/api/v1/docs`

Control-plane:

- `https://<default-app-domain>/api/health`
- login page loads
- role-based seeded users can authenticate in staging

Runtime checks:

- outbox worker starts and stays healthy
- dispatch worker connects to Kafka and Redis
- DLR worker starts without circuit-breaker or dependency errors
- logs include request IDs and component role names

## Scaling Guidance

Safe starter sizes from the template:

- `control-plane`: `apps-s-1vcpu-0.5gb`
- `api`: `apps-s-1vcpu-1gb`
- `worker-dispatch`: `apps-s-1vcpu-1gb`
- other workers: `apps-s-1vcpu-0.5gb`

Before production launch, raise at least:

- `api` replicas above `1`
- `worker-dispatch` replicas above `1`
- `worker-outbox` replicas above `1`

Keep PostgreSQL, Redis, and Kafka managed outside the app and sized independently.

## Production Safety Notes

- Never commit real production secrets into the repository.
- Do not enable `ALLOW_STAGING_TEST_USER_SEED` in production.
- Keep `ALLOW_INSECURE_PLAIN_SECRETS=false`.
- Use only provider sandbox credentials in staging.
- Update sender approvals, routing rules, and pricing before switching production traffic.

## Optional CLI Deployment

If you use `doctl`:

```bash
doctl apps create --spec .do/deploy.template.yaml
```

Edit `.do/deploy.template.yaml` first so the managed-service values, `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, and app name match your target environment.
