# Local Deployment

## Prerequisites

- Node.js 24+
- Docker Desktop or another Docker-compatible runtime
- PostgreSQL, Redis, and Kafka available locally or through Docker Compose

## Backend

```bash
npm ci
copy .env.example .env
node scripts/run-migrations.mjs
cmd /c npm run seed:local
npm run verify
npm run start:dev
```

## Control Plane

```bash
cd control-plane
npm ci
copy .env.example .env.local
npm run test
npm run build
npm run dev
```

## Local Test Login

- tenant code: `local`
- email: `admin@example.com`
- password: `ChangeMe123!`

The local seed script is idempotent, blocked when `APP_ENV` or `NODE_ENV` is `production`, and also provisions:

- an active wallet
- a local HTTP provider and routing rule
- an approved sender ID: `LOCALAPP`
- a starter template: `otp-login@1`
- a contact group with one test contact

## Docker Compose

```bash
docker compose up -d postgres redis zookeeper kafka
docker compose --profile tools run --rm migrate
cmd /c npm run seed:local
docker compose up -d api worker-dispatch worker-dlr worker-outbox worker-campaign worker-fraud worker-reconciliation control-plane
node scripts/smoke-check.mjs
```
