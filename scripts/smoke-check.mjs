import process from 'node:process';

async function checkEndpoint(label, url, expectedStatus = 200) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'sms-platform-smoke-check/1.0',
    },
  });

  if (response.status !== expectedStatus) {
    throw new Error(`${label} returned ${response.status} for ${url}`);
  }

  const body = await response.text();
  process.stdout.write(`${label}: ${response.status} ${url}\n`);
  return body;
}

async function main() {
  const backendUrl = process.env.SMOKE_BACKEND_URL ?? 'http://127.0.0.1:3000/health/ready';
  const frontendUrl = process.env.SMOKE_FRONTEND_URL ?? 'http://127.0.0.1:3001/api/health';

  await checkEndpoint('backend-readiness', backendUrl);

  if (process.env.SMOKE_SKIP_FRONTEND !== 'true') {
    await checkEndpoint('control-plane-health', frontendUrl);
  }
}

main().catch((error) => {
  process.stderr.write(`Smoke check failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
