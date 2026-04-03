# Load Testing

This directory contains k6 scenarios for staged validation of API submit throughput, campaign scheduling pressure, DLR ingress, and mixed operational traffic.

## Safety

The scripts refuse to run against non-local targets unless `ALLOW_PRODUCTION_TARGET=true` is set explicitly.

## Environment Variables

- `TARGET_BASE_URL`
  Base backend URL, for example `http://localhost:3000/api/v1`
- `API_KEY`
  API key for `/messages`
- `BEARER_TOKEN`
  JWT token for authenticated control-plane style endpoints
- `TENANT_ID`
  Tenant identifier used for seeded test data
- `CONTACT_GROUP_ID`
  Contact group to use for campaign schedule scenarios
- `SENDER_ID`
  Sender ID to use for send scenarios
- `PROVIDER_CODE`
  Provider code for DLR ingestion, for example `ethio-telecom`
- `ALLOW_PRODUCTION_TARGET`
  Must be `true` to run against non-local domains

## Commands

```bash
k6 run load/k6/single-submit.js
k6 run load/k6/campaign-schedule.js
k6 run load/k6/dlr-ingest.js
k6 run load/k6/mixed-workload.js
```

## Interpreting Results

- API submit tests: watch `http_req_duration`, non-2xx rates, and backend `sms_message_submissions_total`
- DLR tests: watch DLR ingest latency, `/metrics` `sms_dlr_backlog`, and reconciliation alerts
- Mixed workload: correlate k6 timings with backend CPU and `sms_outbox_backlog`
