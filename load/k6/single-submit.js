import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { guardTarget, postJson, requireEnv } from './lib/helpers.js';

export const options = {
  scenarios: {
    single_submit: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 500,
      stages: [
        { target: 250, duration: '1m' },
        { target: 500, duration: '2m' },
        { target: 100, duration: '30s' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1500'],
  },
};

const accepted = new Counter('sms_submit_accepted');
const baseUrl = requireEnv('TARGET_BASE_URL');
guardTarget(baseUrl);

export default function () {
  const apiKey = requireEnv('API_KEY');
  const senderId = requireEnv('SENDER_ID');
  const response = postJson(`${baseUrl}/messages`, {
    phoneNumber: '+251911000001',
    body: `Load test OTP ${Date.now()}`,
    senderId,
    trafficType: 'otp',
  }, {
    headers: {
      'x-api-key': apiKey,
      'x-idempotency-key': `${__VU}-${__ITER}-${Date.now()}`,
    },
  });

  const ok = check(response, {
    'submit accepted': (res) => res.status === 201 || res.status === 200,
  });
  if (ok) {
    accepted.add(1);
  }
  sleep(0.1);
}
