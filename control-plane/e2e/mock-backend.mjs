import http from 'node:http';

const defaultTenant = {
  id: 'tenant-1',
  code: 'acme-et',
  name: 'Acme Ethiopia',
  timezone: 'Africa/Addis_Ababa',
  status: 'active',
};

const altTenant = {
  id: 'tenant-2',
  code: 'noc-et',
  name: 'NOC Ethiopia',
  timezone: 'Africa/Addis_Ababa',
  status: 'active',
};

const state = {
  reauthTokens: new Set(),
  templates: [
    { id: 1, templateKey: 'tpl-1', tenantId: defaultTenant.id, name: 'otp-login', body: 'Your OTP is {{code}}.', version: 1, mergeFields: ['code'], isActive: true, createdAt: '2026-04-02T10:00:00.000Z' },
  ],
  senderIds: [
    { id: 1, tenantId: defaultTenant.id, providerId: 1, senderName: 'MYAPP', status: 'pending', rejectionReason: null, approvedAt: null, createdAt: '2026-04-02T10:00:00.000Z' },
  ],
  contactGroups: [
    { id: 1, name: 'April subscribers', memberCount: 2, createdAt: '2026-04-02T10:00:00.000Z', members: [{ id: 11, phoneNumber: '+251911234567', name: 'Abel', createdAt: '2026-04-02T10:00:00.000Z' }] },
  ],
  campaigns: [
    { id: 1, name: 'OTP Warmup', status: 'scheduled', sourceType: 'api', scheduledAt: '2026-04-02T10:30:00.000Z', metadata: {}, createdAt: '2026-04-02T10:00:00.000Z', updatedAt: '2026-04-02T10:00:00.000Z', latestJob: { id: 1, status: 'running', totalRecords: 100, processedRecords: 60 } },
  ],
  campaignDetails: {
    1: {
      id: 1,
      name: 'OTP Warmup',
      status: 'scheduled',
      sourceType: 'api',
      scheduledAt: '2026-04-02T10:30:00.000Z',
      metadata: {
        senderId: 'MYAPP',
        templateRef: 'otp-login',
        trafficType: 'otp',
      },
      createdAt: '2026-04-02T10:00:00.000Z',
      updatedAt: '2026-04-02T10:00:00.000Z',
      schedules: [
        {
          id: 1,
          templateRef: 'otp-login',
          senderId: 'MYAPP',
          contactGroupId: 1,
          contactUploadId: 1,
          recurrenceCron: '0 10 * * *',
          timezone: 'Africa/Addis_Ababa',
          nextRunAt: '2026-04-03T07:00:00.000Z',
          shardCount: 2,
          isActive: true,
        },
      ],
      jobs: [
        {
          id: 1,
          status: 'running',
          totalRecords: 100,
          processedRecords: 60,
          acceptedRecords: 58,
          failedRecords: 2,
          shardCount: 2,
          createdAt: '2026-04-02T10:00:00.000Z',
          startedAt: '2026-04-02T10:02:00.000Z',
          completedAt: null,
          lastError: null,
        },
      ],
      performance: {
        totalRecords: 100,
        acceptedRecords: 58,
        deliveredRecords: 54,
        failedRecords: 2,
        pendingRecords: 42,
      },
      recentFailures: [
        {
          id: 99,
          submitDate: '2026-04-02',
          phoneNumber: '+251911000111',
          status: 'failed',
          failedAt: '2026-04-02T10:09:00.000Z',
          lastErrorCode: 'THROTTLED',
          lastErrorMessage: 'Carrier throttled campaign shard 2',
        },
      ],
      auditTrail: [
        {
          id: 11,
          action: 'campaigns.schedule',
          metadata: { createdBy: 'user-1', sourceType: 'api' },
          createdAt: '2026-04-02T10:00:00.000Z',
        },
      ],
    },
  },
  apiKeys: [
    { id: 'key-1', keyPrefix: 'abc123', name: 'Primary key', scopes: ['sms:send'], rateLimitRps: 100, dailyQuota: 100000, isActive: true, lastUsedAt: '2026-04-02T09:30:00.000Z', createdAt: '2026-04-02T09:00:00.000Z' },
  ],
  providers: [
    {
      provider: {
        id: 1,
        code: 'ethio',
        name: 'Ethio Telecom',
        defaultProtocol: 'smpp',
        httpBaseUrl: null,
        maxGlobalTps: 500,
        priority: 1,
        isActive: true,
        healthStatus: 'healthy',
        createdAt: '2026-04-02T09:00:00.000Z',
        updatedAt: '2026-04-02T09:00:00.000Z',
        metrics: { latencyMs: 120, errorRate: 0.01, circuitState: 'closed' },
      },
      smppConfigs: [
        { id: 1, name: 'ethio-primary', host: 'smpp.ethio.test', port: 2775, systemId: 'system', bindMode: 'transceiver', maxSessions: 10, sessionTps: 50, isActive: true },
      ],
      healthHistory: [
        { protocol: 'smpp', status: 'healthy', latencyMs: 120, errorRate: 0.01, successTps: 44, throttleCount: 0, sampleWindowSec: 60, recordedAt: '2026-04-02T10:05:00.000Z' },
      ],
    },
  ],
  messages: [
    {
      id: 1,
      submitDate: '2026-04-02',
      tenantId: defaultTenant.id,
      clientMessageId: 'client-1',
      phoneNumber: '+251911234567',
      body: 'Your OTP is 815204.',
      trafficType: 'otp',
      status: 'delivered',
      version: 4,
      attemptCount: 1,
      providerId: 1,
      providerMessageId: 'provider-1',
      priceMinor: 25,
      billingState: 'debited',
      acceptedAt: '2026-04-02T10:00:00.000Z',
      sentAt: '2026-04-02T10:00:04.000Z',
      deliveredAt: '2026-04-02T10:00:08.000Z',
      failedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      routePreview: { senderId: 'MYAPP' },
    },
  ],
  uploads: [
    { id: 1, targetGroupId: 1, originalFileName: 'seed.csv', status: 'completed', totalRows: 3, validRows: 2, invalidRows: 1, createdAt: '2026-04-02T10:00:00.000Z', completedAt: '2026-04-02T10:00:10.000Z' },
  ],
  uploadErrors: {
    1: [{ id: 1, rowNumber: 3, rawRecord: { phone_number: '0911' }, errorReason: 'invalid phone number', createdAt: '2026-04-02T10:00:05.000Z' }],
  },
  auditLogs: [
    { logDate: '2026-04-02', id: 1, tenantId: defaultTenant.id, userId: 'user-1', apiKeyId: null, action: 'wallet.debit', targetType: 'wallet', targetId: 'wallet-1', sourceIp: null, metadata: { amountMinor: 25 }, createdAt: '2026-04-02T10:00:10.000Z' },
  ],
};

function getBearerToken(req) {
  const auth = req.headers.authorization ?? '';
  return auth.replace(/^Bearer\s+/i, '');
}

function tenantFromToken(token) {
  if (!token || token.startsWith('expired:')) {
    return null;
  }

  if (token === `token:${altTenant.id}`) {
    return altTenant;
  }

  if (token === `token:${defaultTenant.id}`) {
    return defaultTenant;
  }

  return null;
}

function readJson(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body ? JSON.parse(body) : {}));
  });
}

function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function getTenantFromAuth(req) {
  return tenantFromToken(getBearerToken(req));
}

function requireAuth(req, res) {
  const tenant = getTenantFromAuth(req);
  if (!tenant) {
    send(res, 401, { message: 'Unauthorized' });
    return null;
  }
  return tenant;
}

function requireReauth(req, res) {
  const token = req.headers['x-reauth-token'];
  const value = Array.isArray(token) ? token[0] : token;
  if (!value || !state.reauthTokens.has(value)) {
    send(res, 401, { message: 'Password confirmation is required for this action' });
    return false;
  }
  return true;
}

function normalizeCsvRecords(csvContent) {
  const lines = csvContent.trim().split(/\r?\n/).filter(Boolean);
  const headers = (lines[0] ?? '').split(',').map((value) => value.trim());
  return lines.slice(1).map((line, index) => {
    const values = line.split(',').map((value) => value.trim());
    return {
      rowNumber: index + 2,
      record: Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? ''])),
    };
  });
}

function isValidPhone(phone) {
  return /^\+\d{10,15}$/.test(phone);
}

function sessionForTenant(tenant) {
  return {
    user: {
      id: 'user-1',
      email: 'admin@example.com',
      role: 'admin',
    },
    tenant,
    availableTenants: [defaultTenant, altTenant],
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4010');
  const path = url.pathname;

  if (req.method === 'POST' && path === '/api/v1/auth/login') {
    return send(res, 200, {
      accessToken: `token:${defaultTenant.id}`,
      expiresIn: '12h',
      user: sessionForTenant(defaultTenant).user,
      tenant: defaultTenant,
    });
  }

  if (req.method === 'GET' && path === '/api/v1/auth/me') {
    const tenant = getTenantFromAuth(req);
    if (!tenant) {
      return send(res, 401, { message: 'Unauthorized' });
    }
    return send(res, 200, sessionForTenant(tenant));
  }

  if (req.method === 'POST' && path === '/api/v1/auth/switch-tenant') {
    const body = await readJson(req);
    const tenant = body.tenantId === altTenant.id ? altTenant : defaultTenant;
    return send(res, 200, {
      accessToken: `token:${tenant.id}`,
      expiresIn: '12h',
      user: sessionForTenant(tenant).user,
      tenant,
      availableTenants: [defaultTenant, altTenant],
    });
  }

  if (req.method === 'POST' && path === '/api/v1/auth/re-auth') {
    const tenant = requireAuth(req, res);
    if (!tenant) {
      return;
    }
    const body = await readJson(req);
    if (body.password !== 'ChangeMe123!') {
      return send(res, 401, { message: 'Password confirmation failed' });
    }
    const token = `reauth:${tenant.id}:${Date.now()}`;
    state.reauthTokens.add(token);
    return send(res, 200, {
      reauthToken: token,
      expiresInSeconds: 300,
    });
  }

  const tenant = requireAuth(req, res);
  if (!tenant) {
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/dashboard/tenant') {
    return send(res, 200, {
      wallet: { availableBalanceMinor: 500000, reservedBalanceMinor: 10000, currency: 'ETB' },
      today: { sent: 2300, delivered: 2201, failed: 21, currentTpsUsage: 42.5 },
      campaigns: { total: 4, scheduled: 2, activeSchedules: 1, runningJobs: 1 },
      senderIds: { approved: 1, pending: 1, rejected: 0 },
      providers: [{ providerId: 1, latestStatus: 'healthy', avgLatencyMs: 120, avgErrorRate: 0.01 }],
      recentFailures: [],
      fraudWarnings: 1,
      apiKeyUsage: [{ apiKeyId: 'key-1', messageCount: 123 }],
      trends: [{ date: '2026-03-27', acceptedTotal: 1000, deliveredTotal: 990, deliveryRate: 0.99, spendMinor: 25000, costMinor: 20000 }],
    });
  }

  if (req.method === 'GET' && path === '/api/v1/notifications') {
    const notifications = [
      {
        id: `provider-health:1:degraded`,
        severity: 'warning',
        title: 'Provider #1 is degraded',
        details: 'Ethio Telecom latency is elevated and retry backlog is growing.',
        createdAt: '2026-04-02T10:12:00.000Z',
        href: '/admin/providers/1',
        category: 'providers',
        tenantId: null,
      },
      {
        id: `wallet-low-balance:${tenant.id}`,
        severity: 'critical',
        title: 'Wallet balance is below threshold',
        details: 'Available balance has dropped below the configured warning threshold.',
        createdAt: '2026-04-02T10:10:00.000Z',
        href: '/wallet',
        category: 'wallet',
        tenantId: tenant.id,
      },
      {
        id: 'campaign-job-failed:1',
        severity: 'warning',
        title: 'Campaign job #1 failed',
        details: 'A scheduled campaign shard failed and needs review.',
        createdAt: '2026-04-02T10:09:00.000Z',
        href: '/campaigns/1',
        category: 'campaigns',
        tenantId: tenant.id,
      },
    ];
    return send(res, 200, { items: notifications });
  }

  if (req.method === 'GET' && path === '/api/v1/search/global') {
    const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const groups = [];

    if (query.length >= 2) {
      const messageMatches = state.messages.filter((message) => (
        String(message.id) === query
        || (message.providerMessageId ?? '').toLowerCase().includes(query)
        || message.phoneNumber.toLowerCase().includes(query)
      ));
      if (messageMatches.length > 0) {
        groups.push({
          type: 'messages',
          label: 'Messages',
          items: messageMatches.map((message) => ({
            id: `message-${message.id}`,
            entityType: 'message',
            title: `Message #${message.id}`,
            subtitle: `${message.phoneNumber} • ${message.status}`,
            href: `/messages/${message.submitDate}/${message.tenantId}/${message.id}`,
          })),
        });
      }

      const campaignMatches = state.campaigns.filter((campaign) => (
        String(campaign.id) === query
        || campaign.name.toLowerCase().includes(query)
      ));
      if (campaignMatches.length > 0) {
        groups.push({
          type: 'campaigns',
          label: 'Campaigns',
          items: campaignMatches.map((campaign) => ({
            id: `campaign-${campaign.id}`,
            entityType: 'campaign',
            title: campaign.name,
            subtitle: `Campaign #${campaign.id}`,
            href: `/campaigns/${campaign.id}`,
          })),
        });
      }

      const senderMatches = state.senderIds.filter((sender) => (
        String(sender.id) === query
        || sender.senderName.toLowerCase().includes(query)
      ));
      if (senderMatches.length > 0) {
        groups.push({
          type: 'sender_ids',
          label: 'Sender IDs',
          items: senderMatches.map((sender) => ({
            id: `sender-${sender.id}`,
            entityType: 'sender_id',
            title: sender.senderName,
            subtitle: `Sender #${sender.id} • ${sender.status}`,
            href: '/sender-ids',
          })),
        });
      }

      const apiKeyMatches = state.apiKeys.filter((apiKey) => (
        apiKey.name.toLowerCase().includes(query)
        || apiKey.keyPrefix.toLowerCase().includes(query)
      ));
      if (apiKeyMatches.length > 0) {
        groups.push({
          type: 'api_keys',
          label: 'API keys',
          items: apiKeyMatches.map((apiKey) => ({
            id: `api-key-${apiKey.id}`,
            entityType: 'api_key',
            title: apiKey.name,
            subtitle: apiKey.keyPrefix,
            href: '/developer/api-keys',
          })),
        });
      }

      const providerMatches = state.providers.filter((provider) => (
        provider.provider.name.toLowerCase().includes(query)
        || provider.provider.code.toLowerCase().includes(query)
      ));
      if (providerMatches.length > 0) {
        groups.push({
          type: 'providers',
          label: 'Providers',
          items: providerMatches.map((provider) => ({
            id: `provider-${provider.provider.id}`,
            entityType: 'provider',
            title: provider.provider.name,
            subtitle: provider.provider.code,
            href: `/admin/providers/${provider.provider.id}`,
          })),
        });
      }

      const tenantMatches = [defaultTenant, altTenant].filter((candidate) => (
        candidate.name.toLowerCase().includes(query)
        || candidate.code.toLowerCase().includes(query)
      ));
      if (tenantMatches.length > 0) {
        groups.push({
          type: 'tenants',
          label: 'Tenants',
          items: tenantMatches.map((candidate) => ({
            id: `tenant-${candidate.id}`,
            entityType: 'tenant',
            title: candidate.name,
            subtitle: candidate.code,
            action: 'switch-tenant',
            actionPayload: { tenantId: candidate.id },
          })),
        });
      }
    }

    return send(res, 200, { groups });
  }

  if (req.method === 'GET' && path === '/api/v1/templates') return send(res, 200, state.templates);
  if (req.method === 'POST' && path === '/api/v1/templates') {
    const body = await readJson(req);
    state.templates.unshift({
      id: state.templates.length + 1,
      templateKey: `tpl-${state.templates.length + 1}`,
      tenantId: defaultTenant.id,
      name: body.name,
      body: body.body,
      version: 1,
      mergeFields: ['code'],
      isActive: body.isActive ?? true,
      createdAt: new Date().toISOString(),
    });
    return send(res, 200, state.templates[0]);
  }
  if (req.method === 'PUT' && path.startsWith('/api/v1/templates/')) {
    const id = Number(path.split('/').pop());
    const body = await readJson(req);
    const current = state.templates.find((item) => item.id === id);
    const created = {
      ...(current ?? state.templates[0]),
      id: state.templates.length + 1,
      body: body.body ?? current?.body ?? '',
      name: body.name ?? current?.name ?? '',
      version: (current?.version ?? 0) + 1,
      createdAt: new Date().toISOString(),
      isActive: body.isActive ?? true,
    };
    state.templates.unshift(created);
    return send(res, 200, created);
  }
  if (req.method === 'DELETE' && path.startsWith('/api/v1/templates/')) {
    return send(res, 200, { success: true });
  }

  if (req.method === 'GET' && path === '/api/v1/sender-ids') return send(res, 200, state.senderIds);
  if (req.method === 'POST' && path.startsWith('/api/v1/sender-ids/') && path.endsWith('/approve')) {
    if (!requireReauth(req, res)) {
      return;
    }
    const id = Number(path.split('/')[4]);
    const sender = state.senderIds.find((item) => item.id === id);
    if (sender) {
      sender.status = 'approved';
      sender.approvedAt = new Date().toISOString();
      sender.rejectionReason = null;
    }
    return send(res, 200, sender ?? {});
  }
  if (req.method === 'POST' && path.startsWith('/api/v1/sender-ids/') && path.endsWith('/reject')) {
    if (!requireReauth(req, res)) {
      return;
    }
    const id = Number(path.split('/')[4]);
    const sender = state.senderIds.find((item) => item.id === id);
    if (sender) {
      sender.status = 'rejected';
      sender.rejectionReason = 'Rejected in control plane review';
    }
    return send(res, 200, sender ?? {});
  }

  if (req.method === 'GET' && path === '/api/v1/contact-groups') {
    return send(res, 200, state.contactGroups.map(({ id, name, memberCount, createdAt }) => ({ id, name, memberCount, createdAt })));
  }
  if (req.method === 'GET' && path.startsWith('/api/v1/contact-groups/')) {
    const id = Number(path.split('/').pop());
    return send(res, 200, state.contactGroups.find((group) => group.id === id) ?? {});
  }

  if (req.method === 'POST' && path === '/api/v1/contact-uploads/inline') {
    const body = await readJson(req);
    const uploadId = state.uploads.length + 1;
    const records = normalizeCsvRecords(body.csvContent ?? '');
    const errors = [];
    for (const entry of records) {
      const phone = String(entry.record.phone_number ?? entry.record.phoneNumber ?? entry.record.msisdn ?? '');
      if (!isValidPhone(phone)) {
        errors.push({
          id: errors.length + 1,
          rowNumber: entry.rowNumber,
          rawRecord: entry.record,
          errorReason: 'invalid phone number',
          createdAt: new Date().toISOString(),
        });
      }
    }
    state.uploads.unshift({
      id: uploadId,
      targetGroupId: body.targetGroupId ?? null,
      originalFileName: body.fileName ?? 'bulk-upload.csv',
      status: 'completed',
      totalRows: records.length,
      validRows: records.length - errors.length,
      invalidRows: errors.length,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    state.uploadErrors[uploadId] = errors;
    return send(res, 200, { uploadId, invalidRows: errors.length });
  }
  if (req.method === 'GET' && path === '/api/v1/contact-uploads') return send(res, 200, state.uploads);
  if (req.method === 'GET' && path.startsWith('/api/v1/contact-uploads/') && path.endsWith('/errors')) {
    const id = Number(path.split('/')[4]);
    return send(res, 200, state.uploadErrors[id] ?? []);
  }

  if (req.method === 'GET' && path === '/api/v1/campaigns') return send(res, 200, state.campaigns);
  if (req.method === 'GET' && path.startsWith('/api/v1/campaigns/')) {
    const parts = path.split('/');
    if (parts.length === 5) {
      const id = Number(parts[4]);
      const detail = state.campaignDetails[id];
      if (!detail) {
        return send(res, 404, { message: 'Campaign not found' });
      }
      return send(res, 200, detail);
    }
  }
  if (req.method === 'POST' && path === '/api/v1/campaigns/schedule') {
    const body = await readJson(req);
    const campaignId = state.campaigns.length + 1;
    const jobId = state.campaigns.length + 1;
    const campaign = {
      id: campaignId,
      name: body.campaignName,
      status: 'scheduled',
      sourceType: 'upload',
      scheduledAt: body.startAt,
      metadata: {
        senderId: body.senderId ?? 'MYAPP',
        templateRef: body.templateRef ?? 'otp-login',
        trafficType: body.trafficType ?? 'transactional',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      latestJob: { id: jobId, status: 'pending', totalRecords: 2, processedRecords: 0 },
    };
    state.campaigns.unshift(campaign);
    state.campaignDetails[campaignId] = {
      ...campaign,
      schedules: [
        {
          id: campaignId,
          templateRef: body.templateRef ?? 'otp-login',
          senderId: body.senderId ?? 'MYAPP',
          contactGroupId: body.contactGroupId ?? null,
          contactUploadId: body.contactUploadId ?? state.uploads[0]?.id ?? null,
          recurrenceCron: body.recurrenceCron ?? null,
          timezone: body.timezone ?? 'Africa/Addis_Ababa',
          nextRunAt: body.startAt,
          shardCount: 1,
          isActive: true,
        },
      ],
      jobs: [
        {
          id: jobId,
          status: 'pending',
          totalRecords: 2,
          processedRecords: 0,
          acceptedRecords: 0,
          failedRecords: 0,
          shardCount: 1,
          createdAt: new Date().toISOString(),
          startedAt: null,
          completedAt: null,
          lastError: null,
        },
      ],
      performance: {
        totalRecords: 2,
        acceptedRecords: 0,
        deliveredRecords: 0,
        failedRecords: 0,
        pendingRecords: 2,
      },
      recentFailures: [],
      auditTrail: [
        {
          id: 100 + campaignId,
          action: 'campaigns.schedule',
          metadata: { createdBy: 'user-1', sourceType: 'upload' },
          createdAt: new Date().toISOString(),
        },
      ],
    };
    return send(res, 200, campaign);
  }
  if (req.method === 'POST' && path.startsWith('/api/v1/campaigns/') && path.endsWith('/cancel')) {
    if (!requireReauth(req, res)) {
      return;
    }
    const id = Number(path.split('/')[4]);
    const campaign = state.campaigns.find((item) => item.id === id);
    const detail = state.campaignDetails[id];
    if (!campaign || !detail) {
      return send(res, 404, { message: 'Campaign not found' });
    }
    campaign.status = 'cancelled';
    campaign.updatedAt = new Date().toISOString();
    detail.status = 'cancelled';
    detail.updatedAt = campaign.updatedAt;
    detail.schedules = detail.schedules.map((schedule) => ({ ...schedule, isActive: false }));
    detail.jobs = detail.jobs.map((job) => ({ ...job, status: job.status === 'completed' ? job.status : 'cancelled', completedAt: new Date().toISOString() }));
    detail.auditTrail.unshift({
      id: 999 + id,
      action: 'campaigns.cancel',
      metadata: { cancelledBy: 'user-1' },
      createdAt: campaign.updatedAt,
    });
    return send(res, 200, { success: true });
  }

  if (req.method === 'POST' && path === '/api/v1/messages/control-plane') {
    const body = await readJson(req);
    state.messages.unshift({
      id: state.messages.length + 1,
      submitDate: '2026-04-02',
      tenantId: defaultTenant.id,
      clientMessageId: body.clientMessageId ?? null,
      phoneNumber: body.phoneNumber,
      body: body.body ?? 'Rendered template',
      trafficType: body.trafficType ?? 'transactional',
      status: 'accepted',
      version: 1,
      attemptCount: 0,
      providerId: null,
      providerMessageId: null,
      priceMinor: 25,
      billingState: 'reserved',
      acceptedAt: new Date().toISOString(),
      sentAt: null,
      deliveredAt: null,
      failedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      routePreview: { senderId: body.senderId },
    });
    return send(res, 200, { messageId: state.messages[0].id });
  }
  if (req.method === 'GET' && path === '/api/v1/messages') {
    return send(res, 200, { items: state.messages, pagination: { page: 1, limit: 50, total: state.messages.length } });
  }
  if (req.method === 'GET' && path === '/api/v1/messages/2026-04-02/tenant-1/1/trace') {
    return send(res, 200, {
      message: state.messages.find((item) => item.id === 1),
      correlation: { clientMessageId: 'client-1', apiIdempotencyKey: 'ui-1', providerMessageId: 'provider-1', routeRuleId: 1, smppConfigId: 1, version: 4 },
      timeline: [
        { eventType: 'accepted', statusFrom: 'accepted', statusTo: 'routed', providerId: 1, providerMessageId: 'provider-1', attemptNo: 1, payload: { ok: true }, createdAt: '2026-04-02T10:00:01.000Z' },
      ],
      billing: [
        { kind: 'debit', amountMinor: 25, currency: 'ETB', balanceBeforeMinor: 500000, balanceAfterMinor: 499975, idempotencyKey: 'wallet-1', createdAt: '2026-04-02T10:00:02.000Z', metadata: {} },
      ],
      dlrHistory: [
        { id: 1, normalizedStatus: 'delivered', processed: true, processingError: null, receivedAt: '2026-04-02T10:00:08.000Z', processedAt: '2026-04-02T10:00:08.500Z', payload: { providerStatus: 'DELIVRD' } },
      ],
      routingDecision: { providerId: 1, smppConfigId: 1, routeRuleId: 1, priceMinor: 25, billingState: 'debited', attemptCount: 1, lastErrorCode: null, lastErrorMessage: null },
    });
  }

  if (req.method === 'GET' && path === '/api/v1/api-keys') return send(res, 200, state.apiKeys);
  if (req.method === 'POST' && path === '/api/v1/api-keys') {
    const body = await readJson(req);
    const createdAt = new Date().toISOString();
    const keyId = `key-${state.apiKeys.length + 1}`;
    const keyPrefix = `new${state.apiKeys.length + 1}`;
    state.apiKeys.unshift({
      id: keyId,
      keyPrefix,
      name: body.name ?? 'Created key',
      scopes: body.scopes ?? ['sms:send'],
      rateLimitRps: body.rateLimitRps ?? null,
      dailyQuota: body.dailyQuota ?? null,
      isActive: true,
      lastUsedAt: null,
      createdAt,
    });
    return send(res, 200, { id: keyId, apiKey: `sk_live_${keyPrefix}_secret`, keyPrefix, createdAt });
  }
  if (req.method === 'POST' && path.startsWith('/api/v1/api-keys/') && path.endsWith('/rotate')) {
    if (!requireReauth(req, res)) {
      return;
    }
    const rotated = { id: 'key-rotated', apiKey: 'sk_live_rotated_secret', keyPrefix: 'rot123', createdAt: new Date().toISOString() };
    state.apiKeys.unshift({ id: rotated.id, keyPrefix: rotated.keyPrefix, name: 'Rotated key', scopes: ['sms:send'], rateLimitRps: 100, dailyQuota: 100000, isActive: true, lastUsedAt: null, createdAt: rotated.createdAt });
    return send(res, 200, rotated);
  }
  if (req.method === 'DELETE' && path.startsWith('/api/v1/api-keys/')) {
    if (!requireReauth(req, res)) {
      return;
    }
    const id = path.split('/').pop();
    const apiKey = state.apiKeys.find((item) => item.id === id);
    if (apiKey) {
      apiKey.isActive = false;
    }
    return send(res, 200, { success: true });
  }

  if (req.method === 'GET' && path === '/api/v1/providers') {
    return send(res, 200, state.providers.map((item) => item.provider));
  }
  if (req.method === 'GET' && path === '/api/v1/providers/1') {
    return send(res, 200, state.providers[0]);
  }
  if (req.method === 'POST' && path === '/api/v1/providers/1/circuit') {
    if (!requireReauth(req, res)) {
      return;
    }
    return send(res, 200, { success: true });
  }

  if (req.method === 'GET' && path === '/api/v1/audit/logs') {
    const action = url.searchParams.get('action');
    const items = action ? state.auditLogs.filter((log) => log.action.includes(action)) : state.auditLogs;
    return send(res, 200, { items, pagination: { page: 1, limit: 50, total: items.length } });
  }

  if (req.method === 'POST' && path === '/api/v1/routing/preview') {
    return send(res, 200, { providerId: 1, routeRuleId: 1, preferredProtocol: 'smpp' });
  }

  return send(res, 404, { message: `No mock route for ${req.method} ${path}` });
});

server.listen(4010, '127.0.0.1', () => {
  console.log('Mock backend listening on http://127.0.0.1:4010');
});
