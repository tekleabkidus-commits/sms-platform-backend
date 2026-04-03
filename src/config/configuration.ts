const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  return value.toLowerCase() === 'true';
};

const parseNumber = (value: string | undefined, defaultValue: number): number => {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

export default () => ({
  app: {
    name: 'sms-platform-backend',
    environment: process.env.NODE_ENV ?? 'development',
    role: process.env.APP_ROLE ?? 'all',
    port: parseNumber(process.env.PORT, 3000),
    host: process.env.HOST ?? '0.0.0.0',
    logLevel: process.env.LOG_LEVEL ?? 'log',
    trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
    corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    shutdownTimeoutMs: parseNumber(process.env.SHUTDOWN_TIMEOUT_MS, 15000),
  },
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseNumber(process.env.PORT, 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  postgres: {
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: parseNumber(process.env.POSTGRES_PORT, 5432),
    user: process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.POSTGRES_PASSWORD ?? 'postgres',
    database: process.env.POSTGRES_DATABASE ?? 'sms_platform',
    maxPool: parseNumber(process.env.POSTGRES_MAX_POOL, 20),
    ssl: parseBoolean(process.env.POSTGRES_SSL, false),
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseNumber(process.env.REDIS_PORT, 6379),
    username: process.env.REDIS_USERNAME ?? undefined,
    password: process.env.REDIS_PASSWORD ?? undefined,
    db: parseNumber(process.env.REDIS_DB, 0),
  },
  kafka: {
    clientId: process.env.KAFKA_CLIENT_ID ?? 'sms-platform-backend',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map((broker) => broker.trim()),
    groupId: process.env.KAFKA_GROUP_ID ?? 'sms-platform-backend',
    ssl: parseBoolean(process.env.KAFKA_SSL, false),
    saslMechanism: process.env.KAFKA_SASL_MECHANISM ?? undefined,
    saslUsername: process.env.KAFKA_SASL_USERNAME ?? undefined,
    saslPassword: process.env.KAFKA_SASL_PASSWORD ?? undefined,
  },
  auth: {
    jwtPublicKey: process.env.JWT_PUBLIC_KEY ?? 'replace-me',
    jwtPrivateKey: process.env.JWT_PRIVATE_KEY ?? 'replace-me',
  },
  providers: {
    httpTimeoutMs: parseNumber(process.env.HTTP_PROVIDER_TIMEOUT_MS, 10000),
    unknownOutcomeTimeoutMs: parseNumber(process.env.PROVIDER_UNKNOWN_OUTCOME_TIMEOUT_MS, 15000),
    smppEnquireLinkSeconds: parseNumber(process.env.SMPP_ENQUIRE_LINK_SECONDS, 30),
    smppDefaultWindowSize: parseNumber(process.env.SMPP_DEFAULT_WINDOW_SIZE, 16),
  },
  circuitBreaker: {
    failureThreshold: parseNumber(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD, 3),
    openSeconds: parseNumber(process.env.CIRCUIT_BREAKER_OPEN_SECONDS, 60),
    halfOpenProbeSeconds: parseNumber(process.env.CIRCUIT_BREAKER_HALF_OPEN_PROBE_SECONDS, 10),
  },
  outbox: {
    batchSize: parseNumber(process.env.OUTBOX_BATCH_SIZE, 100),
    publishLeaseSeconds: parseNumber(process.env.OUTBOX_PUBLISH_LEASE_SECONDS, 300),
  },
  secrets: {
    allowInsecurePlainText: parseBoolean(process.env.ALLOW_INSECURE_PLAIN_SECRETS, false),
  },
  metrics: {
    defaultMetrics: parseBoolean(process.env.PROMETHEUS_DEFAULT_METRICS, true),
  },
});
