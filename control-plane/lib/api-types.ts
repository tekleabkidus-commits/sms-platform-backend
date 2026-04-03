export type Role = 'owner' | 'admin' | 'finance' | 'support' | 'developer' | 'viewer';

export interface TenantSummary {
  id: string;
  code: string;
  name: string;
  timezone: string;
  status: string;
}

export interface SessionData {
  user: {
    id: string;
    email: string;
    role: Role;
  };
  tenant: TenantSummary;
  availableTenants: TenantSummary[];
}

export interface GlobalSearchItem {
  id: string;
  entityType: string;
  title: string;
  subtitle: string;
  href?: string;
  tenantId?: string | null;
  tenantName?: string | null;
  action?: 'switch-tenant';
  actionPayload?: Record<string, unknown>;
}

export interface GlobalSearchGroup {
  type: string;
  label: string;
  items: GlobalSearchItem[];
}

export interface NotificationItem {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  details: string;
  createdAt: string;
  href: string;
  category: string;
  tenantId?: string | null;
}

export interface SavedViewDefinition {
  id: string;
  name: string;
  filters: Record<string, string>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardData {
  wallet: {
    availableBalanceMinor: number;
    reservedBalanceMinor: number;
    currency: string;
  };
  today: {
    sent: number;
    delivered: number;
    failed: number;
    currentTpsUsage: number;
  };
  campaigns: {
    total: number;
    scheduled: number;
    activeSchedules: number;
    runningJobs: number;
  };
  senderIds: {
    approved: number;
    pending: number;
    rejected: number;
  };
  providers: Array<{
    providerId: number;
    latestStatus: string;
    avgLatencyMs: number;
    avgErrorRate: number;
  }>;
  recentFailures: Array<{
    id: number;
    submitDate: string;
    phoneNumber: string;
    status: string;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    acceptedAt: string;
  }>;
  fraudWarnings: number;
  apiKeyUsage: Array<{
    apiKeyId: string | null;
    messageCount: number;
  }>;
  trends: Array<{
    date: string;
    acceptedTotal: number;
    deliveredTotal: number;
    deliveryRate: number;
    spendMinor: number;
    costMinor: number;
  }>;
}

export interface MessageItem {
  id: number;
  submitDate: string;
  tenantId: string;
  clientMessageId?: string | null;
  phoneNumber: string;
  body: string;
  trafficType: string;
  status: string;
  version: number;
  attemptCount: number;
  providerId?: number | null;
  providerMessageId?: string | null;
  priceMinor: number;
  billingState: string;
  acceptedAt: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  routePreview?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface MessageTrace {
  message: MessageItem;
  correlation: {
    clientMessageId?: string | null;
    apiIdempotencyKey?: string | null;
    providerMessageId?: string | null;
    routeRuleId?: number | null;
    smppConfigId?: number | null;
    version: number;
  };
  timeline: Array<{
    eventType: string;
    statusFrom?: string | null;
    statusTo?: string | null;
    providerId?: number | null;
    providerMessageId?: string | null;
    attemptNo: number;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
  billing: Array<{
    kind: string;
    amountMinor: number;
    currency: string;
    balanceBeforeMinor: number;
    balanceAfterMinor: number;
    idempotencyKey: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  }>;
  dlrHistory: Array<{
    id: number;
    normalizedStatus?: string | null;
    processed: boolean;
    processingError?: string | null;
    receivedAt: string;
    processedAt?: string | null;
    payload: Record<string, unknown>;
  }>;
  routingDecision: {
    providerId?: number | null;
    smppConfigId?: number | null;
    routeRuleId?: number | null;
    priceMinor: number;
    billingState: string;
    attemptCount: number;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
  };
}

export interface CampaignSummary {
  id: number;
  name: string;
  status: string;
  sourceType: string;
  scheduledAt?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  latestJob?: {
    id: number;
    status: string;
    totalRecords: number;
    processedRecords: number;
  } | null;
}

export interface CampaignDetail {
  id: number;
  name: string;
  status: string;
  sourceType: string;
  scheduledAt?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  schedules: Array<{
    id: number;
    templateRef: string;
    senderId: string;
    contactGroupId?: number | null;
    contactUploadId?: number | null;
    recurrenceCron?: string | null;
    timezone: string;
    nextRunAt: string;
    shardCount: number;
    isActive: boolean;
  }>;
  jobs: Array<{
    id: number;
    status: string;
    totalRecords: number;
    processedRecords: number;
    acceptedRecords: number;
    failedRecords: number;
    shardCount: number;
    createdAt: string;
    startedAt?: string | null;
    completedAt?: string | null;
    lastError?: string | null;
  }>;
  performance: {
    totalRecords: number;
    acceptedRecords: number;
    deliveredRecords: number;
    failedRecords: number;
    pendingRecords: number;
  };
  recentFailures: Array<{
    id: number;
    submitDate: string;
    phoneNumber: string;
    status: string;
    failedAt?: string | null;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
  }>;
  auditTrail: Array<{
    id: number;
    action: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
}

export interface CampaignScheduleItem {
  id: number;
  campaignId: number;
  templateRef: string;
  senderId: string;
  recurrenceCron?: string | null;
  timezone: string;
  nextRunAt: string;
  shardCount: number;
  isActive: boolean;
}

export interface ContactItem {
  id: number;
  phoneNumber: string;
  name?: string | null;
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactDetail extends ContactItem {
  groups: Array<{
    id: number;
    name: string;
  }>;
}

export interface ContactGroup {
  id: number;
  name: string;
  memberCount?: number;
  createdAt: string;
  members?: Array<{
    id: number;
    phoneNumber: string;
    name?: string | null;
    createdAt: string;
  }>;
}

export interface ContactUpload {
  id: number;
  targetGroupId?: number | null;
  originalFileName: string;
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createdAt: string;
  completedAt?: string | null;
}

export interface ContactUploadError {
  id: number;
  rowNumber: number;
  rawRecord: Record<string, unknown>;
  errorReason: string;
  createdAt: string;
}

export interface TemplateItem {
  id: number;
  templateKey: string;
  tenantId: string;
  name: string;
  body: string;
  version: number;
  mergeFields: string[];
  isActive: boolean;
  createdAt: string;
}

export interface SenderIdItem {
  id: number;
  tenantId: string;
  providerId: number;
  senderName: string;
  status: string;
  rejectionReason?: string | null;
  approvedAt?: string | null;
  createdAt: string;
}

export interface WalletSummary {
  id: number;
  currency: string;
  availableBalanceMinor: number;
  reservedBalanceMinor: number;
  creditLimitMinor: number;
  lowBalanceThresholdMinor: number;
  updatedAt: string;
  recentTotals: {
    reservedTodayMinor: number;
    debitedTodayMinor: number;
    releasedTodayMinor: number;
  };
}

export interface WalletTransactionItem {
  ledgerDate: string;
  id: number;
  walletId: number;
  kind: string;
  amountMinor: number;
  currency: string;
  balanceBeforeMinor: number;
  balanceAfterMinor: number;
  idempotencyKey: string;
  messageSubmitDate?: string | null;
  messageId?: number | null;
  campaignId?: number | null;
  providerId?: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ApiKeyItem {
  id: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  rateLimitRps?: number | null;
  dailyQuota?: number | null;
  isActive: boolean;
  lastUsedAt?: string | null;
  createdAt: string;
}

export interface ProviderItem {
  id: number;
  code: string;
  name: string;
  defaultProtocol: 'http' | 'smpp';
  httpBaseUrl?: string | null;
  maxGlobalTps: number;
  priority: number;
  isActive: boolean;
  healthStatus: string;
  createdAt: string;
  updatedAt: string;
  metrics: {
    latencyMs: number;
    errorRate: number;
    circuitState: string;
  };
}

export interface ProviderDetail {
  provider: ProviderItem;
  smppConfigs: Array<{
    id: number;
    name: string;
    host: string;
    port: number;
    systemId: string;
    bindMode: string;
    maxSessions: number;
    sessionTps: number;
    isActive: boolean;
  }>;
  healthHistory: Array<{
    protocol: string;
    status: string;
    latencyMs?: number | null;
    errorRate: number;
    successTps?: number | null;
    throttleCount: number;
    sampleWindowSec: number;
    recordedAt: string;
  }>;
}

export interface RoutingRuleItem {
  id: number;
  tenantId?: string | null;
  name: string;
  countryCode: string;
  trafficType: string;
  providerId: number;
  smppConfigId?: number | null;
  preferredProtocol?: string | null;
  priority: number;
  weight: number;
  maxTps?: number | null;
  costRank: number;
  failoverOrder: number;
  isActive: boolean;
  updatedAt: string;
}

export interface PricingRuleItem {
  id: number;
  kind: string;
  tenantId?: string | null;
  providerId?: number | null;
  countryCode: string;
  trafficType: string;
  partsFrom: number;
  partsTo: number;
  unitPriceMinor: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
}

export interface RetryPolicyItem {
  id: number;
  tenantId?: string | null;
  providerId?: number | null;
  trafficType?: string | null;
  maxAttempts: number;
  retryIntervals: number[];
  retryOnErrors: string[];
  isActive: boolean;
  updatedAt: string;
}

export interface OperationsOverview {
  queues: Array<{
    topicName: string;
    backlog: number;
    failed: number;
  }>;
  providers: Array<{
    providerId: number;
    latestStatus: string;
    avgLatencyMs: number;
    avgErrorRate: number;
    circuitState: string;
  }>;
  dlrBacklog: {
    backlog: number;
    oldestReceivedAt?: string | null;
  };
  reconciliationBacklog: number;
  campaignJobs: {
    running: number;
    failed: number;
  };
  recentOutages: Array<{
    providerId: number;
    status: string;
    recordedAt: string;
  }>;
  tenantAnomalies: Array<{
    tenantId: string;
    failureCount: number;
  }>;
}

export interface AuditLogItem {
  logDate: string;
  id: number;
  tenantId?: string | null;
  userId?: string | null;
  apiKeyId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  sourceIp?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface FraudRuleItem {
  id: number;
  tenantId?: string | null;
  name: string;
  ruleType: string;
  action: string;
  values: string[];
  isActive: boolean;
}

export interface FraudEventItem {
  messageSubmitDate: string;
  messageId: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ComplianceEntry {
  id: number;
  phoneNumber: string;
  reason?: string | null;
  createdAt: string;
}
