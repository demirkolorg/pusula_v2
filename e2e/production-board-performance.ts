/**
 * Repeated, warm browser measurement against an already-started production
 * web build. Kept outside Playwright config so it never starts a dev web
 * server or re-seeds between samples.
 */
import { chromium } from '@playwright/test';

const webUrl = process.env.APP_URL ?? 'http://localhost:3002';
const apiUrl = process.env.API_URL ?? 'http://localhost:3001';
const runs = Number(process.env.E2E_PERF_RUNS ?? 5);
const boardPath = '/workspaces/e2e-workspace/boards/e2e-board';

const browser = await chromium.launch();
const results: number[] = [];
try {
  for (let index = 0; index < runs; index += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const signIn = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
      data: { email: 'e2e-user@pusula.test', password: 'e2e-password-1234' },
      headers: { 'content-type': 'application/json' },
    });
    if (!signIn.ok()) throw new Error(`Sign-in failed: ${signIn.status()}`);
    const startedAt = performance.now();
    await page.goto(`${webUrl}${boardPath}`);
    await page.getByRole('region', { name: 'Yük Testi', exact: true }).waitFor({
      state: 'visible',
      timeout: 90_000,
    });
    await page.locator('article[data-board-card-id]').first().waitFor({
      state: 'visible',
      timeout: 90_000,
    });
    const elapsedMs = performance.now() - startedAt;
    const mountedCards = await page.locator('article[data-board-card-id]').count();
    results.push(elapsedMs);
    console.info(`BOARD_PROD_PERF_RUN ${index + 1} ${elapsedMs.toFixed(1)}ms ${mountedCards} cards`);
    await context.close();
  }
} finally {
  await browser.close();
}

const sorted = [...results].sort((a, b) => a - b);
const percentile = (p: number) => sorted[Math.ceil(sorted.length * p) - 1] ?? 0;
console.info(
  `BOARD_PROD_PERF_SUMMARY ${JSON.stringify({ runs: results.length, valuesMs: results.map((value) => Number(value.toFixed(1))), medianMs: Number(percentile(0.5).toFixed(1)), p75Ms: Number(percentile(0.75).toFixed(1)), p95Ms: Number(percentile(0.95).toFixed(1)) })}`,
);
