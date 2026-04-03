import http from 'k6/http';
import { fail } from 'k6';

export function requireEnv(name) {
  const value = __ENV[name];
  if (!value) {
    fail(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function guardTarget(baseUrl) {
  const hostname = new URL(baseUrl).hostname;
  const allowProduction = __ENV.ALLOW_PRODUCTION_TARGET === 'true';
  const localHosts = ['localhost', '127.0.0.1', 'host.docker.internal'];
  const stagingLike = hostname.includes('staging');
  if (!allowProduction && !localHosts.includes(hostname) && !stagingLike) {
    fail(`Refusing to run against ${hostname} without ALLOW_PRODUCTION_TARGET=true`);
  }
}

export function jsonHeaders(headers = {}) {
  return {
    'Content-Type': 'application/json',
    ...headers,
  };
}

export function postJson(url, body, params = {}) {
  return http.post(url, JSON.stringify(body), {
    ...params,
    headers: jsonHeaders(params.headers),
  });
}
