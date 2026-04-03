# DLR Backlog Troubleshooting

## Indicators

- `sms_dlr_backlog` rising
- delayed message delivery finalization
- reconciliation backlog increasing after DLR spikes

## Checks

1. Verify `sms-platform-worker-dlr` pods are ready.
2. Inspect `dlr_webhooks` oldest unprocessed age.
3. Check provider callback reachability and ingress health.
4. Confirm DLR payload normalization is not failing on a schema change.

## Actions

- scale DLR workers if Kafka and PostgreSQL are healthy
- keep unmatched DLRs flowing into reconciliation rather than forcing unsafe matches
- coordinate with provider if callback delays are external
