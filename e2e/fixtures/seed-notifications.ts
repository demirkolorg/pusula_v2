/**
 * Small deterministic notification seed helper for DEM-94 Playwright tests.
 * Invoked via `pnpm exec tsx e2e/fixtures/seed-notifications.ts 3`.
 */
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';
import { createDb, eq, notifications } from '@pusula/db';
import { E2E } from './e2e-data';

async function seedBobNotifications(count: number): Promise<void> {
  const { db, pool } = createDb();
  try {
    await db.delete(notifications).where(eq(notifications.recipientId, E2E.bob.id));
    for (let i = 0; i < count; i++) {
      await db.insert(notifications).values({
        recipientId: E2E.bob.id,
        actorId: E2E.alice.id,
        type: 'comment_reply',
        workspaceId: E2E.workspaceId,
        boardId: E2E.boardId,
        cardId: E2E.cardIds.assignment,
        payload: {
          actorName: E2E.alice.name,
          cardTitle: `Seeded notification ${i + 1}`,
          workspaceId: E2E.workspaceId,
          boardId: E2E.boardId,
          cardId: E2E.cardIds.assignment,
        },
        createdAt: new Date(Date.now() + i),
      });
    }
  } finally {
    await pool.end();
  }
}

const invokedDirectly =
  typeof argv[1] === 'string' && import.meta.url === pathToFileURL(argv[1]).href;
if (invokedDirectly) {
  const count = Number(argv[2] ?? '3');
  seedBobNotifications(Number.isFinite(count) ? count : 3)
    .then(() => {
      console.warn('[e2e] seeded bob notifications.');
    })
    .catch((err) => {
      console.error('[e2e] notification seed failed:', err);
      process.exitCode = 1;
    });
}
