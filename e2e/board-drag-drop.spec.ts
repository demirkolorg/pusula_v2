/**
 * Board drag-drop e2e (Faz 3D — DEM-45). Covers the Phase 3B board UI
 * (`docs/architecture/08-web-ve-mobil.md` §8.1.8 / `05-board-mekanigi.md` §5.1):
 *  1. card reorder within a list,
 *  2. list (column) reorder,
 *  3. cross-list card move,
 *  4. optimistic rollback when `card.move` fails — generic error and `CONFLICT`,
 *  5. (read-only) a `viewer` has no drag handles.
 *
 * Each test re-seeds the board first (`beforeEach`) so it starts from a known
 * state regardless of order; `mode: 'serial'` keeps the suite on one worker.
 * Drag is driven by `dragElement` (Playwright mouse steps — Pragmatic DnD uses
 * native drag events). Selectors are accessible (`getByRole`/`getByLabel`).
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test, expect } from './fixtures/auth.fixture';
import { BoardPage } from './fixtures/board.fixture';
import { dragElement } from './helpers/dnd';
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

test.describe.configure({ mode: 'serial' });

test.describe('board drag-drop', () => {
  test.beforeEach(() => {
    reseed();
  });

  test('card reorder within a list — drop Kart B above Kart A; persists across reload', async ({
    authedPage,
  }) => {
    const board = new BoardPage(authedPage);
    await board.goto();

    await expect.poll(() => board.cardTitlesIn('Liste 1')).toEqual(['Kart A', 'Kart B', 'Kart C']);

    // Drag "Kart B" onto the top edge of "Kart A" → order becomes B, A, C.
    await dragElement(
      authedPage,
      board.card('Kart B', 'Liste 1'),
      board.card('Kart A', 'Liste 1'),
      {
        edge: 'top',
      },
    );

    await expect.poll(() => board.cardTitlesIn('Liste 1')).toEqual(['Kart B', 'Kart A', 'Kart C']);

    await authedPage.reload();
    await expect(board.column('Liste 1')).toBeVisible();
    await expect.poll(() => board.cardTitlesIn('Liste 1')).toEqual(['Kart B', 'Kart A', 'Kart C']);
  });

  test('list (column) reorder — drop Liste 2 before Liste 1; persists across reload', async ({
    authedPage,
  }) => {
    const board = new BoardPage(authedPage);
    await board.goto();

    await expect.poll(() => board.columnTitles()).toEqual(['Liste 1', 'Liste 2', 'Liste 3']);

    // Drag the "Liste 2" column (by its header handle) onto the left edge of "Liste 1".
    await dragElement(authedPage, board.column('Liste 2'), board.column('Liste 1'), {
      edge: 'left',
      sourceHandle: board.columnDragHandle('Liste 2'),
    });

    await expect.poll(() => board.columnTitles()).toEqual(['Liste 2', 'Liste 1', 'Liste 3']);

    await authedPage.reload();
    await expect(board.column('Liste 1')).toBeVisible();
    await expect.poll(() => board.columnTitles()).toEqual(['Liste 2', 'Liste 1', 'Liste 3']);
  });

  test('cross-list card move — drag Kart A from Liste 1 to Liste 2; persists across reload', async ({
    authedPage,
  }) => {
    const board = new BoardPage(authedPage);
    await board.goto();

    await expect.poll(() => board.cardTitlesIn('Liste 1')).toEqual(['Kart A', 'Kart B', 'Kart C']);
    await expect.poll(() => board.cardTitlesIn('Liste 2')).toEqual(['Kart D', 'Kart E']);

    // Drop "Kart A" onto the bottom edge of "Kart E" in Liste 2 → it joins Liste 2 at the end.
    await dragElement(
      authedPage,
      board.card('Kart A', 'Liste 1'),
      board.card('Kart E', 'Liste 2'),
      {
        edge: 'bottom',
      },
    );

    await expect.poll(() => board.cardTitlesIn('Liste 1')).toEqual(['Kart B', 'Kart C']);
    await expect.poll(() => board.cardTitlesIn('Liste 2')).toEqual(['Kart D', 'Kart E', 'Kart A']);

    await authedPage.reload();
    await expect(board.column('Liste 1')).toBeVisible();
    await expect.poll(() => board.cardTitlesIn('Liste 1')).toEqual(['Kart B', 'Kart C']);
    await expect.poll(() => board.cardTitlesIn('Liste 2')).toEqual(['Kart D', 'Kart E', 'Kart A']);
  });

  test('optimistic rollback — card.move fails (500); card snaps back + low-noise error', async ({
    authedPage,
  }) => {
    const board = new BoardPage(authedPage);

    // Fail any tRPC request that includes the `card.move` procedure (httpBatchLink
    // puts the procedure name in the path: `/trpc/card.move?batch=1`).
    await authedPage.route(/\/trpc\/[^?]*card\.move/, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }),
    );

    await board.goto();
    await expect.poll(() => board.cardTitlesIn('Liste 1')).toEqual(['Kart A', 'Kart B', 'Kart C']);
    await expect.poll(() => board.cardTitlesIn('Liste 2')).toEqual(['Kart D', 'Kart E']);

    await dragElement(
      authedPage,
      board.card('Kart A', 'Liste 1'),
      board.card('Kart E', 'Liste 2'),
      {
        edge: 'bottom',
      },
    );

    // The low-noise error surfaces…
    await expect(board.dndError).toBeVisible();
    // …and the card is back where it started (rollback) — not lost.
    await expect.poll(() => board.cardTitlesIn('Liste 1')).toEqual(['Kart A', 'Kart B', 'Kart C']);
    await expect.poll(() => board.cardTitlesIn('Liste 2')).toEqual(['Kart D', 'Kart E']);

    // And it really persisted nowhere — a reload still shows the original layout.
    await authedPage.unroute(/\/trpc\/[^?]*card\.move/);
    await authedPage.reload();
    await expect(board.column('Liste 1')).toBeVisible();
    await expect.poll(() => board.cardTitlesIn('Liste 1')).toEqual(['Kart A', 'Kart B', 'Kart C']);
    await expect.poll(() => board.cardTitlesIn('Liste 2')).toEqual(['Kart D', 'Kart E']);
  });

  test('optimistic rollback — card.move returns CONFLICT; board refetches + "moved by someone else" notice', async ({
    authedPage,
  }) => {
    const board = new BoardPage(authedPage);

    // Return a tRPC `CONFLICT` for `card.move` (httpBatchLink batch-array shape).
    // The client's `isConflict` check only looks at `error.json.data.code`.
    await authedPage.route(/\/trpc\/[^?]*card\.move/, (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            error: {
              json: {
                message: 'Kart başkası tarafından taşındı.',
                code: -32009,
                data: { code: 'CONFLICT', httpStatus: 409, path: 'card.move' },
              },
            },
          },
        ]),
      }),
    );

    await board.goto();
    await expect.poll(() => board.cardTitlesIn('Liste 1')).toEqual(['Kart A', 'Kart B', 'Kart C']);

    await dragElement(
      authedPage,
      board.card('Kart A', 'Liste 1'),
      board.card('Kart E', 'Liste 2'),
      {
        edge: 'bottom',
      },
    );

    // The conflict notice shows and the card is NOT silently lost (it's back in Liste 1).
    await expect(board.dndConflict).toBeVisible();
    await expect.poll(() => board.cardTitlesIn('Liste 1')).toEqual(['Kart A', 'Kart B', 'Kart C']);
    await expect.poll(() => board.cardTitlesIn('Liste 2')).toEqual(['Kart D', 'Kart E']);
  });

  test('viewer is read-only — no list drag handles, card chips not draggable', async ({
    viewerPage,
  }) => {
    const board = new BoardPage(viewerPage);
    await board.goto();

    // The board renders for the viewer…
    await expect(board.column('Liste 1')).toBeVisible();
    await expect.poll(() => board.cardTitlesIn('Liste 1')).toEqual(['Kart A', 'Kart B', 'Kart C']);

    // …but the column drag handles are not rendered (DnD off for `viewer`).
    await expect(board.columnDragHandle('Liste 1')).toHaveCount(0);

    // Nothing on the board is `draggable` — Pragmatic DnD's `draggable()` isn't
    // mounted for a `viewer`, so no element gets `draggable="true"`.
    await expect(viewerPage.locator('[draggable="true"]')).toHaveCount(0);
    const firstCard = board.card('Kart A', 'Liste 1');
    await expect(firstCard).not.toHaveAttribute('draggable', 'true');
  });
});
