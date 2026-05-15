/**
 * Realtime board sync e2e (Faz 5D — DEM-86).
 *
 * Two browser contexts (`alice` + `bob`) signed into the same seeded board.
 * Alice mutates, Bob asserts the mutation lands in his DOM via the realtime
 * pipeline (apps/web → apps/api Socket.IO → apps/worker `pusula-realtime-publish`
 * → Redis pub/sub → apps/api bridge → board room → bob's socket → cache
 * primitive → DOM). The harness depends on the worker being part of
 * `webServer` (see `playwright.config.ts`) because otherwise the queue never
 * drains and bob never receives anything.
 *
 * Each test re-seeds in `beforeEach` so order doesn't matter; the suite runs
 * serially (`mode: 'serial'`) on one worker per `playwright.config.ts`.
 *
 * Scenarios (the contract from DEM-86 — six items):
 *   1. card move sync       — alice drags Kart A → Liste 2; bob sees it within 2s.
 *   2. list create sync     — alice adds a new list; bob sees the column appear.
 *   3. seq ordering         — alice creates two cards back-to-back; bob sees both
 *                             in order (the seq gate has no gap).
 *   4. card archive sync    — alice archives a card; bob's column shrinks.
 *   5. reconnect resync     — bob goes offline, alice moves a card, bob comes
 *                             back online; refetch carries the catch-up state.
 *   6. echo discipline      — alice moves a card; her own optimistic patch is
 *                             not re-applied when the echo envelope arrives.
 *
 * Spec: `docs/architecture/05-board-mekanigi.md` §5.3, `08-web-ve-mobil.md` §8.1.10.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/realtime.fixture';
import { BoardPage } from './fixtures/board.fixture';
import { dragElement } from './helpers/dnd';
import { E2E_DATABASE_URL } from './fixtures/env';
import { E2E } from './fixtures/e2e-data';
import { strings } from '../apps/web/src/lib/strings';

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

/**
 * Realtime sync budget (`05-board-mekanigi.md` §5.3 + §8.1.10): <2s P95 in
 * production. We give the test budget more headroom — dev servers + cold
 * worker connection + Playwright instrumentation overhead push the floor up.
 * If a test breaches this, the real-world contract is also at risk.
 */
const SYNC_TIMEOUT_MS = 10_000;

/**
 * `useBoardRealtime` mounts after `board.goto()` returns (which only waits on
 * the first list to paint). The socket handshake + `board:join` ack is async,
 * and the page exposes the server-acknowledged room state. A peer can miss the
 * first envelope if alice mutates before bob has joined the room.
 *
 * `/health` now opens only after Socket.IO + the realtime bridge are ready, so
 * the helper waits for the client-side room join ack rather than sleeping for a
 * fixed window.
 */
async function waitForSocketJoin(page: Page): Promise<void> {
  await expect(
    page.locator(
      `[data-realtime-board-id="${E2E.boardId}"][data-realtime-board-joined="true"]`,
    ),
  ).toBeAttached({ timeout: SYNC_TIMEOUT_MS });
}

test.describe.configure({ mode: 'serial' });

test.describe('realtime board sync', () => {
  test.beforeEach(() => {
    reseed();
  });

  test('1. card move sync — alice drags a card; bob sees the new list within ~2s', async ({
    alicePeer,
    bobPeer,
  }) => {
    const aliceBoard = new BoardPage(alicePeer.page);
    const bobBoard = new BoardPage(bobPeer.page);

    await Promise.all([aliceBoard.goto(), bobBoard.goto()]);
    // Settle both sockets before alice mutates — otherwise bob can miss the
    // first envelope if his `board:join` ack hasn't landed yet.
    await Promise.all([waitForSocketJoin(alicePeer.page), waitForSocketJoin(bobPeer.page)]);

    await expect
      .poll(() => bobBoard.cardTitlesIn('Liste 1'))
      .toEqual(['Kart A', 'Kart B', 'Kart C']);

    // Alice drops "Kart A" onto Kart E in Liste 2. The exact post-move
    // position (D/E/A vs D/A/E) is up to Pragmatic DnD's closest-edge
    // resolution and not what this test is measuring — the realtime pipeline
    // is. We just assert the card *moved* and Liste 2 grew.
    await dragElement(
      alicePeer.page,
      aliceBoard.card('Kart A', 'Liste 1'),
      aliceBoard.card('Kart E', 'Liste 2'),
      { edge: 'bottom' },
    );

    // Alice's own optimistic patch lands first (Faz 4C `useOptimisticBoardMutation`).
    await expect
      .poll(() => aliceBoard.cardTitlesIn('Liste 1'), { timeout: SYNC_TIMEOUT_MS })
      .toEqual(['Kart B', 'Kart C']);
    await expect
      .poll(() => aliceBoard.cardTitlesIn('Liste 2'), { timeout: SYNC_TIMEOUT_MS })
      .toContain('Kart A');

    // Bob's DOM reflects the move via the realtime pipeline.
    await expect
      .poll(() => bobBoard.cardTitlesIn('Liste 1'), { timeout: SYNC_TIMEOUT_MS })
      .toEqual(['Kart B', 'Kart C']);
    await expect
      .poll(() => bobBoard.cardTitlesIn('Liste 2'), { timeout: SYNC_TIMEOUT_MS })
      .toContain('Kart A');
    await expect
      .poll(() => bobBoard.cardTitlesIn('Liste 2'), { timeout: SYNC_TIMEOUT_MS })
      .toHaveLength(3);
  });

  test('2. list create sync — alice adds a new list; bob sees the new column', async ({
    alicePeer,
    bobPeer,
  }) => {
    const aliceBoard = new BoardPage(alicePeer.page);
    const bobBoard = new BoardPage(bobPeer.page);

    await Promise.all([aliceBoard.goto(), bobBoard.goto()]);
    await Promise.all([waitForSocketJoin(alicePeer.page), waitForSocketJoin(bobPeer.page)]);

    await expect.poll(() => bobBoard.columnTitles()).toEqual(['Liste 1', 'Liste 2', 'Liste 3']);

    // Alice opens the "add a list" column form and submits a new title.
    const newListTitle = 'Realtime Liste';
    await alicePeer.page
      .getByRole('button', { name: strings.board.column.addList })
      .first()
      .click();
    const titleInput = alicePeer.page.getByLabel(strings.board.column.addListPlaceholder);
    await titleInput.fill(newListTitle);
    await titleInput.press('Enter');

    // The new column shows up for alice (sanity)…
    await expect(
      alicePeer.page.getByRole('region', { name: newListTitle, exact: true }),
    ).toBeVisible({ timeout: SYNC_TIMEOUT_MS });
    // …and for bob via realtime.
    await expect(bobPeer.page.getByRole('region', { name: newListTitle, exact: true })).toBeVisible(
      { timeout: SYNC_TIMEOUT_MS },
    );
  });

  test('3. seq ordering — two consecutive card.creates land at bob in order (no gap)', async ({
    alicePeer,
    bobPeer,
  }) => {
    const aliceBoard = new BoardPage(alicePeer.page);
    const bobBoard = new BoardPage(bobPeer.page);

    await Promise.all([aliceBoard.goto(), bobBoard.goto()]);
    await Promise.all([waitForSocketJoin(alicePeer.page), waitForSocketJoin(bobPeer.page)]);

    await expect.poll(() => bobBoard.cardTitlesIn('Liste 3')).toEqual(['Kart F', 'Kart G']);

    // `AddCardForm` uses a `<textarea>` (Enter inserts a newline, not submit),
    // and the column closes the form after each submit. So the natural flow is:
    // open → fill → click "Ekle" → reopen → fill → click "Ekle".
    const liste3 = aliceBoard.column('Liste 3');
    const cardCopy = strings.board.card;
    const addCardButton = liste3.getByRole('button', { name: cardCopy.addCard });

    await addCardButton.click();
    await liste3.getByLabel(cardCopy.addCardPlaceholder).fill('Kart H');
    await liste3.getByRole('button', { name: cardCopy.addCardSubmit, exact: true }).click();

    await addCardButton.click();
    await liste3.getByLabel(cardCopy.addCardPlaceholder).fill('Kart I');
    await liste3.getByRole('button', { name: cardCopy.addCardSubmit, exact: true }).click();

    // Bob receives both creates in `seq` order — no gap, no missing card.
    await expect
      .poll(() => bobBoard.cardTitlesIn('Liste 3'), { timeout: SYNC_TIMEOUT_MS })
      .toEqual(['Kart F', 'Kart G', 'Kart H', 'Kart I']);
  });

  test('4. card archive sync — alice archives a card; bob loses it from the column', async ({
    alicePeer,
    bobPeer,
  }) => {
    const aliceBoard = new BoardPage(alicePeer.page);
    const bobBoard = new BoardPage(bobPeer.page);

    await Promise.all([aliceBoard.goto(), bobBoard.goto()]);
    await Promise.all([waitForSocketJoin(alicePeer.page), waitForSocketJoin(bobPeer.page)]);

    await expect
      .poll(() => bobBoard.cardTitlesIn('Liste 1'))
      .toEqual(['Kart A', 'Kart B', 'Kart C']);

    // Open Kart B's detail modal (clicking the card chip pushes `?card=<id>`)
    // then archive via the modal's ⋮ menu — that's the affordance the UI
    // always renders for board members; the card chip's inline archive icon
    // is hover-revealed and brittle to drive from Playwright.
    await aliceBoard.card('Kart B', 'Liste 1').click();
    const modalCopy = strings.card.detail.modal;
    await alicePeer.page.getByRole('button', { name: modalCopy.more, exact: true }).click();
    await alicePeer.page
      .getByRole('menuitem', { name: modalCopy.menuArchive, exact: true })
      .click();

    // Bob's Liste 1 drops to two cards via realtime.
    await expect
      .poll(() => bobBoard.cardTitlesIn('Liste 1'), { timeout: SYNC_TIMEOUT_MS })
      .toEqual(['Kart A', 'Kart C']);
  });

  test('5. reconnect resync — bob goes offline, alice moves a card, bob comes back and catches up', async ({
    alicePeer,
    bobPeer,
  }) => {
    const aliceBoard = new BoardPage(alicePeer.page);
    const bobBoard = new BoardPage(bobPeer.page);

    await Promise.all([aliceBoard.goto(), bobBoard.goto()]);
    await Promise.all([waitForSocketJoin(alicePeer.page), waitForSocketJoin(bobPeer.page)]);

    await expect
      .poll(() => bobBoard.cardTitlesIn('Liste 1'))
      .toEqual(['Kart A', 'Kart B', 'Kart C']);

    // Cut bob's network. Socket.IO will fire `disconnect`; the page renders the
    // subtle "Bağlantı koptu, tekrar bağlanılıyor…" banner (Faz 5C / DEM-85).
    await bobPeer.context.setOffline(true);
    await expect(
      bobPeer.page.getByText(strings.realtime.disconnected, { exact: true }),
    ).toBeVisible({ timeout: SYNC_TIMEOUT_MS });

    // Alice moves Kart A → Liste 2 while bob is dark.
    await dragElement(
      alicePeer.page,
      aliceBoard.card('Kart A', 'Liste 1'),
      aliceBoard.card('Kart E', 'Liste 2'),
      { edge: 'bottom' },
    );
    await expect.poll(() => aliceBoard.cardTitlesIn('Liste 1')).toEqual(['Kart B', 'Kart C']);
    await expect.poll(() => aliceBoard.cardTitlesIn('Liste 2')).toContain('Kart A');

    // Bob comes back online — Socket.IO auto-reconnects → `connect` handler
    // re-emits `board:join` + invalidates `board.get` → refetch carries the
    // catch-up state (server is the authority, no client-side outbox replay).
    // Reconnect backoff (exp. with jitter) + invalidate refetch can stretch
    // beyond SYNC_TIMEOUT_MS, so this poll gets extra room.
    await bobPeer.context.setOffline(false);

    await expect
      .poll(() => bobBoard.cardTitlesIn('Liste 1'), { timeout: 15_000 })
      .toEqual(['Kart B', 'Kart C']);
    await expect
      .poll(() => bobBoard.cardTitlesIn('Liste 2'), { timeout: 15_000 })
      .toContain('Kart A');
  });

  test('6. echo discipline — alice moves her own card; the echo does not double-apply', async ({
    alicePeer,
    bobPeer,
  }) => {
    const aliceBoard = new BoardPage(alicePeer.page);
    const bobBoard = new BoardPage(bobPeer.page);

    await Promise.all([aliceBoard.goto(), bobBoard.goto()]);
    await Promise.all([waitForSocketJoin(alicePeer.page), waitForSocketJoin(bobPeer.page)]);

    await expect
      .poll(() => aliceBoard.cardTitlesIn('Liste 1'))
      .toEqual(['Kart A', 'Kart B', 'Kart C']);

    // Alice drags Kart A → end of Liste 2.
    await dragElement(
      alicePeer.page,
      aliceBoard.card('Kart A', 'Liste 1'),
      aliceBoard.card('Kart E', 'Liste 2'),
      { edge: 'bottom' },
    );

    // After her optimistic patch *and* the server echo land, the card is in
    // Liste 2 exactly once — re-applying the echo on top of her own optimistic
    // update would either duplicate the row or scramble the position.
    await expect
      .poll(() => aliceBoard.cardTitlesIn('Liste 1'), { timeout: SYNC_TIMEOUT_MS })
      .toEqual(['Kart B', 'Kart C']);
    await expect
      .poll(() => aliceBoard.cardTitlesIn('Liste 2'), { timeout: SYNC_TIMEOUT_MS })
      .toContain('Kart A');
    await expect
      .poll(() => aliceBoard.cardTitlesIn('Liste 2'), { timeout: SYNC_TIMEOUT_MS })
      .toHaveLength(3);

    // Wait long enough for bob's echo to arrive too (proves the envelope did go
    // out — the test isn't passing because the worker silently dropped the
    // job).
    await expect
      .poll(() => bobBoard.cardTitlesIn('Liste 2'), { timeout: SYNC_TIMEOUT_MS })
      .toContain('Kart A');

    // Final assertion: Kart A appears exactly once on alice's board (no
    // double-apply from echo).
    const allCardLabelsForAlice = await alicePeer.page
      .locator('article[aria-label="Kart A"]')
      .count();
    expect(allCardLabelsForAlice).toBe(1);
  });
});
