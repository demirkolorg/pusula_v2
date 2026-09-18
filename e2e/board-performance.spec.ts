/**
 * Opt-in diagnostic for a large board. It deliberately records metrics instead
 * of using a timing assertion: the dev server is useful for regression trends,
 * while release budgets are only evaluated in repeated production-build runs.
 */
import { test, expect } from './fixtures/auth.fixture';
import { boardPath } from './fixtures/e2e-data';

const performanceCardCount = Number(process.env.E2E_PERF_CARDS ?? 0);

test.describe('board performance diagnostic', () => {
  test.skip(
    performanceCardCount === 0,
    'Set E2E_PERF_CARDS (for example 2000) to run the large-board diagnostic.',
  );

  test('records board-load resource, navigation, and DOM metrics', async ({
    authedPage,
  }, testInfo) => {
    // A diagnostic must record a slow first render instead of failing at the
    // normal interaction assertion timeout. The report is the signal.
    testInfo.setTimeout(120_000);
    const startedAt = performance.now();
    await authedPage.goto(boardPath);
    const perfColumn = authedPage.getByRole('region', { name: 'Yük Testi', exact: true });
    await expect(perfColumn).toBeVisible({ timeout: 90_000 });
    const mountedCards = perfColumn.locator('article[aria-label]');
    if (performanceCardCount >= 200) {
      await expect(mountedCards.first()).toBeVisible({ timeout: 90_000 });
      expect(await mountedCards.count()).toBeLessThan(performanceCardCount);
    } else {
      await expect(mountedCards).toHaveCount(performanceCardCount, { timeout: 90_000 });
    }
    const boardVisibleAt = performance.now();

    const metrics = await authedPage.evaluate(() => {
      // E2E's Node-oriented tsconfig does not include lib.dom. Keep the browser
      // boundary explicit rather than weakening the test project's compiler.
      const browser = globalThis as unknown as {
        document: { querySelectorAll(selector: string): { length: number } };
        performance: {
          getEntriesByType(type: string): Array<{
            name?: string;
            duration?: number;
            transferSize?: number;
            encodedBodySize?: number;
            domContentLoadedEventEnd?: number;
            loadEventEnd?: number;
          }>;
        };
      };
      const navigation = browser.performance.getEntriesByType('navigation')[0];
      const resources = browser.performance
        .getEntriesByType('resource')
        .filter((entry) => {
          const name = entry.name ?? '';
          return name.includes('/trpc/') && name.includes('board.get');
        })
        .map((entry) => ({
          durationMs: entry.duration ?? 0,
          transferBytes: entry.transferSize ?? 0,
          encodedBodyBytes: entry.encodedBodySize ?? 0,
        }));
      return {
        navigation: navigation
          ? {
              domContentLoadedMs: navigation.domContentLoadedEventEnd,
              loadEventMs: navigation.loadEventEnd,
            }
          : null,
        boardResources: resources,
        mountedCards: browser.document.querySelectorAll('article[data-board-card-id]').length,
      };
    });

    const report = {
      fixtureCards: performanceCardCount,
      boardVisibleMs: boardVisibleAt - startedAt,
      ...metrics,
    };
    // Keep the same compact payload in the terminal output as well as the
    // Playwright attachment. Successful-run artifacts are often cleaned by
    // local Playwright settings, while this line makes repeated before/after
    // runs directly comparable from CI logs.
    console.info(`BOARD_PERF_METRIC ${JSON.stringify(report)}`);
    await testInfo.attach('board-performance.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
    // 200+ cards use the virtual window. Small fixtures retain the direct
    // render path so existing drag/drop coverage keeps its full DOM surface.
    if (performanceCardCount >= 200) {
      expect(metrics.mountedCards).toBeLessThan(performanceCardCount);
    } else {
      expect(metrics.mountedCards).toBeGreaterThanOrEqual(performanceCardCount);
    }
  });
});
