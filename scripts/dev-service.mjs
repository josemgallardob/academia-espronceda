import { spawn } from 'node:child_process';
import { loadLocalEnvironment, prepareLocalDatabase } from './local-environment.mjs';

const service = process.argv[2];
const environment = loadLocalEnvironment();
prepareLocalDatabase(environment);

const commands = {
  web: [
    'npm',
    [
      'run',
      'start',
      '--workspace',
      '@academia-espronceda/web',
      '--',
      '--host',
      environment.WEB_HOST,
      '--port',
      environment.WEB_PORT,
    ],
  ],
  api: ['npm', ['run', 'start:dev', '--workspace', '@academia-espronceda/api']],
  solver: ['.venv/bin/python', ['-m', 'academia_espronceda_solver']],
};

const command = commands[service];
if (!command) {
  throw new Error(`Unknown service "${service}". Expected web, api, or solver.`);
}

const child = spawn(command[0], command[1], {
  env: environment,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  console.error(`Could not start ${service}: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
