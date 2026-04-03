import { check, sleep } from 'k6';
import { guardTarget, postJson, requireEnv } from './lib/helpers.js';

export const options = {
  vus: 20,
  duration: '3m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
  },
};

const baseUrl = requireEnv('TARGET_BASE_URL');
guardTarget(baseUrl);

export default function () {
  const token = requireEnv('BEARER_TOKEN');
  const senderId = requireEnv('SENDER_ID');
  const contactGroupId = Number(requireEnv('CONTACT_GROUP_ID'));
  const response = postJson(`${baseUrl}/campaigns/schedule`, {
    campaignName: `load-campaign-${__VU}-${__ITER}`,
    senderId,
    templateRef: null,
    contactGroupId,
    startAt: new Date(Date.now() + 60_000).toISOString(),
    recurrenceCron: '0 8 * * *',
    shardCount: 4,
  }, {
    headers: {
      authorization: `Bearer ${token}`,
      'x-idempotency-key': `${__VU}-${__ITER}-${Date.now()}`,
    },
  });

  check(response, {
    'campaign scheduled': (res) => res.status === 201 || res.status === 200,
  });
  sleep(1);
}
