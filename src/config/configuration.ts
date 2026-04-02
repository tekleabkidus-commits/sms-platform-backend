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
    smppEnquireLinkSeconds: parseNumber(process.env.SMPP_ENQUIRE_LINK_SECONDS, 30),
    smppDefaultWindowSize: parseNumber(process.env.SMPP_DEFAULT_WINDOW_SIZE, 16),
  },
  outbox: {
    batchSize: parseNumber(process.env.OUTBOX_BATCH_SIZE, 100),
  },
  metrics: {
    defaultMetrics: parseBoolean(process.env.PROMETHEUS_DEFAULT_METRICS, true),
  },
});
