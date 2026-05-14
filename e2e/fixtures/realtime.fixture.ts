/**
 * Realtime two-user fixture (Faz 5D — DEM-86).
 *
 * The Faz 3D `auth.fixture.ts` ships a single `authedPage` per test; the
 * realtime specs need *two* simultaneous browser contexts (one for `alice`,
 * one for `bob`) sharing the same seeded board. This extends Playwright's base
 * `test` with two fresh contexts + pages, each signed into the shared board
 * via Better Auth's HTTP sign-in endpoint (same approach as `auth.fixture.ts`).
 *
 * The two contexts are independent: cookie jars are isolated, sockets are
 * separate `Socket.IO` instances, and one tab pulling the rug on its
 * connection doesn't affect the other. This is the property the specs lean on
 * — Alice mutates → Bob observes via realtime.
 */
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { E2E } from './e2e-data';
import { signIn } from './auth.fixture';

export interface RealtimePeer {
  /** Browser context owning `page` (kept around for explicit teardown). */
  context: BrowserContext;
  /** Authenticated page driven by the test. */
  page: Page;
}

interface RealtimeFixtures {
  alicePeer: RealtimePeer;
  bobPeer: RealtimePeer;
}

export const test = base.extend<RealtimeFixtures>({
  alicePeer: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, E2E.alice);
    await use({ context, page });
    await context.close();
  },
  bobPeer: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, E2E.bob);
    await use({ context, page });
    await context.close();
  },
});

export { expect };
