# Provider Outage Handling

## Symptoms

- provider circuit opens
- dispatch failure or throttle spikes
- elevated reconciliation events
- provider health logs degrading rapidly

## Response

1. Confirm the outage using provider-specific telemetry and external contact points.
2. Verify failover routing rules are selecting alternate healthy providers.
3. Keep the open circuit in place unless provider recovery is confirmed.
4. Notify affected tenants if SLA impact exceeds agreed thresholds.

## Recovery

- Use half-open probes only after provider health stabilizes.
- Watch `sms_provider_circuit_state` and dispatch acceptance before closing the incident.
