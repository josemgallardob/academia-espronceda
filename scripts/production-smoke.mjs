#!/usr/bin/env node
import process from 'node:process';

const baseUrl = process.env.PRODUCTION_BASE_URL?.replace(/\/$/, '');

if (!baseUrl) {
  process.stderr.write(
    'PRODUCTION_BASE_URL is required, for example https://horario.example.com\n',
  );
  process.exit(1);
}

const origin = new URL(baseUrl).origin;

async function get(path) {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
  const text = await response.text();
  return { response, text };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const health = await get('/health');
  assert(health.response.status === 200, `/health returned ${health.response.status}`);
  assert(health.text.includes('"status":"ok"'), '/health payload was not ok');

  const ready = await get('/ready');
  assert(ready.response.status === 200, `/ready returned ${ready.response.status}`);
  assert(ready.text.includes('"database":"ok"'), '/ready did not report a healthy database');

  const spa = await get('/login');
  assert(spa.response.status === 200, `/login returned ${spa.response.status}`);
  assert(spa.text.includes('<app-root'), '/login did not serve the Angular document');

  const apiMiss = await get('/api/v1/does-not-exist');
  assert(
    apiMiss.response.status === 401 || apiMiss.response.status === 404,
    `/api/v1/does-not-exist returned ${apiMiss.response.status}`,
  );
  assert(
    apiMiss.response.headers.get('content-type')?.includes('json'),
    'API misses must stay JSON, not the SPA',
  );

  process.stdout.write(`Smoke passed against ${origin}\n`);
  process.stdout.write(`  GET /health ${health.response.status}\n`);
  process.stdout.write(`  GET /ready  ${ready.response.status} ${ready.text}\n`);
  process.stdout.write(`  GET /login  ${spa.response.status} (Angular)\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
