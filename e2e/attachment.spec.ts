/**
 * Card attachment e2e (Faz 11E — DEM-151).
 *
 * Exercises the Faz 11 card-attachment feature end-to-end through the real
 * browser path: card-detail "Ekler" tab → {@link Dropzone} two-phase upload
 * (`attachment.initiate` → presigned MinIO PUT → `attachment.commit`) →
 * {@link AttachmentTile} list → preview / download / delete, plus the
 * cross-session realtime echo and the watcher notification fan-out.
 *
 * Stack dependency: the full `webServer` set (api + web + worker) AND a
 * reachable MinIO (`pnpm infra:up` brings up the repo-root docker-compose
 * Postgres/Redis/MinIO). The presigned PUT/GET URLs the API mints point at
 * `http://localhost:9000` (the API `env.S3_ENDPOINT` default), which the
 * Playwright browser uploads/downloads against directly. Without MinIO the
 * upload scenarios cannot pass — that is expected; the spec is still
 * discoverable and type-checks regardless.
 *
 * Scenarios (the DEM-151 contract — five items, mapped to the Faz 11E
 * "Kabul kriterleri" in `docs/domain/07-ek-kurallari.md`):
 *   1. alice upload happy path (admin) — drop a PDF, add a description, "Yükle";
 *      the tile lands and bob (a card watcher) gets an in-app notification +
 *      bell badge bump.
 *   2. bob download + realtime — alice uploads an image; bob (same board, other
 *      session) sees the tile appear live and downloads it via a presigned GET.
 *   3. alice delete + bob realtime — alice removes a tile via the ⋮ menu; the
 *      tile disappears for her and, via realtime, for bob too.
 *   4. viewer role — the seeded `viewer` (workspace guest + board viewer) sees a
 *      disabled dropzone (tooltip) and an active "İndir", but no delete / ⋮.
 *   5. preview lightbox + PDF iframe — an image attachment opens the zoomable
 *      lightbox (close control dismisses it); a PDF opens the `<iframe>` viewer.
 *
 * Spec: `docs/domain/07-ek-kurallari.md`, `docs/architecture/13-ui-tasarim-dili.md` §13.10.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures/realtime.fixture';
import { test as authTest, expect as authExpect } from './fixtures/auth.fixture';
import { E2E, boardPath } from './fixtures/e2e-data';
import { E2E_DATABASE_URL } from './fixtures/env';
import { strings } from '../apps/web/src/lib/strings';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Attachment-flow budget — uploads cross the network to MinIO + back. */
const ATTACHMENT_TIMEOUT_MS = 15_000;

const attachmentCopy = strings.attachment;

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

// ───────────────────────────────────────────────────────────────────────────
// Inline test fixtures — kept tiny so no binary blob is committed to the repo.
// ───────────────────────────────────────────────────────────────────────────
/**
 * The smallest structurally-valid PDF (header + one empty object + xref +
 * trailer). MinIO stores bytes verbatim, and the PDF allowlist check is on the
 * declared `mimeType`, so this is enough for the upload + preview path.
 */
const TINY_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
    'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n' +
    '0000000052 00000 n \n0000000101 00000 n \n' +
    'trailer<</Size 4/Root 1 0 R>>\nstartxref\n164\n%%EOF\n',
  'latin1',
);

/** A 1×1 transparent PNG (smallest valid PNG — magic bytes + IHDR + IDAT + IEND). */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
  'base64',
);

/** A picked-file payload for Playwright `setInputFiles`. */
function pdfFile(name = 'rapor.pdf') {
  return { name, mimeType: 'application/pdf', buffer: TINY_PDF };
}
function pngFile(name = 'ekran.png') {
  return { name, mimeType: 'image/png', buffer: TINY_PNG };
}

// ───────────────────────────────────────────────────────────────────────────
// Page helpers — accessible selectors only (getByRole / getByLabel).
// ───────────────────────────────────────────────────────────────────────────

/** Open the seeded board and wait for the first list to paint. */
async function openBoard(page: Page): Promise<void> {
  await page.goto(boardPath);
  await expect(page.getByRole('region', { name: E2E.listTitles[0], exact: true })).toBeVisible();
}

/** Wait for the board socket room-join ack (`page.tsx` exposes the flag). */
async function waitForBoardJoin(page: Page): Promise<void> {
  await expect(
    page.locator(
      `[data-realtime-board-id="${E2E.boardId}"][data-realtime-board-joined="true"]`,
    ),
  ).toBeAttached({ timeout: ATTACHMENT_TIMEOUT_MS });
}

/**
 * Open a card's detail modal via the `?card=<id>` deep link and switch to the
 * "Ekler" tab. The "Ekler" tab itself is the modal-ready signal — it renders
 * for every board role (member + viewer alike), unlike the title input which
 * only mounts in editable mode. The tab's accessible name is "Ekler <count>"
 * (label + count badge), so it is matched with a leading-anchored regex.
 */
async function openAttachmentsTab(page: Page, cardId: string): Promise<void> {
  await page.goto(`${boardPath}?card=${cardId}`);
  const tab = page.getByRole('tab', {
    name: new RegExp(`^${attachmentCopy.tabs.attachments}`),
  });
  await expect(tab).toBeVisible({ timeout: ATTACHMENT_TIMEOUT_MS });
  await tab.click();
}

/** The attachments panel root (`data-slot` on the `<section>`). */
function attachmentsPanel(page: Page): Locator {
  return page.locator('[data-slot="card-detail-attachments"]');
}

/** The dropzone surface (`role="button"`, `aria-label="Dosya yükle"`). */
function dropzone(page: Page): Locator {
  return attachmentsPanel(page).getByRole('button', {
    name: attachmentCopy.dropzone.ariaLabel,
  });
}

/** A single attachment tile, located by its (visible, unique) file name. */
function attachmentTile(page: Page, fileName: string): Locator {
  return page
    .locator('[data-slot="attachment-tile"]')
    .filter({ hasText: fileName })
    .first();
}

/**
 * Drive the two-phase upload: pick `file` via the dropzone's hidden
 * `<input type="file">`, optionally fill the description, then submit "Yükle".
 * The new tile lands from the `commit` response (uploads are not optimistic).
 */
async function uploadFile(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
  description?: string,
): Promise<void> {
  await attachmentsPanel(page).locator('input[type="file"]').setInputFiles(file);
  // After a file is picked the panel shows the staged-file card + description
  // textarea; the dropzone itself is unchanged until "Yükle" flips `uploading`.
  if (description) {
    await page.getByLabel(attachmentCopy.description.label).fill(description);
  }
  await page.getByRole('button', { name: attachmentCopy.upload.action, exact: true }).click();
  await expect(attachmentTile(page, file.name)).toBeVisible({
    timeout: ATTACHMENT_TIMEOUT_MS,
  });
}

/** Bell unread-badge assertion (same affordance the notification e2e leans on). */
async function expectUnreadBadge(page: Page, count: number): Promise<void> {
  await expect(
    page.getByRole('button', { name: strings.notifications.bellAria(count), exact: true }),
  ).toBeVisible({ timeout: ATTACHMENT_TIMEOUT_MS });
}

/**
 * Click a tile's "İndir" and assert the download path actually runs.
 *
 * The UI fetches a presigned GET URL (`attachment.getDownloadUrl` tRPC query)
 * and then triggers an anchor with `target="_blank"`. A cross-origin MinIO URL
 * with no `Content-Disposition: attachment` renders inline in Chromium, so the
 * browser may open a popup rather than emit a `download` event — the
 * deterministic signal is the presigned-URL request returning 200, which is
 * what this asserts. The popup, if any, is closed so it does not leak.
 */
async function expectDownload(page: Page, tile: Locator): Promise<void> {
  await tile.hover();
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes('attachment.getDownloadUrl') && res.request().method() === 'GET',
      { timeout: ATTACHMENT_TIMEOUT_MS },
    ),
    page.waitForEvent('popup', { timeout: ATTACHMENT_TIMEOUT_MS }).catch(() => null),
    tile.getByRole('button', { name: attachmentCopy.actions.download }).click(),
  ]);
  expect(response.ok()).toBeTruthy();
  for (const popup of page.context().pages().slice(1)) {
    await popup.close().catch(() => undefined);
  }
}

test.describe.configure({ mode: 'serial' });

test.describe('card attachments', () => {
  test.beforeEach(() => {
    reseed();
  });

  // ───────────────────────────────────────────────────────────────────────
  // 1. alice upload happy path + watcher notification
  // ───────────────────────────────────────────────────────────────────────
  test('1. alice (board member) uploads a PDF with a description; bob (card watcher) is notified', async ({
    alicePeer,
    bobPeer,
  }) => {
    // bob keeps the board open so the bell badge can tick live. `E2E.cardIds.watched`
    // is seeded with bob as a `watcher` (seed.ts) — uploading there fans out to him.
    await openBoard(bobPeer.page);
    await waitForBoardJoin(bobPeer.page);
    await expectUnreadBadge(bobPeer.page, 0);

    await openAttachmentsTab(alicePeer.page, E2E.cardIds.watched);
    // Empty state before the first upload.
    await expect(
      alicePeer.page.getByText(attachmentCopy.empty.title),
    ).toBeVisible();

    await uploadFile(alicePeer.page, pdfFile('butce-2026.pdf'), 'Yıllık bütçe taslağı');

    // The tile shows the file name + the description caption.
    const tile = attachmentTile(alicePeer.page, 'butce-2026.pdf');
    await expect(tile).toContainText('Yıllık bütçe taslağı');

    // bob (card watcher) receives the in-app notification — bell badge bumps.
    await expectUnreadBadge(bobPeer.page, 1);
  });

  // ───────────────────────────────────────────────────────────────────────
  // 2. bob download + realtime tile appearance
  // ───────────────────────────────────────────────────────────────────────
  test('2. alice uploads an image; bob sees the tile live and downloads it', async ({
    alicePeer,
    bobPeer,
  }) => {
    // Use `E2E.cardIds.assignment` (no watcher) so this test is about realtime
    // sync + download, not notifications.
    await openAttachmentsTab(bobPeer.page, E2E.cardIds.assignment);
    await openAttachmentsTab(alicePeer.page, E2E.cardIds.assignment);
    // Settle both board sockets before alice mutates — otherwise bob can miss
    // the `attachment.added` envelope if his room-join ack hasn't landed.
    await Promise.all([
      waitForBoardJoin(alicePeer.page),
      waitForBoardJoin(bobPeer.page),
    ]);

    await uploadFile(alicePeer.page, pngFile('tasarim.png'));

    // bob's open "Ekler" panel picks up the new tile via the realtime
    // `attachment.added` envelope invalidating `attachment.list`.
    const bobTile = attachmentTile(bobPeer.page, 'tasarim.png');
    await expect(bobTile).toBeVisible({ timeout: ATTACHMENT_TIMEOUT_MS });

    // bob downloads it — the UI resolves a presigned GET URL (viewer+ access).
    await expectDownload(bobPeer.page, bobTile);
  });

  // ───────────────────────────────────────────────────────────────────────
  // 3. alice delete + bob realtime removal
  // ───────────────────────────────────────────────────────────────────────
  test('3. alice deletes an attachment; the tile disappears for her and for bob', async ({
    alicePeer,
    bobPeer,
  }) => {
    await openAttachmentsTab(alicePeer.page, E2E.cardIds.assignment);
    await uploadFile(alicePeer.page, pngFile('silinecek.png'));

    // bob opens the same card's "Ekler" tab and confirms the tile is there
    // (the `attachment.list` query loads it on tab mount).
    await openAttachmentsTab(bobPeer.page, E2E.cardIds.assignment);
    await expect(attachmentTile(bobPeer.page, 'silinecek.png')).toBeVisible({
      timeout: ATTACHMENT_TIMEOUT_MS,
    });
    // Both board sockets settled before alice deletes — bob must receive the
    // `attachment.removed` envelope.
    await Promise.all([
      waitForBoardJoin(alicePeer.page),
      waitForBoardJoin(bobPeer.page),
    ]);

    // alice deletes via the tile's ⋮ overflow menu → "Sil" → confirm dialog.
    const tile = attachmentTile(alicePeer.page, 'silinecek.png');
    await tile.hover();
    await tile.getByRole('button', { name: attachmentCopy.actions.moreActions }).click();
    await alicePeer.page
      .getByRole('menuitem', { name: attachmentCopy.actions.delete, exact: true })
      .click();
    // Confirm the destructive "Eki sil" dialog.
    await alicePeer.page
      .getByRole('button', { name: attachmentCopy.confirmDelete.confirm, exact: true })
      .click();

    // The tile is gone for alice…
    await expect(attachmentTile(alicePeer.page, 'silinecek.png')).toHaveCount(0, {
      timeout: ATTACHMENT_TIMEOUT_MS,
    });
    // …and for bob via the realtime `attachment.removed` envelope.
    await expect(attachmentTile(bobPeer.page, 'silinecek.png')).toHaveCount(0, {
      timeout: ATTACHMENT_TIMEOUT_MS,
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // 5. preview lightbox + PDF iframe
  // ───────────────────────────────────────────────────────────────────────
  test('5. image attachment opens the zoomable lightbox; PDF opens the iframe viewer', async ({
    alicePeer,
  }) => {
    await openAttachmentsTab(alicePeer.page, E2E.cardIds.assignment);
    await uploadFile(alicePeer.page, pngFile('foto.png'));
    await uploadFile(alicePeer.page, pdfFile('belge.pdf'));

    // --- Image preview: lightbox + zoom + Escape ---------------------------
    const imageTile = attachmentTile(alicePeer.page, 'foto.png');
    await imageTile.hover();
    await imageTile.getByRole('button', { name: attachmentCopy.actions.preview }).click();

    // The preview dialog's accessible name is the file name.
    const imageDialog = alicePeer.page.getByRole('dialog', { name: 'foto.png' });
    await expect(imageDialog).toBeVisible({ timeout: ATTACHMENT_TIMEOUT_MS });
    // The lightbox renders the image inside the scrollable zoom area.
    await expect(
      imageDialog.getByRole('group', { name: attachmentCopy.preview.zoomArea }),
    ).toBeVisible();
    // Zoom-in is offered for images; clicking it bumps the zoom % readout.
    await imageDialog.getByRole('button', { name: attachmentCopy.preview.zoomIn }).click();
    await expect(imageDialog.getByText('150%')).toBeVisible();
    // Close the lightbox via its explicit "Kapat" control. (The preview dialog
    // is nested inside the card-detail modal; routing a raw Escape keypress to
    // the inner dismiss layer is brittle across the two stacked Radix dialogs,
    // so the spec drives the dedicated close button instead.)
    await imageDialog.getByRole('button', { name: strings.common.close }).click();
    await expect(imageDialog).toBeHidden({ timeout: ATTACHMENT_TIMEOUT_MS });

    // --- PDF preview: iframe viewer ---------------------------------------
    const pdfTile = attachmentTile(alicePeer.page, 'belge.pdf');
    await pdfTile.hover();
    await pdfTile.getByRole('button', { name: attachmentCopy.actions.preview }).click();

    const pdfDialog = alicePeer.page.getByRole('dialog', { name: 'belge.pdf' });
    await expect(pdfDialog).toBeVisible({ timeout: ATTACHMENT_TIMEOUT_MS });
    // The PDF kind renders inside an `<iframe>` (no image zoom controls).
    await expect(pdfDialog.locator('iframe')).toBeAttached({
      timeout: ATTACHMENT_TIMEOUT_MS,
    });
    await pdfDialog.getByRole('button', { name: strings.common.close }).click();
    await expect(pdfDialog).toBeHidden({ timeout: ATTACHMENT_TIMEOUT_MS });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. viewer role — read-only attachment surface.
//
// The seeded `viewer` (workspace guest + board `viewer`) is a separate single-
// page fixture, so this scenario uses `auth.fixture`'s `viewerPage`. It needs a
// pre-existing committed attachment to assert against; `alice` uploads one
// first through her own context (a fresh sign-in via the HTTP endpoint), then
// the viewer opens the same card.
// ───────────────────────────────────────────────────────────────────────────
authTest.describe('card attachments — viewer role', () => {
  authTest.beforeEach(() => {
    reseed();
  });

  authTest(
    '4. viewer sees a disabled dropzone + active download, but no delete / ⋮ menu',
    async ({ viewerPage, browser }) => {
      // alice uploads an attachment so the viewer has something to look at.
      const aliceContext = await browser.newContext();
      const alicePage = await aliceContext.newPage();
      try {
        const { signIn } = await import('./fixtures/auth.fixture');
        await signIn(alicePage, E2E.alice);
        await openAttachmentsTab(alicePage, E2E.cardIds.assignment);
        await uploadFile(alicePage, pngFile('paylasilan.png'));
      } finally {
        await aliceContext.close();
      }

      // The viewer opens the same card's "Ekler" tab.
      await openAttachmentsTab(viewerPage, E2E.cardIds.assignment);

      // The dropzone is rendered but disabled (aria-disabled) — a viewer cannot
      // upload. The disabled surface still carries the explanatory tooltip copy.
      const zone = dropzone(viewerPage);
      await authExpect(zone).toHaveAttribute('aria-disabled', 'true');

      // The attachment tile is visible and download IS offered to viewers.
      const tile = attachmentTile(viewerPage, 'paylasilan.png');
      await authExpect(tile).toBeVisible({ timeout: ATTACHMENT_TIMEOUT_MS });
      await tile.hover();
      await authExpect(
        tile.getByRole('button', { name: attachmentCopy.actions.download }),
      ).toBeVisible();

      // Delete + the ⋮ overflow menu must NOT be available to a viewer — the
      // tile only renders the overflow trigger when at least one of
      // edit/delete/cover is permitted.
      await authExpect(
        tile.getByRole('button', { name: attachmentCopy.actions.moreActions }),
      ).toHaveCount(0);

      // Downloading still works for the viewer (presigned GET is viewer+).
      await expectDownload(viewerPage, tile);
    },
  );
});
