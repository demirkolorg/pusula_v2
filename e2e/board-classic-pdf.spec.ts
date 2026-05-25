/**
 * Faz 14G — Klasik Pano PDF Raporu E2E (DEM-297).
 *
 * Spec kaynağı: `docs/process/08-faz-14-klasik-pdf-plani.md` §8.6 + Faz 14E/14F.
 * Mevcut `auth.fixture` + `board.fixture` reuse (seed otomatik).
 *
 * Senaryolar (V1 minimal):
 *  1. Authenticated user — pano "Ayarlar" dropdown → "Rapor İndir" tıkla →
 *     download tetiklenir, filename `{slug}-raporu-{tarih}.pdf` pattern'inde,
 *     ilk bayt'lar `%PDF-` magic header.
 *  2. Anonim user — `GET /api/boards/[boardId]/report` → 401.
 *
 * Faz 14 backend + UI tüm test'leri (route 10/10 + filename 11 + hook 4 +
 * component 8 + data service 6 PG = 39) yeşilse bu E2E "happy path" + 401
 * gating'i son confirmation. Permission matrix (viewer/member/admin/owner)
 * route.test.ts'de unit edildi (mock fakeDb 3-call sequence).
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { strings } from '../apps/web/src/lib/strings';
import { test, expect } from './fixtures/auth.fixture';
import { BoardPage } from './fixtures/board.fixture';
import { E2E_DATABASE_URL } from './fixtures/env';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function reseed(): void {
  execSync('pnpm exec tsx e2e/fixtures/seed.ts', {
    cwd: repoRoot,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Faz 14 — Klasik Pano PDF Raporu', () => {
  test.beforeEach(() => {
    test.setTimeout(60_000);
    reseed();
  });

  test('owner: pano Ayarlar dropdown → Rapor İndir → PDF iner + filename pattern + %PDF- magic', async ({
    authedPage,
  }) => {
    const board = new BoardPage(authedPage);
    await board.goto();

    // Ayarlar dropdown'u aç (BoardSettingsDropdown trigger: `strings.board.topBar.settings`).
    await authedPage
      .getByRole('button', { name: strings.board.topBar.settings, exact: true })
      .click();

    // "Pano işlemleri" sekmesine geç (background ↔ actions). Actions sekmesinde
    // "Rapor İndir" item'ı çizilir.
    await authedPage
      .getByRole('tab', { name: strings.board.settings.tabActions })
      .click();

    const downloadPromise = authedPage.waitForEvent('download');
    await authedPage
      .getByRole('menuitem', { name: strings.board.topBar.menuDownloadReport })
      .click();
    const download = await downloadPromise;

    // 14A karar 9 — `{pano-slug}-raporu-{YYYY-MM-DD}.pdf` ASCII-clean.
    expect(download.suggestedFilename()).toMatch(/^[a-z0-9-]+-raporu-\d{4}-\d{2}-\d{2}\.pdf$/);

    const downloadedPath = await download.path();
    if (!downloadedPath) {
      throw new Error('download.path() döndü null — Playwright dosyayı kaydedemedi');
    }
    const fs = await import('node:fs/promises');
    const buffer = await fs.readFile(downloadedPath);
    // PDF magic bytes — 14C `pdf().toBuffer()` çıkışı PDF spec'ine uygun olmalı.
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    // Boş tampon kontrolü — gerçek PDF içeriği üretildi (yalnız header değil).
    expect(buffer.length).toBeGreaterThan(1024);
  });

  test('anonim: GET /api/boards/[boardId]/report → 401', async ({ page }) => {
    // Anonim Playwright `page` (auth.fixture yerine vanilla) — cookie yok.
    const boardId = 'b1'; // seed.ts'de gerçek id var; 401 her id için aynı.
    const response = await page.request.get(`/api/boards/${boardId}/report`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });
});
