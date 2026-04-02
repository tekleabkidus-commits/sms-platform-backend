# SMS Platform Backend

Carrier-grade multi-tenant SMS SaaS backend implemented in NestJS with PostgreSQL, Kafka, Redis, SMPP, HTTP providers, audit logging, analytics, and fraud controls.

## Quick Start

```bash
npm install
copy .env.example .env
npm run build
npm run start:dev
```

## Core Modules

- `auth`: API keys, JWT-backed RBAC, rotation, and authorization helpers
- `templates`: CRUD, versioning, merge-field extraction, and rendering
- `messages`: submit API, transactional outbox, state-machine transitions, and DLR updates
- `routing`: cached provider rule loading, health-aware route scoring, and retry policy lookup
- `fraud`: content, velocity, prefix heuristics, and Kafka-based dispatch analysis
- `campaigns`: scheduling and bulk job tracking
- `analytics`: delivery metrics and provider health reporting against read patterns
- `connectors`: SMPP and HTTP carrier integrations with circuit breaker support
