# Staging-Only Test Accounts

These accounts exist only for **development and staging validation**. They must never be seeded into or used from a production environment.

## Shared Temporary Password

`xSMS-Staging-2026!FRA#7NqLm4Pz`

Rotate or disable these accounts after the staging validation window.

## Tenant

- tenant code: `staging`
- tenant name: `X SMS Staging`

## Seeded Accounts

| Role | Email |
| --- | --- |
| `owner` | `owner@x-sms.local` |
| `admin` | `admin@x-sms.local` |
| `finance` | `finance@x-sms.local` |
| `support` | `support@x-sms.local` |
| `developer` | `developer@x-sms.local` |
| `viewer` | `viewer@x-sms.local` |

## What Else The Seed Creates

- active tenant wallet with test balance
- staging HTTP provider and default routing rule
- sell and cost pricing fixtures
- approved sender ID `XSMSQA`
- starter template `otp-staging@1`
- contact group `Staging QA Group`
- one seeded contact `+251911111111`

## Safety Guard

The seed script refuses to run unless **all** of the following are true:

- `APP_ENV` or `NODE_ENV` is `development`, `test`, or `staging`
- `ALLOW_STAGING_TEST_USER_SEED=true`

If `APP_ENV` or `NODE_ENV` is `production`, the script exits immediately.

## Commands

From the repository root:

```bash
copy .env.example .env
set APP_ENV=staging
set ALLOW_STAGING_TEST_USER_SEED=true
set STAGING_TEST_SHARED_PASSWORD=xSMS-Staging-2026!FRA#7NqLm4Pz
cmd /c npm run migrate
cmd /c npm run seed:staging-users
```

To preview the plan without mutating the database:

```bash
cmd /c npm run seed:staging-users -- --plan
```

## DigitalOcean App Platform

Run the same command from the **API component console** after the app is deployed and the managed database, Redis, and Kafka environment variables are in place:

```bash
APP_ENV=staging ALLOW_STAGING_TEST_USER_SEED=true STAGING_TEST_SHARED_PASSWORD=xSMS-Staging-2026!FRA#7NqLm4Pz node scripts/seed-staging-test-users.mjs
```

Do not set `ALLOW_STAGING_TEST_USER_SEED=true` in the long-lived production app configuration.
