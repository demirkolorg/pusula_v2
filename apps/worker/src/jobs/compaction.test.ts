/**
 * Integration tests for the position-compaction job (Faz 3C — DEM-44). These
 * hit a real Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` +
 * `pnpm db:migrate`). If no database is reachable the suite is skipped rather
 * than failing on a box without infra (same pattern as the `@pusula/api`
 * router integration tests).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { activityEvents, boards, cards, lists, users, workspaces } from '@pusula/db';
import { POSITION_COMPACTION_MAX_LEN, positionsBetween } from '@pusula/domain';
import { processCompactionJob } from './compaction';

// Probe the database at collection time so `describe.runIf` can react to it.
let probe: ReturnType<typeof dbMod.createDb> | undefined;
try {
  probe = dbMod.createDb();
  await probe.db.execute(dbMod.sql`select 1`);
} catch {
  await probe?.pool.end();
  probe = undefined;
}
const dbAvailable = probe !== undefined;

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;

describe.runIf(dbAvailable)('processCompactionJob (integration)', () => {
  const db = () => probe!.db;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const ownerId = newId('u-compact-owner');
    createdUserIds.push(ownerId);
    await db()
      .insert(users)
      .values({ id: ownerId, name: ownerId, email: `${ownerId}@example.test` });
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  /** Seed a workspace + board owned by a fresh user; returns ids. */
  async function seedBoard(): Promise<{ workspaceId: string; boardId: string; ownerId: string }> {
    const ownerId = newId('u-compact');
    createdUserIds.push(ownerId);
    await db()
      .insert(users)
      .values({ id: ownerId, name: ownerId, email: `${ownerId}@example.test` });

    const [ws] = await db()
      .insert(workspaces)
      .values({ name: 'Compaction Co', slug: newId('compaction-co'), ownerId })
      .returning({ id: workspaces.id });
    createdWorkspaceIds.push(ws!.id);

    const [board] = await db()
      .insert(boards)
      .values({ workspaceId: ws!.id, title: 'Compaction Board' })
      .returning({ id: boards.id });

    return { workspaceId: ws!.id, boardId: board!.id, ownerId };
  }

  async function boardVersion(boardId: string): Promise<number> {
    const [row] = await db()
      .select({ version: boards.version })
      .from(boards)
      .where(dbMod.eq(boards.id, boardId))
      .limit(1);
    return row!.version;
  }

  async function actCount(boardId: string): Promise<number> {
    const rows = await db()
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.boardId, boardId));
    return rows.length;
  }

  // ------------------------------------------------------------ list scope

  it('list scope: re-balances a list with one over-long card position onto short, ascending keys; order preserved; boards.version bumps; no activity', async () => {
    const { boardId } = await seedBoard();
    const [list] = await db()
      .insert(lists)
      .values({ boardId, title: 'L', position: 'a0' })
      .returning({ id: lists.id });
    const listId = list!.id;

    // Three cards in a known order; the middle one has a pathologically long key.
    const longKey = 'a' + '4'.repeat(POSITION_COMPACTION_MAX_LEN + 10);
    const seeded = await db()
      .insert(cards)
      .values([
        { boardId, listId, title: 'first', position: 'a0' },
        { boardId, listId, title: 'second', position: longKey },
        { boardId, listId, title: 'third', position: 'a8' },
      ])
      .returning({ id: cards.id, title: cards.title });
    const idByTitle = new Map(seeded.map((c) => [c.title, c.id] as const));

    const v0 = await boardVersion(boardId);
    const acts0 = await actCount(boardId);

    const result = await processCompactionJob(db(), { scope: { kind: 'list', listId } });
    expect(result).toEqual({ rebalanced: 3 });

    const after = await db()
      .select({ id: cards.id, title: cards.title, position: cards.position })
      .from(cards)
      .where(dbMod.eq(cards.listId, listId))
      .orderBy(dbMod.asc(cards.position));

    // Order preserved (first → second → third) and every key short + ascending.
    expect(after.map((c) => c.id)).toEqual([
      idByTitle.get('first'),
      idByTitle.get('second'),
      idByTitle.get('third'),
    ]);
    for (let i = 1; i < after.length; i++) {
      expect(after[i - 1]!.position < after[i]!.position).toBe(true);
    }
    for (const c of after) {
      expect(c.position.length).toBeLessThan(POSITION_COMPACTION_MAX_LEN);
    }
    // It must equal exactly the deterministic compact sequence.
    expect(after.map((c) => c.position)).toEqual(positionsBetween(null, null, 3));

    expect(await boardVersion(boardId)).toBe(v0 + 1);
    expect(await actCount(boardId)).toBe(acts0); // purely technical — no activity rows

    // Idempotent: a second run produces the same keys and does NOT bump version again.
    const v1 = await boardVersion(boardId);
    const result2 = await processCompactionJob(db(), { scope: { kind: 'list', listId } });
    expect(result2).toEqual({ rebalanced: 3 });
    const after2 = await db()
      .select({ id: cards.id, position: cards.position })
      .from(cards)
      .where(dbMod.eq(cards.listId, listId))
      .orderBy(dbMod.asc(cards.position));
    expect(after2.map((c) => c.position)).toEqual(after.map((c) => c.position));
    expect(await boardVersion(boardId)).toBe(v1); // already compact → no-op, no bump
  });

  it('list scope: an archived card shares the same position sequence (no archived_at filter)', async () => {
    const { boardId } = await seedBoard();
    const [list] = await db()
      .insert(lists)
      .values({ boardId, title: 'L', position: 'a0' })
      .returning({ id: lists.id });
    const listId = list!.id;

    const longKey = 'a' + '4'.repeat(POSITION_COMPACTION_MAX_LEN + 5);
    const seeded = await db()
      .insert(cards)
      .values([
        { boardId, listId, title: 'active-a', position: 'a0' },
        { boardId, listId, title: 'archived-mid', position: longKey, archivedAt: new Date() },
        { boardId, listId, title: 'active-b', position: 'a8' },
      ])
      .returning({ id: cards.id, title: cards.title });
    const idByTitle = new Map(seeded.map((c) => [c.title, c.id] as const));

    const result = await processCompactionJob(db(), { scope: { kind: 'list', listId } });
    expect(result).toEqual({ rebalanced: 3 });

    const after = await db()
      .select({ id: cards.id, position: cards.position })
      .from(cards)
      .where(dbMod.eq(cards.listId, listId))
      .orderBy(dbMod.asc(cards.position));
    // The archived card stays in the middle of the single sequence.
    expect(after.map((c) => c.id)).toEqual([
      idByTitle.get('active-a'),
      idByTitle.get('archived-mid'),
      idByTitle.get('active-b'),
    ]);
    expect(after.map((c) => c.position)).toEqual(positionsBetween(null, null, 3));
  });

  it('list scope: ≤ 1 card is a no-op (rebalanced 0, no version bump); a missing list is a no-op', async () => {
    const { boardId } = await seedBoard();
    const [emptyList] = await db()
      .insert(lists)
      .values({ boardId, title: 'Empty', position: 'a0' })
      .returning({ id: lists.id });
    const v0 = await boardVersion(boardId);
    expect(
      await processCompactionJob(db(), { scope: { kind: 'list', listId: emptyList!.id } }),
    ).toEqual({
      rebalanced: 0,
    });

    const [oneCardList] = await db()
      .insert(lists)
      .values({ boardId, title: 'One', position: 'a1' })
      .returning({ id: lists.id });
    await db()
      .insert(cards)
      .values({ boardId, listId: oneCardList!.id, title: 'solo', position: 'a0' });
    expect(
      await processCompactionJob(db(), { scope: { kind: 'list', listId: oneCardList!.id } }),
    ).toEqual({ rebalanced: 0 });

    expect(await boardVersion(boardId)).toBe(v0);

    // A list id that doesn't exist → no-op.
    expect(
      await processCompactionJob(db(), { scope: { kind: 'list', listId: newId('missing') } }),
    ).toEqual({
      rebalanced: 0,
    });
  });

  it('list scope: re-balances a single card with a legacy invalid position', async () => {
    const { boardId } = await seedBoard();
    const [list] = await db()
      .insert(lists)
      .values({ boardId, title: 'Legacy', position: 'a0' })
      .returning({ id: lists.id });
    const listId = list!.id;
    await db().insert(cards).values({ boardId, listId, title: 'legacy-card', position: 'a' });
    const v0 = await boardVersion(boardId);

    await expect(processCompactionJob(db(), { scope: { kind: 'list', listId } })).resolves.toEqual({
      rebalanced: 1,
    });

    const [after] = await db()
      .select({ position: cards.position })
      .from(cards)
      .where(dbMod.eq(cards.listId, listId))
      .limit(1);
    expect(after!.position).toBe(positionsBetween(null, null, 1)[0]);
    expect(await boardVersion(boardId)).toBe(v0 + 1);
  });

  // ----------------------------------------------------------- board scope

  it('board scope: re-balances a board with an over-long list position; order preserved; boards.version bumps; no activity', async () => {
    const { boardId } = await seedBoard();
    const longKey = 'a' + '4'.repeat(POSITION_COMPACTION_MAX_LEN + 7);
    const seeded = await db()
      .insert(lists)
      .values([
        { boardId, title: 'L1', position: 'a0' },
        { boardId, title: 'L2', position: longKey },
        { boardId, title: 'L3', position: 'a8' },
      ])
      .returning({ id: lists.id, title: lists.title });
    const idByTitle = new Map(seeded.map((l) => [l.title, l.id] as const));

    const v0 = await boardVersion(boardId);
    const acts0 = await actCount(boardId);

    const result = await processCompactionJob(db(), { scope: { kind: 'board', boardId } });
    expect(result).toEqual({ rebalanced: 3 });

    const after = await db()
      .select({ id: lists.id, position: lists.position })
      .from(lists)
      .where(dbMod.eq(lists.boardId, boardId))
      .orderBy(dbMod.asc(lists.position));
    expect(after.map((l) => l.id)).toEqual([
      idByTitle.get('L1'),
      idByTitle.get('L2'),
      idByTitle.get('L3'),
    ]);
    expect(after.map((l) => l.position)).toEqual(positionsBetween(null, null, 3));
    for (const l of after) expect(l.position.length).toBeLessThan(POSITION_COMPACTION_MAX_LEN);

    expect(await boardVersion(boardId)).toBe(v0 + 1);
    expect(await actCount(boardId)).toBe(acts0);

    // Idempotent re-run.
    const v1 = await boardVersion(boardId);
    expect(await processCompactionJob(db(), { scope: { kind: 'board', boardId } })).toEqual({
      rebalanced: 3,
    });
    expect(await boardVersion(boardId)).toBe(v1);
  });

  it('board scope: ≤ 1 list is a no-op (rebalanced 0, no version bump)', async () => {
    const { boardId } = await seedBoard();
    const v0 = await boardVersion(boardId);
    expect(await processCompactionJob(db(), { scope: { kind: 'board', boardId } })).toEqual({
      rebalanced: 0,
    });

    await db().insert(lists).values({ boardId, title: 'only', position: 'a0' });
    expect(await processCompactionJob(db(), { scope: { kind: 'board', boardId } })).toEqual({
      rebalanced: 0,
    });
    expect(await boardVersion(boardId)).toBe(v0);
  });

  it('board scope: re-balances a single list with a legacy invalid position', async () => {
    const { boardId } = await seedBoard();
    await db().insert(lists).values({ boardId, title: 'legacy-list', position: 'a' });
    const v0 = await boardVersion(boardId);

    await expect(
      processCompactionJob(db(), { scope: { kind: 'board', boardId } }),
    ).resolves.toEqual({
      rebalanced: 1,
    });

    const [after] = await db()
      .select({ position: lists.position })
      .from(lists)
      .where(dbMod.eq(lists.boardId, boardId))
      .limit(1);
    expect(after!.position).toBe(positionsBetween(null, null, 1)[0]);
    expect(await boardVersion(boardId)).toBe(v0 + 1);
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
