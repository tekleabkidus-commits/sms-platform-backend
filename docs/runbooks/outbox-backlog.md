# Outbox Backlog Troubleshooting

## Indicators

- `sms_outbox_backlog{status="pending"}` rising
- delayed dispatch or DLR normalization
- outbox relay worker restarts

## Checks

1. Confirm the outbox worker pods are healthy.
2. Check Kafka producer connectivity and broker health.
3. Review `outbox_events.last_error`.
4. Validate PostgreSQL write latency and row lock contention.

## Actions

- scale `sms-platform-worker-outbox`
- stabilize Kafka before restarting workers
- avoid manually editing outbox rows unless reconciliation is documented
