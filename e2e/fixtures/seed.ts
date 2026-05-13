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
  cards,
  lists,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { E2E } from './e2e-data';

type Db = ReturnType<typeof createDb>['db'];

async function resetThenSeed(db: Db): Promise<void> {
  // --- Reset (cascades clean up board_members / lists / cards / accounts) ---
  await db.delete(workspaces).where(eq(workspaces.id, E2E.workspaceId));
  for (const u of [E2E.user, E2E.viewer]) {
    await db.delete(users).where(eq(users.id, u.id));
  }

  // --- Users + password credentials ---
  const passwordHash = await hashPassword(E2E.user.password);
  const viewerPasswordHash = await hashPassword(E2E.viewer.password);
  await db.insert(users).values([
    { id: E2E.user.id, name: E2E.user.name, email: E2E.user.email, emailVerified: true },
    { id: E2E.viewer.id, name: E2E.viewer.name, email: E2E.viewer.email, emailVerified: true },
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
        position: cardPositions[j]!,
      })),
    );
  }
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
