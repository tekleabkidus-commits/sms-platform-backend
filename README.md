# SMS Platform

Carrier-grade multi-tenant SMS platform with:

- NestJS backend
- PostgreSQL + partitioned hot tables
- Kafka outbox, dispatch, retry, DLR, and reconciliation flows
- Redis token buckets and circuit state
- SMPP + HTTP provider connectors
- Next.js control-plane for tenant, admin, and operations workflows

## Repository Layout

```text
sms-platform-backend/
  src/                 Backend API, workers, connectors, metrics, health
  control-plane/       Next.js operational UI
  migrations/          PostgreSQL schema and partition definitions
  scripts/             Migration, smoke-check, and wait helpers
  k8s/                 Kubernetes base manifests and overlays
  load/                k6 scenarios
  docs/                Deployment and runbook documentation
```

## Quick Start

```bash
npm ci
copy .env.example .env
node scripts/run-migrations.mjs
cmd /c npm run seed:local
cmd /c npm run verify
```

Then start the backend:

```bash
cmd /c npm run start:dev
```

And in a second shell:

```bash
cd control-plane
npm ci
cmd /c npm run test:ci
cmd /c npm run dev
```

Local control-plane login after seeding:

- tenant code: `local`
- email: `admin@example.com`
- password: `ChangeMe123!`

## Local Stack with Docker Compose

```bash
docker compose up -d postgres redis zookeeper kafka
docker compose --profile tools run --rm migrate
cmd /c npm run seed:local
docker compose up -d api worker-dispatch worker-dlr worker-outbox worker-campaign worker-fraud worker-reconciliation control-plane
node scripts/smoke-check.mjs
```

## DigitalOcean App Platform

The repository includes a GitHub-backed DigitalOcean App Platform template:

- [.do/deploy.template.yaml](/C:/Users/Kidus/Documents/sms-platform-backend/.do/deploy.template.yaml)

Beginner-friendly deployment instructions live in:

- [digitalocean-app-platform.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/deployment/digitalocean-app-platform.md)
- [staging-test-accounts.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/deployment/staging-test-accounts.md)

## Core Runtime Roles

The backend image is role-aware through `APP_ROLE`:

- `api`
- `worker-dispatch`
- `worker-dlr`
- `worker-outbox`
- `worker-campaign`
- `worker-fraud`
- `worker-reconciliation`
- `all` for local combined mode

Each role exposes health and metrics endpoints for orchestration and monitoring.

## Health and Metrics

- readiness: `/api/v1/health/ready`
- liveness: `/api/v1/health/live`
- startup: `/api/v1/health/startup`
- metrics: `/api/v1/metrics`

Metrics are Prometheus-compatible and include HTTP, auth, submissions, transitions, rate-limit denials, outbox backlog, DLR backlog, retries, provider circuit state, wallet operations, and campaign gauges.

## Verification Commands

Backend:

```bash
cmd /c npm run verify
```

Control-plane:

```bash
cd control-plane
cmd /c npm run test:ci
```

Smoke:

```bash
node scripts/smoke-check.mjs
```

Kubernetes manifests:

```bash
cmd /c npm run validate:manifests
```

## Deployment Assets

- backend Dockerfile: [Dockerfile](/C:/Users/Kidus/Documents/sms-platform-backend/Dockerfile)
- control-plane Dockerfile: [Dockerfile](/C:/Users/Kidus/Documents/sms-platform-backend/control-plane/Dockerfile)
- compose stack: [docker-compose.yml](/C:/Users/Kidus/Documents/sms-platform-backend/docker-compose.yml)
- Kubernetes base/overlays: [k8s](/C:/Users/Kidus/Documents/sms-platform-backend/k8s)
- CI/CD workflows: [.github/workflows](/C:/Users/Kidus/Documents/sms-platform-backend/.github/workflows)

## Runbooks

- local deployment: [local.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/deployment/local.md)
- staging deployment: [staging.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/deployment/staging.md)
- production deployment: [production.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/deployment/production.md)
- migrations: [migrations.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/runbooks/migrations.md)
- rollback: [rollback.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/runbooks/rollback.md)
- incident triage: [incident-triage.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/runbooks/incident-triage.md)
- provider outage: [provider-outage.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/runbooks/provider-outage.md)
- outbox backlog: [outbox-backlog.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/runbooks/outbox-backlog.md)
- DLR backlog: [dlr-backlog.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/runbooks/dlr-backlog.md)
- backup/restore: [backup-restore.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/runbooks/backup-restore.md)
- load testing: [load-testing.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/runbooks/load-testing.md)
- verification: [verification.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/runbooks/verification.md)

## Secrets

- application secrets are injected through environment variables or Kubernetes secrets
- SMPP/provider credentials should use `env:` secret references
- `plain:` secret references stay blocked outside explicit development/test mode

## Known Limits

- cloud-managed backups, external secret managers, and provider IP allow-listing remain platform/operator concerns outside repository code
- Prometheus Operator resources in `k8s/monitoring` assume the cluster already has those CRDs installed
