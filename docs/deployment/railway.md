# Railway Deployment Guide

This repository is ready to deploy to **Railway from GitHub** without redesigning the app. The recommended approach is:

- use Railway-managed PostgreSQL
- use Railway-managed Redis
- use an external Kafka-compatible broker
- deploy the backend API, control-plane, and workers as **separate Railway services**
- let Railway build from the committed Dockerfiles instead of typing custom build commands

Repository:

- GitHub repo: [tekleabkidus-commits/sms-platform-backend](https://github.com/tekleabkidus-commits/sms-platform-backend)
- branch: `main`

Known backend public domain today:

- [https://sms-platform-backend-production-103d.up.railway.app](https://sms-platform-backend-production-103d.up.railway.app)

## Before You Click Anything

Use these Railway service names exactly so the variable references in the committed env files work without editing:

- `postgres`
- `redis`
- `api`
- `control-plane`
- `worker-dispatch`
- `worker-dlr`
- `worker-outbox`
- `worker-campaign`
- `worker-fraud`
- `worker-reconciliation`

Kafka is expected to be external. Create that outside Railway unless you already have a Kafka-compatible service that exposes equivalent environment values.

## What To Create In Railway

Create one Railway project with:

1. PostgreSQL service named `postgres`
2. Redis service named `redis`
3. Web service named `api`
4. Web service named `control-plane`
5. Worker service named `worker-dispatch`
6. Worker service named `worker-dlr`
7. Worker service named `worker-outbox`
8. Worker service named `worker-campaign`
9. Worker service named `worker-fraud`
10. Worker service named `worker-reconciliation`

## Recommended Deployment Model

### API

- Railway component type: `Web Service`
- repo: `tekleabkidus-commits/sms-platform-backend`
- branch: `main`
- root directory: `/`
- config-as-code path: `/.railway/backend/railway.json`
- build command: leave blank
- start command: leave blank
- port: leave blank, Railway injects `PORT`
- Dockerfile used automatically: [Dockerfile](/C:/Users/Kidus/Documents/sms-platform-backend/Dockerfile)

Paste variables from:

- [RAILWAY_VARIABLES_BACKEND.env](/C:/Users/Kidus/Documents/sms-platform-backend/RAILWAY_VARIABLES_BACKEND.env)

### Control-Plane

- Railway component type: `Web Service`
- repo: `tekleabkidus-commits/sms-platform-backend`
- branch: `main`
- root directory: `/control-plane`
- config-as-code path: `/control-plane/railway.json`
- build command: leave blank
- start command: leave blank
- port: leave blank, Railway injects `PORT`
- Dockerfile used automatically: [control-plane/Dockerfile](/C:/Users/Kidus/Documents/sms-platform-backend/control-plane/Dockerfile)

Paste variables from:

- [RAILWAY_VARIABLES_FRONTEND.env](/C:/Users/Kidus/Documents/sms-platform-backend/RAILWAY_VARIABLES_FRONTEND.env)

### Workers

Create each worker as a separate Railway `Worker` service.

For every worker:

- repo: `tekleabkidus-commits/sms-platform-backend`
- branch: `main`
- root directory: `/`
- config-as-code path: `/.railway/backend/railway.json`
- build command: leave blank
- start command: leave blank
- Dockerfile used automatically: [Dockerfile](/C:/Users/Kidus/Documents/sms-platform-backend/Dockerfile)

Paste variables from:

- [RAILWAY_VARIABLES_WORKERS.env](/C:/Users/Kidus/Documents/sms-platform-backend/RAILWAY_VARIABLES_WORKERS.env)

Then change only `APP_ROLE` per worker:

- `worker-dispatch` -> `APP_ROLE=worker-dispatch`
- `worker-dlr` -> `APP_ROLE=worker-dlr`
- `worker-outbox` -> `APP_ROLE=worker-outbox`
- `worker-campaign` -> `APP_ROLE=worker-campaign`
- `worker-fraud` -> `APP_ROLE=worker-fraud`
- `worker-reconciliation` -> `APP_ROLE=worker-reconciliation`

## What To Fill In Railway, Screen By Screen

### 1. Create the project

1. Open Railway.
2. Click **New Project**.
3. Choose **Deploy from GitHub repo**.
4. Select `tekleabkidus-commits/sms-platform-backend`.
5. Keep branch as `main`.

### 2. Add PostgreSQL

1. Click **New**.
2. Choose **Database**.
3. Choose **PostgreSQL**.
4. Rename the service to `postgres`.

### 3. Add Redis

1. Click **New**.
2. Choose **Database**.
3. Choose **Redis**.
4. Rename the service to `redis`.

### 4. Add the backend API

Use exactly:

- service name: `api`
- root directory: `/`
- config file path: `/.railway/backend/railway.json`
- build command: leave blank
- start command: leave blank

Paste the contents of [RAILWAY_VARIABLES_BACKEND.env](/C:/Users/Kidus/Documents/sms-platform-backend/RAILWAY_VARIABLES_BACKEND.env) into the Variables screen, then replace:

- `KAFKA_BROKERS`
- `KAFKA_SASL_MECHANISM`
- `KAFKA_SASL_USERNAME`
- `KAFKA_SASL_PASSWORD`
- `JWT_PUBLIC_KEY`
- `JWT_PRIVATE_KEY`

### 5. Add the control-plane

Use exactly:

- service name: `control-plane`
- root directory: `/control-plane`
- config file path: `/control-plane/railway.json`
- build command: leave blank
- start command: leave blank

Paste the contents of [RAILWAY_VARIABLES_FRONTEND.env](/C:/Users/Kidus/Documents/sms-platform-backend/RAILWAY_VARIABLES_FRONTEND.env).

### 6. Add the workers

Create these Worker services one by one:

- `worker-dispatch`
- `worker-dlr`
- `worker-outbox`
- `worker-campaign`
- `worker-fraud`
- `worker-reconciliation`

For each one:

- root directory: `/`
- config file path: `/.railway/backend/railway.json`
- build command: leave blank
- start command: leave blank

Paste [RAILWAY_VARIABLES_WORKERS.env](/C:/Users/Kidus/Documents/sms-platform-backend/RAILWAY_VARIABLES_WORKERS.env), then set the correct `APP_ROLE` for that service.

## First Deployment Order

1. Create `postgres`
2. Create `redis`
3. Create `api`
4. Add all required API variables
5. Deploy `api`
6. Open the `api` service shell and run:

```bash
POSTGRES_CREATE_DATABASE_IF_MISSING=false node scripts/prepare-database.mjs
```

7. If this is staging, seed staging-only users:

```bash
APP_ENV=staging ALLOW_STAGING_TEST_USER_SEED=true STAGING_TEST_SHARED_PASSWORD=xSMS-Staging-2026!FRA#7NqLm4Pz node scripts/seed-staging-test-users.mjs
```

8. Deploy worker services
9. Deploy `control-plane`
10. Open the frontend and verify login

## Required Variables By Source

See:

- [RAILWAY_VARIABLES_CHECKLIST.md](/C:/Users/Kidus/Documents/sms-platform-backend/RAILWAY_VARIABLES_CHECKLIST.md)

Short version:

- PostgreSQL values come from Railway PostgreSQL service references
- Redis values come from Railway Redis service references
- Kafka values are manual or external-provider values
- JWT keys are manually generated secrets
- `BACKEND_BASE_URL` and `CORS_ALLOWED_ORIGINS` come from Railway service domain references

## Staging Test Accounts

These are staging/dev only and must never be enabled in production:

- [staging-test-accounts.md](/C:/Users/Kidus/Documents/sms-platform-backend/docs/deployment/staging-test-accounts.md)

Shared temporary password:

- `xSMS-Staging-2026!FRA#7NqLm4Pz`

## How To Seed In Railway

Run these from the **api** service shell:

Database prep:

```bash
POSTGRES_CREATE_DATABASE_IF_MISSING=false node scripts/prepare-database.mjs
```

Staging-only users:

```bash
APP_ENV=staging ALLOW_STAGING_TEST_USER_SEED=true STAGING_TEST_SHARED_PASSWORD=xSMS-Staging-2026!FRA#7NqLm4Pz node scripts/seed-staging-test-users.mjs
```

Preview only:

```bash
APP_ENV=staging ALLOW_STAGING_TEST_USER_SEED=true STAGING_TEST_SHARED_PASSWORD=xSMS-Staging-2026!FRA#7NqLm4Pz node scripts/seed-staging-test-users.mjs --plan
```

## Deployment Verification

Backend:

- `https://<api-public-domain>/api/v1/health/live`
- `https://<api-public-domain>/api/v1/health/ready`
- `https://<api-public-domain>/api/v1/docs`

Frontend:

- `https://<control-plane-public-domain>/api/health`
- login page loads
- login succeeds for staging-only seeded users

Workers:

- each worker deploy stays healthy
- `worker-dispatch` logs Kafka and Redis readiness
- `worker-dlr` logs DLR processor startup
- `worker-outbox` logs outbox relay startup

## Common Railway Troubleshooting

### The backend crashes on boot

Check:

- missing `JWT_PUBLIC_KEY` or `JWT_PRIVATE_KEY`
- bad Kafka values
- bad PostgreSQL or Redis references
- `APP_ROLE` typo

### The frontend loads but all data fails

Check:

- `BACKEND_BASE_URL` points to `http://${{api.RAILWAY_PRIVATE_DOMAIN}}/api/v1`
- the `api` service is healthy
- `CORS_ALLOWED_ORIGINS` on the API includes the control-plane public domain

### Login fails with 401 or 403

Check:

- seeded users were actually created
- backend JWT keys are present
- the control-plane can reach the API private domain
- backend logs for request IDs and auth failures

### Swagger link opens localhost or the wrong URL

Check:

- `NEXT_PUBLIC_BACKEND_SWAGGER_URL`
- if needed, replace it with the known backend URL:
  - `https://sms-platform-backend-production-103d.up.railway.app/api/v1/docs`

### Kafka connectivity fails

Check:

- broker list format
- SASL mechanism
- username/password
- firewall rules on the external Kafka provider

## External Services Review

Recommended outside the app services:

- PostgreSQL: Railway PostgreSQL is fine
- Redis: Railway Redis is fine
- Kafka: use an external Kafka-compatible provider

Do not try to run Kafka inside the frontend or backend service container itself.
