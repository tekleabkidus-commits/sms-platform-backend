# Railway Variables Checklist

These files are the copy-paste sources for Railway:

- [RAILWAY_VARIABLES_BACKEND.env](/C:/Users/Kidus/Documents/sms-platform-backend/RAILWAY_VARIABLES_BACKEND.env)
- [RAILWAY_VARIABLES_FRONTEND.env](/C:/Users/Kidus/Documents/sms-platform-backend/RAILWAY_VARIABLES_FRONTEND.env)
- [RAILWAY_VARIABLES_WORKERS.env](/C:/Users/Kidus/Documents/sms-platform-backend/RAILWAY_VARIABLES_WORKERS.env)

## Recommended Railway Service Names

Use these exact Railway service names so the variable references work without edits:

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

Kafka is expected to be **external** rather than a Railway-managed service.

## Safe Defaults

These values can usually be pasted as-is:

- `NODE_ENV=production`
- `APP_ENV=production`
- `HOST=0.0.0.0`
- `API_PREFIX=api/v1`
- `LOG_LEVEL=log`
- `TRUST_PROXY=true`
- `SHUTDOWN_TIMEOUT_MS=15000`
- `POSTGRES_MAX_POOL=20`
- `POSTGRES_SSL=true`
- `REDIS_DB=0`
- `KAFKA_CLIENT_ID=sms-platform-backend`
- `KAFKA_GROUP_ID=sms-platform-backend`
- `KAFKA_SSL=true`
- `HTTP_PROVIDER_TIMEOUT_MS=10000`
- `PROVIDER_UNKNOWN_OUTCOME_TIMEOUT_MS=15000`
- `OUTBOX_BATCH_SIZE=100`
- `OUTBOX_PUBLISH_LEASE_SECONDS=300`
- `ALLOW_INSECURE_PLAIN_SECRETS=false`
- `PROMETHEUS_DEFAULT_METRICS=true`
- `SMPP_ENQUIRE_LINK_SECONDS=30`
- `SMPP_DEFAULT_WINDOW_SIZE=16`
- `CIRCUIT_BREAKER_FAILURE_THRESHOLD=3`
- `CIRCUIT_BREAKER_OPEN_SECONDS=60`
- `CIRCUIT_BREAKER_HALF_OPEN_PROBE_SECONDS=10`
- `HOSTNAME=0.0.0.0` for the control-plane
- `NEXT_PUBLIC_APP_ENV=production` for the production control-plane

## Must Come From Railway PostgreSQL

- `POSTGRES_HOST=${{postgres.PGHOST}}`
- `POSTGRES_PORT=${{postgres.PGPORT}}`
- `POSTGRES_USER=${{postgres.PGUSER}}`
- `POSTGRES_PASSWORD=${{postgres.PGPASSWORD}}`
- `POSTGRES_DATABASE=${{postgres.PGDATABASE}}`

## Must Come From Railway Redis

- `REDIS_HOST=${{redis.REDISHOST}}`
- `REDIS_PORT=${{redis.REDISPORT}}`
- `REDIS_USERNAME=${{redis.REDISUSER}}`
- `REDIS_PASSWORD=${{redis.REDISPASSWORD}}`

## Must Come From Railway Service Discovery

- `BACKEND_BASE_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}/api/v1`
- `NEXT_PUBLIC_BACKEND_SWAGGER_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}/api/v1/docs`
- `CORS_ALLOWED_ORIGINS=https://${{control-plane.RAILWAY_PUBLIC_DOMAIN}}`

## Must Be Entered Manually By The User

- `JWT_PUBLIC_KEY`
- `JWT_PRIVATE_KEY`
- `KAFKA_BROKERS`
- `KAFKA_SASL_MECHANISM`
- `KAFKA_SASL_USERNAME`
- `KAFKA_SASL_PASSWORD`

## Railway-Provided Automatically

Do not manually create these unless you have a special reason:

- `PORT`
- `RAILWAY_PUBLIC_DOMAIN`
- `RAILWAY_PRIVATE_DOMAIN`
- `RAILWAY_ENVIRONMENT`
- `RAILWAY_SERVICE_NAME`

## Role-Specific Values

API service:

- `APP_ROLE=api`

Workers:

- `APP_ROLE=worker-dispatch`
- `APP_ROLE=worker-dlr`
- `APP_ROLE=worker-outbox`
- `APP_ROLE=worker-campaign`
- `APP_ROLE=worker-fraud`
- `APP_ROLE=worker-reconciliation`

## Optional Later Variables

- `CORS_ALLOWED_ORIGINS` with additional custom domains
- provider-specific SMPP secret references
- staging-only seed variables:
  - `ALLOW_STAGING_TEST_USER_SEED=true`
  - `STAGING_TEST_SHARED_PASSWORD=<shared-temporary-password>`
  - `STAGING_TEST_TENANT_CODE=staging`
