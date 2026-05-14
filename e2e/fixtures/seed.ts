/**
 * Deterministic e2e seed (Faz 3D — DEM-45). Run with:
 *   pnpm exec tsx e2e/fixtures/seed.ts        (or `pnpm e2e:seed`)
 *
 * This file is **only** executed via `tsx` (by `global-setup.ts` and each test's
 * `beforeEach`) — never imported by the Playwright-transpiled fixtures/specs, so
 * its `@pusula/db` / `better-auth` imports resolve through the workspace exactly
 * as the apps do. The Playwright side imports the pure-data `./e2e-data` instead.
 *
 * Reset-then-seed (idempotent / safe to re-run): wipes the e2e workspace + users
 * by their fixed ids, then re-inserts a known state:
 *   - test user (`E2E.user`) — workspace `owner`, board `admin`;
 *   - `viewer` user (`E2E.viewer`) — workspace `guest`, board `viewer` (RO);
 *   - `alice` / `bob` (`E2E.alice` / `E2E.bob`) — workspace `member`s, board
 *     `member`s on the shared board (Faz 5D — DEM-86; realtime two-user specs);
 *   - one workspace (`E2E.workspaceId`), one board (`E2E.boardId`);
 *   - 3 lists at known positions (`E2E.listTitles`);
 *   - 2-3 cards per list at known positions (`E2E.cards`).
 *
 * Passwords are hashed with Better Auth's own `hashPassword` and written to the
 * `accounts` table with `providerId: 'credential'` (the shape sign-up produces),
 * so the seeded users can sign in via `/api/auth/sign-in/email`.
 *
 * Uses `@pusula/db` (the package — not modifying it). Assumes the schema is
 * already migrated (`pnpm db:migrate`); `global-setup.ts` does both.
 */
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';
import { hashPassword } from 'better-auth/crypto';
import { positionsBetween } from '@pusula/domain';
import {
  createDb,
  eq,
  accounts,
  boardMembers,
  boards,
  cardLabels,
  cardMembers,
  cards,
  comments,
  lists,
  labels,
  reindexSearchDocuments,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { E2E } from './e2e-data';

type Db = ReturnType<typeof createDb>['db'];

async function resetThenSeed(db: Db): Promise<void> {
  // --- Reset (cascades clean up board_members / lists / cards / accounts) ---
  await db.delete(workspaces).where(eq(workspaces.id, E2E.search.hiddenWorkspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, E2E.workspaceId));
  for (const u of [E2E.user, E2E.viewer, E2E.alice, E2E.bob]) {
    await db.delete(users).where(eq(users.id, u.id));
  }

  // --- Users + password credentials ---
  const [passwordHash, viewerPasswordHash, alicePasswordHash, bobPasswordHash] = await Promise.all([
    hashPassword(E2E.user.password),
    hashPassword(E2E.viewer.password),
    hashPassword(E2E.alice.password),
    hashPassword(E2E.bob.password),
  ]);
  await db.insert(users).values([
    { id: E2E.user.id, name: E2E.user.name, email: E2E.user.email, emailVerified: true },
    { id: E2E.viewer.id, name: E2E.viewer.name, email: E2E.viewer.email, emailVerified: true },
    { id: E2E.alice.id, name: E2E.alice.name, email: E2E.alice.email, emailVerified: true },
    { id: E2E.bob.id, name: E2E.bob.name, email: E2E.bob.email, emailVerified: true },
  ]);
  await db.insert(accounts).values([
    {
      id: `${E2E.user.id}-credential`,
      accountId: E2E.user.id,
      providerId: 'credential',
      userId: E2E.user.id,
      password: passwordHash,
    },
    {
      id: `${E2E.viewer.id}-credential`,
      accountId: E2E.viewer.id,
      providerId: 'credential',
      userId: E2E.viewer.id,
      password: viewerPasswordHash,
    },
    {
      id: `${E2E.alice.id}-credential`,
      accountId: E2E.alice.id,
      providerId: 'credential',
      userId: E2E.alice.id,
      password: alicePasswordHash,
    },
    {
      id: `${E2E.bob.id}-credential`,
      accountId: E2E.bob.id,
      providerId: 'credential',
      userId: E2E.bob.id,
      password: bobPasswordHash,
    },
  ]);

  // --- Workspace + memberships ---
  await db.insert(workspaces).values({
    id: E2E.workspaceId,
    name: 'E2E Çalışma Alanı',
    slug: E2E.workspaceSlug,
    ownerId: E2E.user.id,
  });
  await db.insert(workspaceMembers).values([
    { workspaceId: E2E.workspaceId, userId: E2E.user.id, role: 'owner' },
    // The viewer is only a workspace `guest` (no implicit board access) so the
    // explicit board `viewer` row below is what governs their access.
    { workspaceId: E2E.workspaceId, userId: E2E.viewer.id, role: 'guest' },
    // Faz 5D realtime fixture: alice + bob both have full workspace + board
    // edit access so either side can drive the mutation under test.
    { workspaceId: E2E.workspaceId, userId: E2E.alice.id, role: 'member' },
    { workspaceId: E2E.workspaceId, userId: E2E.bob.id, role: 'member' },
  ]);

  // --- Board + members ---
  await db.insert(boards).values({
    id: E2E.boardId,
    workspaceId: E2E.workspaceId,
    title: E2E.boardTitle,
  });
  await db.insert(boardMembers).values([
    { boardId: E2E.boardId, userId: E2E.user.id, role: 'admin' },
    { boardId: E2E.boardId, userId: E2E.viewer.id, role: 'viewer' },
    { boardId: E2E.boardId, userId: E2E.alice.id, role: 'member' },
    { boardId: E2E.boardId, userId: E2E.bob.id, role: 'member' },
  ]);

  // --- Lists (known positions) ---
  const listPositions = positionsBetween(null, null, E2E.listTitles.length);
  const listRows = E2E.listTitles.map((title, i) => ({
    id: `e2e-list-${i + 1}`,
    boardId: E2E.boardId,
    title,
    position: listPositions[i]!,
  }));
  await db.insert(lists).values(listRows);

  // --- Cards (known positions, per list) ---
  for (let i = 0; i < listRows.length; i++) {
    const titles = E2E.cards[i] ?? [];
    if (titles.length === 0) continue;
    const cardPositions = positionsBetween(null, null, titles.length);
    await db.insert(cards).values(
      titles.map((title, j) => ({
        id: `e2e-card-${i + 1}-${j + 1}`,
        boardId: E2E.boardId,
        listId: listRows[i]!.id,
        title,
        description: i === 0 && j === 0 ? `Deterministic search body: ${E2E.search.cardTerm}` : null,
        position: cardPositions[j]!,
      })),
    );
  }

  // DEM-94: Bob starts as a watcher on one deterministic card so the
  // notification e2e can assert watcher comment fan-out without setup UI.
  await db.insert(cardMembers).values({
    cardId: E2E.cardIds.watched,
    userId: E2E.bob.id,
    role: 'watcher',
  });

  // DEM-108: deterministic content for global/board search e2e. This keeps
  // visible card titles unchanged so earlier board interaction specs remain stable.
  await db.insert(labels).values({
    id: E2E.search.labelId,
    boardId: E2E.boardId,
    name: E2E.search.labelName,
    color: 'blue',
  });
  await db.insert(cardLabels).values({
    cardId: E2E.cardIds.assignment,
    labelId: E2E.search.labelId,
  });
  await db.insert(comments).values({
    id: E2E.search.commentId,
    cardId: E2E.cardIds.watched,
    authorId: E2E.user.id,
    body: `Deterministic search comment: ${E2E.search.commentTerm}`,
  });

  // A second workspace/board owned by Bob gives the search e2e a fixed
  // inaccessible result candidate for permission-leak checks.
  await db.insert(workspaces).values({
    id: E2E.search.hiddenWorkspaceId,
    name: 'E2E Hidden Search Workspace',
    slug: 'e2e-hidden-search-workspace',
    ownerId: E2E.bob.id,
  });
  await db.insert(workspaceMembers).values({
    workspaceId: E2E.search.hiddenWorkspaceId,
    userId: E2E.bob.id,
    role: 'owner',
  });
  await db.insert(boards).values({
    id: E2E.search.hiddenBoardId,
    workspaceId: E2E.search.hiddenWorkspaceId,
    title: E2E.search.hiddenTerm,
  });

  await reindexSearchDocuments(db, { workspaceId: E2E.workspaceId });
  await reindexSearchDocuments(db, { workspaceId: E2E.search.hiddenWorkspaceId });
}

export async function seed(): Promise<void> {
  const { db, pool } = createDb();
  try {
    await resetThenSeed(db);
  } finally {
    await pool.end();
  }
}

// Run when invoked directly (`tsx e2e/fixtures/seed.ts`).
const invokedDirectly =
  typeof argv[1] === 'string' && import.meta.url === pathToFileURL(argv[1]).href;
if (invokedDirectly) {
  seed()
    .then(() => {
      console.warn('[e2e] seeded e2e workspace/board.');
    })
    .catch((err) => {
      console.error('[e2e] seed failed:', err);
      process.exitCode = 1;
    });
}
