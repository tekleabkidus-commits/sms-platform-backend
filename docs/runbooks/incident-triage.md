# Incident Triage

## First 10 Minutes

1. Check `/api/v1/health/ready` for API and worker pods.
2. Review Prometheus alerts for API errors, outbox backlog, DLR backlog, and provider circuits.
3. Confirm PostgreSQL, Redis, and Kafka health independently.
4. Inspect recent deploy activity and migration jobs.

## Key Questions

- Is the issue tenant-specific or global?
- Is a provider circuit open?
- Are messages stuck before or after provider acceptance?
- Did rate-limit denials spike?
- Is the control-plane impacted or only worker throughput?

## Immediate Artifacts

- failing request IDs
- impacted tenant IDs
- message composite IDs
- provider IDs and error codes
- dashboard screenshots or alert payloads
