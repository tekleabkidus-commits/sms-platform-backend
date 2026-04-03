# Database Preparation

Use this runbook when you need to make a fresh PostgreSQL instance ready for the SMS platform.

## What The Repo Now Supports

The repository includes a single bootstrap command:

```bash
cmd /c npm run db:prepare
```

It will:

1. load `.env` or `.env.local` automatically if present
2. connect to PostgreSQL
3. create the target database if it is missing and creation is allowed
4. run all SQL migrations
5. verify the required schema exists

## Required Environment Variables

- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`

Optional:

- `POSTGRES_ADMIN_DATABASE`
  Default: `postgres`
- `POSTGRES_CREATE_DATABASE_IF_MISSING`
  Default: `true` outside production
- `POSTGRES_SSL`

## Local Example

```bash
copy .env.example .env
cmd /c npm run db:prepare
cmd /c npm run seed:local
```

## Staging Example

```bash
set APP_ENV=staging
set POSTGRES_SSL=true
set POSTGRES_CREATE_DATABASE_IF_MISSING=false
cmd /c npm run db:prepare
set ALLOW_STAGING_TEST_USER_SEED=true
cmd /c npm run seed:staging-users
```

## Production Example

```bash
set APP_ENV=production
set POSTGRES_SSL=true
set POSTGRES_CREATE_DATABASE_IF_MISSING=false
cmd /c npm run db:prepare
```

In production, keep test-user seeding disabled.

## Safety Notes

- `db:prepare` uses an advisory lock while migrations run.
- `seed:local` and `seed:staging-users` are blocked in production environments.
- `seed:staging-users` requires `ALLOW_STAGING_TEST_USER_SEED=true`.
- The schema verification step checks core tables plus guarded message-state columns.

## Plan Mode

To preview what will happen:

```bash
node scripts/prepare-database.mjs --plan
```
