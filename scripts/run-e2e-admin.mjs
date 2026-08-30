import { spawnSync } from 'node:child_process';
import { loadE2eEnvironment } from './e2e-environment.mjs';

const command = process.argv[2];
const scripts = {
  seed: ['run', 'seed:e2e', '--workspace', '@academia-espronceda/api'],
  reset: ['run', 'reset:e2e', '--workspace', '@academia-espronceda/api'],
};

if (!scripts[command]) {
  throw new Error('Expected seed or reset');
}

const result = spawnSync('npm', scripts[command], {
  env: loadE2eEnvironment(),
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
