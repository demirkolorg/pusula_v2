/**
 * Faz 16D (DEM-313) — Planlayıcı paneli + Google Takvim entegrasyonu e2e.
 *
 * **Kapsam (V1):**
 *   1. Planlayıcı toggle paneli açar/kapatır (@smoke).
 *   2. Bağlı olmayan kullanıcıda "Hesap bağla" CTA `/account?tab=integrations`'a gider.
 *   3. /account Tabs'inde "Entegrasyonlar" sekmesi + Google Takvim kartı render olur.
 *
 * **Kapsam dışı (Faz 8 hardening):** Better Auth `genericOAuth` mock OAuth
 * provider + bağlı flow → modal → Google'da aç. Mock provider için stub
 * OAuth server kurulumu 1+ gün; Faz 16'nın MVP'sinden ayrılır (`test.fixme`).
 *   - `bağlı kullanıcıda etkinlik render + modal açma` — fixme.
 *   - `window focus refetch` — fixme.
 *   - `reconnect 401 flow` — fixme.
 *
 * Seed (`e2e/fixtures/seed.ts`): `E2E.user` mevcut kullanıcı; Google Calendar
 * `account` row YOK (bağlı değil senaryosu için doğru başlangıç).
 *
 * Selector stratejisi: `aria-label` (i18n string'lerden — `strings.board.planner.*`),
 * `getByRole` + accessible name.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test, expect, signIn } from './fixtures/auth.fixture';
import { E2E } from './fixtures/e2e-data';
import { E2E_DATABASE_URL } from './fixtures/env';
import { strings } from '../apps/web/src/lib/strings';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function reseed(): void {
  execSync('pnpm exec tsx e2e/fixtures/seed.ts', {
    cwd: repoRoot,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
  });
}

test.beforeEach(() => {
  reseed();
});

test.describe('Planlayıcı paneli (Faz 16)', () => {
  test('toggle: LeftRail Calendar ikonu panelı açar ve X butonu kapatır @smoke', async ({
    page,
  }) => {
    await signIn(page, E2E.user);

    const togglePlanner = page.getByRole('button', {
      name: strings.board.planner.toggle,
      exact: true,
    });
    await expect(togglePlanner).toBeVisible();
    await expect(togglePlanner).toHaveAttribute('aria-pressed', 'false');

    await togglePlanner.click();
    await expect(togglePlanner).toHaveAttribute('aria-pressed', 'true');

    const closeBtn = page.getByRole('button', {
      name: strings.board.planner.close,
      exact: true,
    });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(togglePlanner).toHaveAttribute('aria-pressed', 'false');
  });

  test('bağlı değil: "Hesap bağla" CTA Ayarlar > Entegrasyonlar sekmesine götürür', async ({
    page,
  }) => {
    await signIn(page, E2E.user);

    await page
      .getByRole('button', { name: strings.board.planner.toggle, exact: true })
      .click();

    // Boş durum CTA görünür.
    const cta = page.getByRole('link', {
      name: new RegExp(strings.board.planner.notConnected.cta),
    });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/account?tab=integrations');

    await cta.click();
    await page.waitForURL(/\/account\?tab=integrations/);

    // Entegrasyonlar sekmesi seçili + Google Takvim kartı görünür.
    await expect(
      page.getByRole('tab', { name: strings.account.tabs.integrations }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByText(strings.account.integrations.google.title),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: strings.account.integrations.google.connect,
        exact: true,
      }),
    ).toBeVisible();
  });

  test('Entegrasyonlar sekmesi doğrudan derin link ile erişilebilir (?tab=integrations)', async ({
    page,
  }) => {
    await signIn(page, E2E.user);
    await page.goto('/account?tab=integrations');

    await expect(
      page.getByRole('tab', { name: strings.account.tabs.integrations }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByText(strings.account.integrations.google.title),
    ).toBeVisible();
  });

  test.fixme(
    'bağlı kullanıcıda etkinlik fetch + modal → "Google\'da aç" (Faz 8: genericOAuth mock provider)',
    () => {
      // Better Auth `genericOAuth` plugin için stub OAuth server gerek;
      // Pusula e2e altyapısında mock server yok. Faz 8 (Sertleştirme) içinde
      // `e2e/helpers/oauth-mock.ts` + auth `accounts` seed helper ile açılır.
    },
  );

  test.fixme(
    'window focus refetch: bağlı kullanıcıda sekme dön sonrası planner.events.list yeniden çağrılır',
    () => {
      // Aynı mock provider bağımlılığı — Faz 8.
    },
  );

  test.fixme(
    'reconnect 401: Google API 401 dönerse "Bağlantıyı yenile" CTA görünür',
    () => {
      // Aynı mock provider bağımlılığı — Faz 8.
    },
  );
});
