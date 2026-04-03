# Load Testing Guide

## Target Scenarios

- single-message API submit
- campaign scheduling pressure
- DLR ingest throughput
- mixed transactional and bulk load

## Example

```bash
TARGET_BASE_URL=http://localhost:3000/api/v1 API_KEY=... SENDER_ID=TEST k6 run load/k6/single-submit.js
TARGET_BASE_URL=https://staging-api.example.com/api/v1 BEARER_TOKEN=... CONTACT_GROUP_ID=1 SENDER_ID=TEST ALLOW_PRODUCTION_TARGET=true k6 run load/k6/campaign-schedule.js
```

## Rules

- never run against production without explicit approval and `ALLOW_PRODUCTION_TARGET=true`
- use test tenants and provider sandboxes in staging
- correlate k6 results with Prometheus and database metrics, not just HTTP latency
