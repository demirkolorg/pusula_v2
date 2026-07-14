/**
 * Board move e2e (2026-07-14) — taşıma ailesinin UI akışları:
 *  1. Toplu kart taşıma ("Tüm kartları taşı…") — bir listedeki tüm kartlar aynı
 *     board içinde başka listenin sonuna gider; kaynak boşalır, kalıcı.
 *
 * Liste→pano, kart→pano ve pano→çalışma alanı taşımaları backend entegrasyon
 * testleriyle kapsanır; e2e burada en deterministik (tek-board, mevcut seed)
 * UI akışına odaklanır — çok-board navigasyonu + URL redirect'i flaky riski
 * taşır ve ayrı bir fixture kümesi gerektirir.
 *
 * `board-drag-drop.spec.ts` deseni: `beforeEach` reseed + `mode: 'serial'`.
 * Seçiciler erişilebilir (`getByRole`); shadcn Select radix `combobox`/`option`.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test, expect } from './fixtures/auth.fixture';
import { BoardPage } from './fixtures/board.fixture';
import { strings } from '../apps/web/src/lib/strings';
import { E2E_DATABASE_URL } from './fixtures/env';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function reseed(): void {
  execSync('pnpm exec tsx e2e/fixtures/seed.ts', {
    cwd: repoRoot,
    stdio: 'pipe',
    env: {
      ...process.env,
      DATABASE_URL: E2E_DATABASE_URL,
    },
  });
}

const columnCopy = strings.board.list.column;
const bulkCopy = strings.board.moveAllCards;

test.describe.configure({ mode: 'serial' });

test.describe('board move — bulk card move', () => {
  test.beforeEach(() => {
    reseed();
  });

  test('moves every card from one list to another via the list ⋮ menu; persists across reload', async ({
    authedPage,
  }) => {
    const board = new BoardPage(authedPage);
    await board.goto();

    // Başlangıç durumu (seed): Liste 1 = [A, B, C], Liste 2 = [D, E].
    await expect
      .poll(() => board.cardTitlesIn('Liste 1'))
      .toEqual(['Kart A', 'Kart B', 'Kart C']);
    await expect.poll(() => board.cardTitlesIn('Liste 2')).toEqual(['Kart D', 'Kart E']);

    // Liste 1 ⋮ menüsünü aç → "Tüm kartları taşı…".
    await board.column('Liste 1').getByRole('button', { name: columnCopy.more }).click();
    await authedPage.getByRole('menuitem', { name: bulkCopy.trigger }).click();

    // Diyalog: hedef liste seçici (radix Select) → "Liste 2" → "Taşı".
    await expect(authedPage.getByRole('dialog')).toBeVisible();
    await authedPage.getByRole('combobox', { name: bulkCopy.listLabel }).click();
    await authedPage.getByRole('option', { name: 'Liste 2', exact: true }).click();
    await authedPage.getByRole('button', { name: bulkCopy.submit, exact: true }).click();

    // Kaynak liste boşaldı; taşınanlar hedefin sonuna, kendi sıralarıyla eklendi.
    await expect.poll(() => board.cardTitlesIn('Liste 1')).toEqual([]);
    await expect
      .poll(() => board.cardTitlesIn('Liste 2'))
      .toEqual(['Kart D', 'Kart E', 'Kart A', 'Kart B', 'Kart C']);

    // Kalıcı — reload sonrası aynı durum.
    await authedPage.reload();
    await expect(board.column('Liste 1')).toBeVisible();
    await expect.poll(() => board.cardTitlesIn('Liste 1')).toEqual([]);
    await expect
      .poll(() => board.cardTitlesIn('Liste 2'))
      .toEqual(['Kart D', 'Kart E', 'Kart A', 'Kart B', 'Kart C']);
  });
});
