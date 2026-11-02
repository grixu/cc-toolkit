import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { recastVideo } from 'playwright-recast/config';

const ROOT = __dirname;
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5005';
const FAST = process.env.RECAST_FAST === '1';

export default defineConfig({
  testDir: path.join(ROOT, 'tests'),
  // one folder per take, so a retake never overwrites the trace the last render used
  outputDir: path.join(ROOT, 'test-results', process.env.TAKE ?? 'scratch'),
  workers: 1,
  // a dry run with real waits shrunk should finish in minutes; a stuck one must fail, not hang
  timeout: (FAST ? 5 : 12) * 60_000,
  reporter: 'list',
  use: { baseURL: FRONTEND_URL },
  projects: [
    { name: 'setup', testMatch: /setup\.setup\.ts/, teardown: 'teardown' },
    {
      name: 'walkthrough',
      dependencies: ['setup'],
      testMatch: /\.walk\.ts/,
      use: {
        ...recastVideo({ viewport: { width: 1920, height: 1080 }, scale: 1.5 }),
        baseURL: FRONTEND_URL,
        storageState: path.join(ROOT, '.state', 'storage.json'),
        permissions: ['clipboard-read', 'clipboard-write'],
        trace: 'on',
      },
    },
    { name: 'teardown', testMatch: /teardown\.teardown\.ts/ },
  ],
});
