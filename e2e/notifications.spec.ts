/**
 * Notification e2e (DEM-94).
 *
 * Two browser contexts (`alice` + `bob`) on the same seeded board. Alice drives
 * real card-detail mutations; Bob observes in-app notifications through the
 * bell/center UI.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/realtime.fixture';
import { E2E, boardPath } from './fixtures/e2e-data';
import { E2E_DATABASE_URL } from './fixtures/env';
import { signIn } from './fixtures/auth.fixture';
import { strings } from '../apps/web/src/lib/strings';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOTIFICATION_TIMEOUT_MS = 10_000;

function runFixture(cmd: string): void {
  execSync(cmd, {
    cwd: repoRoot,
    stdio: 'pipe',
    env: {
      ...process.env,
      DATABASE_URL: E2E_DATABASE_URL,
    },
  });
}

function reseed(): void {
  runFixture('pnpm exec tsx e2e/fixtures/seed.ts');
}

function seedBobNotifications(count: number): void {
  runFixture(`pnpm exec tsx e2e/fixtures/seed-notifications.ts ${count}`);
}

async function waitForUserSocket(page: Page): Promise<void> {
  await page.waitForFunction(
    'globalThis.__pusulaE2eSocketIoConnected === true',
    undefined,
    { timeout: NOTIFICATION_TIMEOUT_MS },
  );
}

async function installRealtimeProbe(page: Page): Promise<void> {
  await page.addInitScript({
    content: `
(() => {
  const NativeWebSocket = globalThis.WebSocket;
  if (!NativeWebSocket || NativeWebSocket.__pusulaE2EWrapped) return;

  globalThis.__pusulaE2eSocketIoConnected = false;
  class PusulaE2EWebSocket extends NativeWebSocket {
    constructor(url, protocols) {
      super(url, protocols);
      this.addEventListener('message', (event) => {
        if (typeof event.data === 'string' && event.data.startsWith('40')) {
          globalThis.__pusulaE2eSocketIoConnected = true;
        }
      });
      this.addEventListener('close', () => {
        globalThis.__pusulaE2eSocketIoConnected = false;
      });
    }
  }
  PusulaE2EWebSocket.__pusulaE2EWrapped = true;
  globalThis.WebSocket = PusulaE2EWebSocket;
})();
`,
  });
}

async function openBoard(page: Page): Promise<void> {
  await page.goto(boardPath);
  await expect(page.getByRole('region', { name: E2E.listTitles[0], exact: true })).toBeVisible();
}

async function openCard(page: Page, cardId: string): Promise<void> {
  await page.goto(`${boardPath}?card=${cardId}`);
  await expect(page.getByLabel(strings.card.detail.titleLabel)).toBeVisible();
}

async function assignBobToCard(page: Page, cardId: string): Promise<void> {
  await openCard(page, cardId);
  await page.getByRole('button', { name: strings.card.detail.modal.membersChip }).click();
  await page.getByRole('button', { name: strings.card.members.addAction }).click();
  await page.getByRole('combobox', { name: strings.card.members.memberLabel }).click();
  await page.getByRole('option', { name: E2E.bob.name, exact: true }).click();
  await page.getByRole('button', { name: strings.card.members.addSubmit, exact: true }).click();
}

async function createComment(page: Page, cardId: string, body: string): Promise<void> {
  await openCard(page, cardId);
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.fill(body);
  await page.getByRole('button', { name: strings.card.detail.composer.submit, exact: true }).click();
}

function notificationRows(page: Page) {
  return page.locator('[data-testid^="notification-row-"]');
}

function notificationRow(page: Page, summary: string) {
  return notificationRows(page).filter({ hasText: summary }).first();
}

async function expectUnreadBadge(page: Page, count: number): Promise<void> {
  await expect(
    page.getByRole('button', { name: strings.notifications.bellAria(count), exact: true }),
  ).toBeVisible({ timeout: NOTIFICATION_TIMEOUT_MS });
}

async function openNotificationCenter(page: Page, unreadCount: number): Promise<void> {
  await page
    .getByRole('button', { name: strings.notifications.bellAria(unreadCount), exact: true })
    .click();
  await expect(page.getByRole('heading', { name: strings.notifications.title })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('notifications', () => {
  test.beforeEach(async ({ alicePeer, bobPeer }) => {
    reseed();
    await Promise.all([
      installRealtimeProbe(alicePeer.page),
      installRealtimeProbe(bobPeer.page),
    ]);
    await Promise.all([alicePeer.context.clearCookies(), bobPeer.context.clearCookies()]);
    await Promise.all([
      signIn(alicePeer.page, E2E.alice),
      signIn(bobPeer.page, E2E.bob),
    ]);
  });

  test('assignment notification: bob receives it live and row click opens the card', async ({
    alicePeer,
    bobPeer,
  }) => {
    await Promise.all([openBoard(alicePeer.page), openBoard(bobPeer.page)]);
    await Promise.all([waitForUserSocket(alicePeer.page), waitForUserSocket(bobPeer.page)]);
    await expectUnreadBadge(bobPeer.page, 0);

    await assignBobToCard(alicePeer.page, E2E.cardIds.assignment);

    await expectUnreadBadge(bobPeer.page, 1);
    await openNotificationCenter(bobPeer.page, 1);

    const summary = strings.notifications.summary.cardMemberAdded(E2E.cards[0][0]);
    const row = notificationRow(bobPeer.page, summary);
    await expect(row).toContainText(E2E.alice.name);
    await row.click();

    await expect(bobPeer.page).toHaveURL(new RegExp(`card=${E2E.cardIds.assignment}`));
    await expectUnreadBadge(bobPeer.page, 0);
  });

  test('mention notification: @bob creates a live mention notification', async ({
    alicePeer,
    bobPeer,
  }) => {
    await Promise.all([openBoard(alicePeer.page), openBoard(bobPeer.page)]);
    await Promise.all([waitForUserSocket(alicePeer.page), waitForUserSocket(bobPeer.page)]);

    await createComment(alicePeer.page, E2E.cardIds.mention, '@bob please review this');

    await expectUnreadBadge(bobPeer.page, 1);
    await openNotificationCenter(bobPeer.page, 1);
    const summary = strings.notifications.summary.commentMentioned(E2E.cards[0][2]);
    const row = notificationRow(bobPeer.page, summary);
    await expect(row).toContainText(E2E.alice.name);
  });

  test('watcher comment notification: bob watches a card and receives alice comments', async ({
    alicePeer,
    bobPeer,
  }) => {
    await Promise.all([openBoard(alicePeer.page), openBoard(bobPeer.page)]);
    await Promise.all([waitForUserSocket(alicePeer.page), waitForUserSocket(bobPeer.page)]);

    await createComment(alicePeer.page, E2E.cardIds.watched, 'Plain watcher comment');

    await expectUnreadBadge(bobPeer.page, 1);
    await openNotificationCenter(bobPeer.page, 1);
    const summary = strings.notifications.summary.commentCreated(E2E.cards[0][1]);
    await expect(notificationRow(bobPeer.page, summary)).toContainText(E2E.alice.name);
  });

  test('mark all read clears bob unread badge', async ({ bobPeer }) => {
    seedBobNotifications(3);
    await openBoard(bobPeer.page);

    await expectUnreadBadge(bobPeer.page, 3);
    await openNotificationCenter(bobPeer.page, 3);
    await bobPeer.page
      .getByRole('button', { name: strings.notifications.markAllRead, exact: true })
      .click();

    await expectUnreadBadge(bobPeer.page, 0);
  });

  test('realtime push while panel is open: new assignment appears in the list', async ({
    alicePeer,
    bobPeer,
  }) => {
    await Promise.all([openBoard(alicePeer.page), openBoard(bobPeer.page)]);
    await Promise.all([waitForUserSocket(alicePeer.page), waitForUserSocket(bobPeer.page)]);

    await openNotificationCenter(bobPeer.page, 0);
    await expect(bobPeer.page.getByText(strings.notifications.empty)).toBeVisible();

    await assignBobToCard(alicePeer.page, E2E.cardIds.assignment);

    const summary = strings.notifications.summary.cardMemberAdded(E2E.cards[0][0]);
    const row = notificationRow(bobPeer.page, summary);
    await expect(row).toContainText(E2E.alice.name, { timeout: NOTIFICATION_TIMEOUT_MS });
  });
});
