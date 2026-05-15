/**
 * Minimal local seed: a demo user, workspace, board, list and a couple of cards.
 * Idempotent — safe to re-run; skips if the demo workspace already exists.
 * Run with: `pnpm db:seed`.
 *
 * Note: the demo user has no `accounts` (password) row, so it can't log in yet
 * — auth wiring lands in Phase 1. It exists so board/list/card queries have
 * something to return during early development.
 */
import { eq } from 'drizzle-orm';
import { firstPosition, positionsBetween } from '@pusula/domain';
import { createDb } from './client';
import { boards, cards, lists, users, workspaceMembers, workspaces } from './schema';

const DEMO_SLUG = 'demo';

async function main() {
  const { db, pool } = createDb();
  try {
    const [existing] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, DEMO_SLUG))
      .limit(1);
    if (existing) {
      console.warn(`[db] demo workspace "${DEMO_SLUG}" already exists — nothing to do.`);
      return;
    }

    const ownerId = 'demo-user';
    await db
      .insert(users)
      .values({
        id: ownerId,
        name: 'Demo Kullanıcı',
        email: 'demo@pusula.local',
        emailVerified: true,
      })
      .onConflictDoNothing();

    const [workspace] = await db
      .insert(workspaces)
      .values({ name: 'Demo Çalışma Alanı', slug: DEMO_SLUG, ownerId })
      .returning();
    if (!workspace) throw new Error('failed to create demo workspace');

    await db
      .insert(workspaceMembers)
      .values({ workspaceId: workspace.id, userId: ownerId, role: 'owner' });

    const [board] = await db
      .insert(boards)
      .values({ workspaceId: workspace.id, title: 'İlk Pano' })
      .returning();
    if (!board) throw new Error('failed to create demo board');

    const listPositions = positionsBetween(null, null, 3);
    const insertedLists = await db
      .insert(lists)
      .values([
        { boardId: board.id, title: 'Yapılacak', position: listPositions[0] ?? firstPosition() },
        { boardId: board.id, title: 'Devam Eden', position: listPositions[1] ?? firstPosition() },
        { boardId: board.id, title: 'Bitti', position: listPositions[2] ?? firstPosition() },
      ])
      .returning();

    const todoList = insertedLists.find((l) => l.title === 'Yapılacak');
    if (todoList) {
      const cardPositions = positionsBetween(null, null, 2);
      await db.insert(cards).values([
        {
          boardId: board.id,
          listId: todoList.id,
          title: 'Pusula v2 iskeletini kur',
          position: cardPositions[0] ?? firstPosition(),
        },
        {
          boardId: board.id,
          listId: todoList.id,
          title: 'Auth + workspace (Faz 1)',
          position: cardPositions[1] ?? firstPosition(),
        },
      ]);
    }

    console.warn(`[db] seeded demo workspace "${DEMO_SLUG}" (board "${board.title}").`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[db] seed failed:', err);
  process.exitCode = 1;
});
