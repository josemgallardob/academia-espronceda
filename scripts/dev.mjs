import { spawn } from 'node:child_process';
import { loadLocalEnvironment, prepareLocalDatabase } from './local-environment.mjs';

const environment = loadLocalEnvironment();
const databasePath = prepareLocalDatabase(environment);
const services = ['web', 'api', 'solver'];
const children = services.map((service) => {
  const child = spawn('npm', ['run', `dev:${service}`], {
    env: environment,
    stdio: 'inherit',
  });
  child.service = service;
  return child;
});

console.log(`Local libSQL database: ${databasePath}`);
console.log(
  `Starting web :${environment.WEB_PORT}, API :${environment.API_PORT}, and solver :${environment.SOLVER_PORT}`,
);

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

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stopAll(signal));
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(`Could not start ${child.service}: ${error.message}`);
    process.exitCode = 1;
    stopAll();
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${child.service} stopped unexpectedly (${signal ?? `exit ${code}`})`);
      process.exitCode = code || 1;
      stopAll();
    }
  });
}
