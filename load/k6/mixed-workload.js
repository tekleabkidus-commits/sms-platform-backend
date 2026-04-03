import { sleep } from 'k6';
import exec from 'k6/execution';
import { guardTarget, postJson, requireEnv } from './lib/helpers.js';

export const options = {
  scenarios: {
    transactional_submit: {
      executor: 'constant-arrival-rate',
      rate: 150,
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 50,
      maxVUs: 400,
      exec: 'transactionalSubmit',
    },
    bulk_schedule: {
      executor: 'constant-vus',
      vus: 10,
      duration: '3m',
      exec: 'scheduleCampaigns',
    },
    dlr_callbacks: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 50,
      maxVUs: 400,
      exec: 'sendDlr',
    },
  },
};

const baseUrl = requireEnv('TARGET_BASE_URL');
guardTarget(baseUrl);

export function transactionalSubmit() {
  const apiKey = requireEnv('API_KEY');
  const senderId = requireEnv('SENDER_ID');
  postJson(`${baseUrl}/messages`, {
    phoneNumber: '+251911000001',
    body: `Mixed load OTP ${Date.now()}`,
    senderId,
    trafficType: 'otp',
  }, {
    headers: {
      'x-api-key': apiKey,
      'x-idempotency-key': `mix-submit-${exec.vu.idInTest}-${exec.scenario.iterationInTest}-${Date.now()}`,
    },
  });
  sleep(0.05);
}

export function scheduleCampaigns() {
  const token = requireEnv('BEARER_TOKEN');
  const senderId = requireEnv('SENDER_ID');
  const contactGroupId = Number(requireEnv('CONTACT_GROUP_ID'));
  postJson(`${baseUrl}/campaigns/schedule`, {
    campaignName: `mix-campaign-${exec.vu.idInTest}-${Date.now()}`,
    senderId,
    contactGroupId,
    startAt: new Date(Date.now() + 120_000).toISOString(),
    shardCount: 8,
  }, {
    headers: {
      authorization: `Bearer ${token}`,
      'x-idempotency-key': `mix-campaign-${exec.vu.idInTest}-${exec.scenario.iterationInTest}-${Date.now()}`,
    },
  });
  sleep(1);
}

export function sendDlr() {
  const providerCode = requireEnv('PROVIDER_CODE');
  postJson(`${baseUrl}/providers/${providerCode}/dlr`, {
    providerMessageId: `mix-provider-msg-${exec.vu.idInTest}-${exec.scenario.iterationInTest}`,
    phoneNumber: '+251911000001',
    senderId: __ENV.SENDER_ID ?? 'TEST',
    status: exec.scenario.iterationInTest % 3 === 0 ? 'failed' : 'delivered',
    eventAt: new Date().toISOString(),
    bodyHash: 'mixed-workload',
  });
  sleep(0.05);
}
