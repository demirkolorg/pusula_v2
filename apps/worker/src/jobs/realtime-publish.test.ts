/**
 * Integration tests for the realtime-publish job (Faz 5B — DEM-84). Hits a real
 * Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm db:migrate`).
 * If no database is reachable the suite is skipped rather than failing on a
 * box without infra (same pattern as `compaction.test.ts`).
 *
 * Redis is *not* required: the processor takes an injectable `RealtimePublisher`
 * so we can assert publish calls in-memory.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { boards, realtimeEvents, users, workspaces } from '@pusula/db';
import {
  processRealtimePublishJob,
  REALTIME_PUBLISH_CHANNEL,
  type RealtimePublishMessage,
} from './realtime-publish';
import { sweepStaleRealtimeEvents } from './realtime-publish-sweeper';

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

/** Capturing publisher — records every publish call, no Redis touched. */
function capturingPublisher() {
  const calls: Array<{ channel: string; message: RealtimePublishMessage }> = [];
  const publish = async (channel: string, raw: string) => {
    calls.push({ channel, message: JSON.parse(raw) as RealtimePublishMessage });
    return 1;
  };
  return { publish, calls };
}

describe.runIf(dbAvailable)('processRealtimePublishJob (integration)', () => {
  const db = () => probe!.db;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const ownerId = newId('u-rt-owner');
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

  async function seedBoard(): Promise<{ workspaceId: string; boardId: string; ownerId: string }> {
    const ownerId = newId('u-rt');
    createdUserIds.push(ownerId);
    await db()
      .insert(users)
      .values({ id: ownerId, name: ownerId, email: `${ownerId}@example.test` });

    const [ws] = await db()
      .insert(workspaces)
      .values({ name: 'RT Co', slug: newId('rt-co'), ownerId })
      .returning({ id: workspaces.id });
    createdWorkspaceIds.push(ws!.id);

    const [board] = await db()
      .insert(boards)
      .values({ workspaceId: ws!.id, title: 'RT Board' })
      .returning({ id: boards.id });

    return { workspaceId: ws!.id, boardId: board!.id, ownerId };
  }

  async function seedEvent(opts: {
    workspaceId: string;
    boardId: string;
    actorId: string;
    type?: string;
    cardId?: string;
    clientMutationId?: string;
    seq?: number;
    data?: unknown;
  }): Promise<string> {
    const [row] = await db()
      .insert(realtimeEvents)
      .values({
        workspaceId: opts.workspaceId,
        boardId: opts.boardId,
        cardId: opts.cardId ?? null,
        actorId: opts.actorId,
        type: opts.type ?? 'card.moved',
        clientMutationId: opts.clientMutationId ?? null,
        payload: { seq: opts.seq ?? 1, data: opts.data ?? { cardId: 'c1' } },
      })
      .returning({ id: realtimeEvents.id });
    return row!.id;
  }

  it('publishes a pending event and stamps published_at', async () => {
    const seed = await seedBoard();
    const eventId = await seedEvent({
      workspaceId: seed.workspaceId,
      boardId: seed.boardId,
      actorId: seed.ownerId,
      type: 'card.moved',
      clientMutationId: '11111111-1111-4111-8111-111111111111',
      seq: 7,
      data: { cardId: 'c1', toListId: 'l1' },
    });

    const pub = capturingPublisher();
    const outcome = await processRealtimePublishJob(db() as never, pub, { eventId });
    expect(outcome).toBe('published');

    expect(pub.calls).toHaveLength(1);
    const call = pub.calls[0]!;
    expect(call.channel).toBe(REALTIME_PUBLISH_CHANNEL);
    expect(call.message.rooms).toEqual([{ kind: 'board', id: seed.boardId }]);
    expect(call.message.envelope).toMatchObject({
      id: eventId,
      type: 'card.moved',
      workspaceId: seed.workspaceId,
      boardId: seed.boardId,
      actorUserId: seed.ownerId,
      clientMutationId: '11111111-1111-4111-8111-111111111111',
      seq: 7,
      payload: { cardId: 'c1', toListId: 'l1' },
    });

    const [row] = await db()
      .select({ publishedAt: realtimeEvents.publishedAt, status: realtimeEvents.status })
      .from(realtimeEvents)
      .where(dbMod.eq(realtimeEvents.id, eventId))
      .limit(1);
    expect(row!.publishedAt).not.toBeNull();
    expect(row!.status).toBe('sent');
  });

  it('is idempotent: a second run on an already-published row is a no-op', async () => {
    const seed = await seedBoard();
    const eventId = await seedEvent({
      workspaceId: seed.workspaceId,
      boardId: seed.boardId,
      actorId: seed.ownerId,
    });

    const pub1 = capturingPublisher();
    expect(await processRealtimePublishJob(db() as never, pub1, { eventId })).toBe('published');
    expect(pub1.calls).toHaveLength(1);

    const pub2 = capturingPublisher();
    expect(await processRealtimePublishJob(db() as never, pub2, { eventId })).toBe('missing');
    expect(pub2.calls).toHaveLength(0);
  });

  it('returns "missing" when the eventId does not exist', async () => {
    const pub = capturingPublisher();
    const outcome = await processRealtimePublishJob(db() as never, pub, {
      eventId: 'nope_does_not_exist',
    });
    expect(outcome).toBe('missing');
    expect(pub.calls).toHaveLength(0);
  });

  it('fans cross-board moves out to both target and source board rooms', async () => {
    const seed = await seedBoard();
    const eventId = await seedEvent({
      workspaceId: seed.workspaceId,
      boardId: seed.boardId, // target
      actorId: seed.ownerId,
      type: 'card.movedToList',
      data: {
        cardId: 'c1',
        toListId: 'l2',
        fromBoardId: 'b-source',
        toBoardId: seed.boardId,
      },
    });

    const pub = capturingPublisher();
    expect(await processRealtimePublishJob(db() as never, pub, { eventId })).toBe('published');
    expect(pub.calls[0]!.message.rooms).toEqual([
      { kind: 'board', id: seed.boardId },
      { kind: 'board', id: 'b-source' },
    ]);
  });

  it('validates list.updated color payloads before publishing', async () => {
    const seed = await seedBoard();
    const eventId = await seedEvent({
      workspaceId: seed.workspaceId,
      boardId: seed.boardId,
      actorId: seed.ownerId,
      type: 'list.updated',
      data: {
        listId: 'L1',
        color: 'not-a-list-colour',
      },
    });
    const pub = capturingPublisher();

    await expect(processRealtimePublishJob(db() as never, pub, { eventId })).rejects.toThrow();
    expect(pub.calls).toHaveLength(0);

    const [row] = await db()
      .select({ publishedAt: realtimeEvents.publishedAt, status: realtimeEvents.status })
      .from(realtimeEvents)
      .where(dbMod.eq(realtimeEvents.id, eventId))
      .limit(1);
    expect(row!.publishedAt).toBeNull();
    expect(row!.status).toBe('pending');
  });

  it('rolls back the publish stamp when the publisher throws', async () => {
    const seed = await seedBoard();
    const eventId = await seedEvent({
      workspaceId: seed.workspaceId,
      boardId: seed.boardId,
      actorId: seed.ownerId,
    });
    const failingPub = {
      publish: async () => {
        throw new Error('redis down');
      },
    };
    await expect(
      processRealtimePublishJob(db() as never, failingPub, { eventId }),
    ).rejects.toThrow('redis down');

    // Transaction rolled back → row is still pending. Sweeper will pick it up.
    const [row] = await db()
      .select({ publishedAt: realtimeEvents.publishedAt })
      .from(realtimeEvents)
      .where(dbMod.eq(realtimeEvents.id, eventId))
      .limit(1);
    expect(row!.publishedAt).toBeNull();
  });
});

describe.runIf(dbAvailable)('sweepStaleRealtimeEvents (integration)', () => {
  const db = () => probe!.db;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  async function seedBoard(): Promise<{ workspaceId: string; boardId: string; ownerId: string }> {
    const ownerId = newId('u-sw');
    createdUserIds.push(ownerId);
    await db()
      .insert(users)
      .values({ id: ownerId, name: ownerId, email: `${ownerId}@example.test` });

    const [ws] = await db()
      .insert(workspaces)
      .values({ name: 'Sweep Co', slug: newId('sweep-co'), ownerId })
      .returning({ id: workspaces.id });
    createdWorkspaceIds.push(ws!.id);

    const [board] = await db()
      .insert(boards)
      .values({ workspaceId: ws!.id, title: 'Sweep Board' })
      .returning({ id: boards.id });
    return { workspaceId: ws!.id, boardId: board!.id, ownerId };
  }

  it('re-enqueues only events older than the grace window', async () => {
    const seed = await seedBoard();

    // Fresh (well within the 30 s grace window) — should NOT be re-enqueued.
    const [fresh] = await db()
      .insert(realtimeEvents)
      .values({
        workspaceId: seed.workspaceId,
        boardId: seed.boardId,
        actorId: seed.ownerId,
        type: 'card.moved',
        payload: { seq: 1, data: {} },
      })
      .returning({ id: realtimeEvents.id });

    // Stale (older than grace) — should be re-enqueued.
    const [stale] = await db()
      .insert(realtimeEvents)
      .values({
        workspaceId: seed.workspaceId,
        boardId: seed.boardId,
        actorId: seed.ownerId,
        type: 'card.moved',
        payload: { seq: 2, data: {} },
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      })
      .returning({ id: realtimeEvents.id });

    const enqueued: string[] = [];
    const enqueuer = {
      enqueue: async (eventId: string) => {
        enqueued.push(eventId);
      },
    };
    const count = await sweepStaleRealtimeEvents(db() as never, enqueuer);

    expect(count).toBeGreaterThanOrEqual(1);
    expect(enqueued).toContain(stale!.id);
    expect(enqueued).not.toContain(fresh!.id);
  });

  it('skips events that are already published', async () => {
    const seed = await seedBoard();
    const [published] = await db()
      .insert(realtimeEvents)
      .values({
        workspaceId: seed.workspaceId,
        boardId: seed.boardId,
        actorId: seed.ownerId,
        type: 'card.moved',
        payload: { seq: 1, data: {} },
        publishedAt: new Date(),
        createdAt: new Date(Date.now() - 5 * 60 * 1000),
      })
      .returning({ id: realtimeEvents.id });

    const enqueued: string[] = [];
    const enqueuer = {
      enqueue: async (eventId: string) => {
        enqueued.push(eventId);
      },
    };
    await sweepStaleRealtimeEvents(db() as never, enqueuer);

    expect(enqueued).not.toContain(published!.id);
  });

  it('swallows enqueuer errors so one bad row does not kill the batch', async () => {
    const seed = await seedBoard();
    const olderThanGrace = new Date(Date.now() - 5 * 60 * 1000);
    const [a] = await db()
      .insert(realtimeEvents)
      .values({
        workspaceId: seed.workspaceId,
        boardId: seed.boardId,
        actorId: seed.ownerId,
        type: 'card.moved',
        payload: { seq: 1, data: {} },
        createdAt: olderThanGrace,
      })
      .returning({ id: realtimeEvents.id });
    const [b] = await db()
      .insert(realtimeEvents)
      .values({
        workspaceId: seed.workspaceId,
        boardId: seed.boardId,
        actorId: seed.ownerId,
        type: 'card.moved',
        payload: { seq: 2, data: {} },
        createdAt: olderThanGrace,
      })
      .returning({ id: realtimeEvents.id });

    const enqueued: string[] = [];
    const enqueuer = {
      enqueue: async (eventId: string) => {
        if (eventId === a!.id) throw new Error('redis flap');
        enqueued.push(eventId);
      },
    };
    // Other tests / prior runs may leave stale pending rows in the table, so
    // we don't pin the return count — just assert per-row behaviour: a's
    // error was swallowed (not in `enqueued`), b made it through.
    await sweepStaleRealtimeEvents(db() as never, enqueuer);

    expect(enqueued).toContain(b!.id);
    expect(enqueued).not.toContain(a!.id);
  });
});
