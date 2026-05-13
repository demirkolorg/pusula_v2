import { defineConfig, devices } from '@playwright/test';
import { E2E_API_URL, E2E_DATABASE_URL, E2E_WEB_URL } from './e2e/fixtures/env';

/**
 * Playwright e2e harness for Pusula (Faz 3D — DEM-45). Lives at the repo root,
 * NOT as a workspace package: `playwright.config.ts` + `e2e/*.spec.ts` +
 * `e2e/fixtures/`, with `@playwright/test` as a repo-root devDep
 * (`docs/architecture/10-platform.md` §10.1).
 *
 * What it does:
 *  - `webServer` boots the API (`apps/api`) and the web app (`apps/web`) — the
 *    worker is NOT needed for drag-drop e2e (position compaction is async /
 *    best-effort), so it's skipped.
 *  - The test database is the repo-root `docker-compose.yml` Postgres/Redis
 *    stack (`pnpm infra:up`); `globalSetup` runs `pnpm db:migrate` and a
 *    deterministic e2e seed (a known test user/password, one workspace, one
 *    board with 3 lists × cards at known positions, plus a `viewer` user).
 *  - Drag is driven by Playwright `mouse.move` steps (Pragmatic DnD uses native
 *    drag events — see `e2e/helpers/dnd.ts`).
 *
 * Run locally: `pnpm infra:up` → `pnpm db:migrate` → `pnpm exec playwright install chromium`
 * → `pnpm test:e2e`. See `e2e/README.md`.
 */

const WEB_PORT = Number(process.env.WEB_PORT ?? 3000);
const API_PORT = Number(process.env.API_PORT ?? 3001);

// The local docker-compose stack (host ports — see docker-compose.yml).
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6380';
// Better Auth needs a >=16 char secret; a fixed dev value is fine for e2e.
const AUTH_SECRET = process.env.AUTH_SECRET ?? 'pusula-e2e-auth-secret-please-change';

/** Env vars shared by both webServer processes. */
const baseServerEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: E2E_DATABASE_URL,
  REDIS_URL,
  AUTH_SECRET,
  APP_URL: E2E_WEB_URL,
  API_URL: E2E_API_URL,
  API_PORT: String(API_PORT),
  WEB_PORT: String(WEB_PORT),
  NEXT_PUBLIC_API_URL: E2E_API_URL,
};

/**
 * Web-only env additions:
 *  - `PORT` makes `next dev` bind to the correct port (it ignores `WEB_PORT`).
 *    Without this, `next dev` always starts on 3000 and `webServer.url` never
 *    resolves when WEB_PORT != 3000, causing a 120 s timeout.
 */
const webServerEnv = {
  ...baseServerEnv,
  PORT: String(WEB_PORT),
};

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // Drag-drop specs share the seeded board (re-seeded per-test); run them
  // serially in one worker so order/state is predictable.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Booting two dev servers + a fresh seed takes a while; be generous.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'playwright-results.xml' }],
  ],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: E2E_WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // API (Hono + tRPC + Better Auth). `tsx watch` is the dev entry; reuse a
      // running instance locally so the suite is fast on a warm machine.
      command: 'pnpm --filter @pusula/api-server dev',
      url: `${E2E_API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: baseServerEnv,
    },
    {
      // Web (Next.js dev server).
      // `PORT` in the env is what `next dev` actually reads to bind its port;
      // WEB_PORT alone is ignored by Next.js and would cause a timeout if
      // WEB_PORT != 3000 (the url would never become reachable).
      command: 'pnpm --filter @pusula/web dev',
      url: E2E_WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: webServerEnv,
    },
  ],
});
