import { check, sleep } from 'k6';
import { guardTarget, postJson, requireEnv } from './lib/helpers.js';

export const options = {
  vus: 30,
  duration: '2m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

const baseUrl = requireEnv('TARGET_BASE_URL');
guardTarget(baseUrl);

export default function () {
  const providerCode = requireEnv('PROVIDER_CODE');
  const response = postJson(`${baseUrl}/providers/${providerCode}/dlr`, {
    providerMessageId: `provider-msg-${__VU}-${__ITER}`,
    phoneNumber: '+251911000001',
    senderId: __ENV.SENDER_ID ?? 'TEST',
    status: __ITER % 2 === 0 ? 'delivered' : 'failed',
    eventAt: new Date().toISOString(),
    bodyHash: 'load-test',
  });

  check(response, {
    'dlr accepted': (res) => res.status === 201 || res.status === 200,
  });
  sleep(0.2);
}
