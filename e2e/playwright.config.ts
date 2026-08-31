import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { E2E_ORIGIN, E2E_RESET_TOKEN } from './support/constants';

const repositoryRoot = resolve(__dirname, '..');
process.env.E2E_RESET_TOKEN ??= E2E_RESET_TOKEN;

const criticalBrowsers = process.env.E2E_BROWSERS === 'all';

export default defineConfig({
  testDir: './journeys',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: E2E_ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-ES',
  },
  webServer: {
    command: 'node scripts/e2e-stack.mjs',
    cwd: repositoryRoot,
    url: E2E_ORIGIN,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: criticalBrowsers
    ? [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
      ]
    : [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'], channel: 'chrome' },
        },
      ],
});
