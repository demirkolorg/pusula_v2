/**
 * Auth fixture (Faz 3D — DEM-45). Produces an authenticated `page` for the
 * seeded test user (or the seeded `viewer`).
 *
 * Approach: sign in via Better Auth's HTTP endpoint
 * (`POST {API_URL}/api/auth/sign-in/email`) using `request` from the same
 * browser context as `page` — so the `Set-Cookie` lands in the context's cookie
 * jar. The web app's `authClient.useSession()` then sees the session (the
 * session cookie is set on the API origin; web→API requests go with
 * `credentials: 'include'`, same-site `localhost`). This is more deterministic
 * than driving the sign-in UI (no waiting on a client-side redirect).
 *
 * Exposes `test.authedPage` (the test user) and `test.viewerPage` (the viewer).
 * Worker-scoped storage state would be nicer, but per-test sign-in is plenty
 * fast and keeps each test independent of cookie reuse.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { E2E } from './e2e-data';
import { E2E_API_URL } from './env';

/**
 * Sign `page` in via Better Auth's HTTP endpoint and verify the session cookie
 * landed in the context's jar. Exported because the realtime fixture (Faz 5D —
 * DEM-86) signs *two* peers into separate contexts and needs the same flow.
 */
export async function signIn(
  page: Page,
  creds: { email: string; password: string },
): Promise<void> {
  const res = await page.request.post(`${E2E_API_URL}/api/auth/sign-in/email`, {
    data: { email: creds.email, password: creds.password },
    headers: { 'content-type': 'application/json' },
  });
  expect(
    res.ok(),
    `sign-in failed for ${creds.email}: ${res.status()} ${await res.text().catch(() => '')}`,
  ).toBeTruthy();

  // Confirm the session cookie made it into the context's jar (Better Auth's
  // default cookie name is `better-auth.session_token`; match loosely in case
  // of a config prefix).
  const cookies = await page.context().cookies();
  expect(
    cookies.some((c) => c.name.includes('session_token')),
    `expected a Better Auth session cookie after sign-in for ${creds.email}`,
  ).toBeTruthy();
}

type AuthFixtures = {
  authedPage: Page;
  viewerPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page }, use) => {
    await signIn(page, E2E.user);
    await use(page);
  },
  viewerPage: async ({ browser }, use) => {
    // A fresh context so the viewer's cookies don't mix with `authedPage`.
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, E2E.viewer);
    await use(page);
    await context.close();
  },
});

export { expect };
