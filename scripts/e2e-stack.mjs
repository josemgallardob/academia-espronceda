import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadE2eEnvironment } from './e2e-environment.mjs';

const environment = {
  ...loadE2eEnvironment(),
  INIT_CWD: resolve('.'),
};

const prepared = spawnSync(process.execPath, ['scripts/prepare-e2e.mjs'], {
  env: environment,
  stdio: 'inherit',
});
if (prepared.status !== 0) {
  process.exit(prepared.status ?? 1);
}

const children = [];
let stopping = false;

function stopAll(signal = 'SIGTERM') {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

function startService(name, command, args) {
  const child = spawn(command, args, {
    env: environment,
    stdio: 'inherit',
  });
  child.service = name;
  children.push(child);
  child.on('error', (error) => {
    console.error(`Could not start ${name}: ${error.message}`);
    process.exitCode = 1;
    stopAll();
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${name} stopped unexpectedly (${signal ?? `exit ${code}`})`);
      process.exitCode = code || 1;
      stopAll();
    }
  });
  return child;
}

startService('api', 'npm', ['run', 'start', '--workspace', '@academia-espronceda/api']);
startService('solver', '.venv/bin/python', ['-m', 'academia_espronceda_solver']);

await Promise.all([
  waitForHttp(`http://127.0.0.1:${environment.API_PORT}/health`, 'api'),
  waitForHttp(`http://127.0.0.1:${environment.SOLVER_PORT}/health`, 'solver'),
]);

startService('web', 'npm', [
  'run',
  'start',
  '--workspace',
  '@academia-espronceda/web',
  '--',
  '--host',
  environment.WEB_HOST,
  '--port',
  environment.WEB_PORT,
  '--watch=false',
]);

console.log(`E2E libSQL database: ${environment.DATABASE_URL}`);
console.log(
  `Starting e2e web :${environment.WEB_PORT}, API :${environment.API_PORT}, solver :${environment.SOLVER_PORT}`,
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stopAll(signal));
}

async function waitForHttp(url, name, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The process is still binding the port.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for ${name} at ${url}`);
}
