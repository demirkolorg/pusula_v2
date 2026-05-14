/**
 * Search e2e (DEM-108).
 *
 * Covers Faz 6.5's real browser path: global Ctrl+K search, board-scoped search,
 * card deep-link navigation, and permission filtering against an inaccessible
 * seeded workspace.
 */
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/auth.fixture';
import { E2E, boardPath } from './fixtures/e2e-data';
import { E2E_DATABASE_URL } from './fixtures/env';
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

async function openBoard(page: Page): Promise<void> {
  await page.goto(boardPath);
  await expect(page.getByRole('region', { name: E2E.listTitles[0], exact: true })).toBeVisible();
}

async function openGlobalSearch(page: Page) {
  await openBoard(page);
  await page.keyboard.press('Control+K');
  return page.getByRole('searchbox', { name: strings.search.inputLabel });
}

function searchResult(page: Page, title: string) {
  return page.getByRole('button', { name: new RegExp(title) }).first();
}

test.describe.configure({ mode: 'serial' });

test.describe('search', () => {
  test.beforeEach(() => {
    reseed();
  });

  test('global search opens with Ctrl+K and a card result navigates to the card modal', async ({
    authedPage,
  }) => {
    const input = await openGlobalSearch(authedPage);

    await input.fill(E2E.search.cardTerm);
    const result = searchResult(authedPage, E2E.cards[0][0]);
    await expect(result).toContainText(E2E.search.cardTerm);
    await result.click();

    await expect(authedPage).toHaveURL(new RegExp(`card=${E2E.cardIds.assignment}`));
    await expect(authedPage.getByLabel(strings.card.detail.titleLabel)).toHaveValue(E2E.cards[0][0]);
  });

  test('board-scoped search finds a comment result and keeps navigation inside the board', async ({
    authedPage,
  }) => {
    await openBoard(authedPage);
    await authedPage
      .locator('main header')
      .getByRole('button', { name: strings.board.topBar.search, exact: true })
      .click();

    await authedPage
      .getByRole('searchbox', { name: strings.search.inputLabel })
      .fill(E2E.search.commentTerm);
    await expect(
      authedPage.getByRole('heading', { name: strings.search.entityTypes.comment }),
    ).toBeVisible();

    const result = searchResult(authedPage, E2E.cards[0][1]);
    await expect(result).toContainText(E2E.search.commentTerm);
    await result.click();

    await expect(authedPage).toHaveURL(new RegExp(`^.*${boardPath.replace(/\//g, '\\/')}\\?card=${E2E.cardIds.watched}$`));
  });

  test('viewer global search sees accessible board content but not another workspace', async ({
    viewerPage,
  }) => {
    const input = await openGlobalSearch(viewerPage);

    await input.fill(E2E.search.hiddenTerm);
    await expect(viewerPage.getByText(strings.search.empty)).toBeVisible();

    await input.fill(E2E.search.labelName);
    await expect(searchResult(viewerPage, E2E.search.labelName)).toBeVisible();
  });
});
