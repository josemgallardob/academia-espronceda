import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { E2E_DATABASE_PATH, loadE2eEnvironment } from './e2e-environment.mjs';

const environment = loadE2eEnvironment();
const databasePath = E2E_DATABASE_PATH;

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${databasePath}${suffix}`, { force: true });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    env: environment,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('npm', ['run', 'db:migrate']);
run(process.execPath, ['scripts/run-e2e-admin.mjs', 'seed']);
console.log('E2E database prepared.');
