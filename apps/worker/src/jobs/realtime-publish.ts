/**
 * Realtime event publish job (Faz 5B — DEM-84).
 *
 * Consumer side of the `pusula-realtime-publish` queue. The job payload carries
 * only `{ eventId }`; the worker reads the full row from `realtime_events`,
 * builds the `RealtimeEventEnvelope`, publishes it on a Redis pub/sub channel
 * (`pusula:realtime:envelope`), then stamps `published_at = NOW()`.
 *
 * Why a Redis channel and not a direct Socket.IO emit? `apps/api` owns the
 * Socket.IO server (the worker has no client sockets to fan out to). Going
 * through Redis pub/sub keeps the worker dependency-free of `socket.io` and
 * lets multiple API replicas each emit to their *locally-connected* clients
 * (the bridge in `apps/api/src/socket/realtime-bridge.ts` uses `io.local.…`
 * to bypass the Redis adapter's cross-node relay, so each client receives the
 * envelope exactly once).
 *
 * The job is idempotent. The row is locked with `FOR UPDATE SKIP LOCKED`
 * (paranoia: BullMQ's `jobId = publish-{eventId}` already debounces re-enqueue
 * attempts) and `published_at IS NULL` guarantees that a re-run after a crash
 * (between publish and the UPDATE) skips a row that's already been delivered.
 * A failed run is retried by BullMQ (3 attempts, exponential backoff in
 * `apps/api/src/realtime-publish-queue.ts`); after that, the periodic
 * sweeper picks it up again.
 *
 * Cross-board moves (`card.movedToList`): the envelope is *one* row keyed on
 * the target board, but the payload carries `fromBoardId` so the worker fans
 * the same envelope out to both rooms (target + source). Mirrors the policy
 * in `docs/architecture/05-board-mekanigi.md` §5.3.
 */
import { Redis } from 'ioredis';
import { z } from 'zod';
import { and, eq, isNull, sql } from '@pusula/db';
import { realtimeEvents } from '@pusula/db';
import type { Database } from '@pusula/db';
import { LIST_COLORS, type RealtimeEventEnvelope } from '@pusula/domain';

/** Redis pub/sub channel the bridge in `apps/api/src/socket/` subscribes to. */
export const REALTIME_PUBLISH_CHANNEL = 'pusula:realtime:envelope';

/** BullMQ job name (documentation; the worker matches by queue, not name). */
export const REALTIME_PUBLISH_JOB_NAME = 'realtime-publish';

export type RealtimePublishJobData = { eventId: string };

/** Wire-format payload pushed onto `REALTIME_PUBLISH_CHANNEL`. */
export interface RealtimePublishMessage {
  envelope: RealtimeEventEnvelope;
  /**
   * Rooms the bridge should fan the envelope out to. Always at least one entry;
   * a cross-board `card.movedToList` ships both the target and source board.
   */
  rooms: Array<{ kind: 'board' | 'user'; id: string }>;
}

/** Minimal publish surface — `Redis['publish']` shape; injectable for tests. */
export interface RealtimePublisher {
  publish: (channel: string, message: string) => Promise<number> | number;
}

const listUpdatedPayloadSchema = z
  .object({
    listId: z.string().min(1),
    fromTitle: z.string().optional(),
    toTitle: z.string().optional(),
    color: z.enum(LIST_COLORS).nullable().optional(),
  })
  .passthrough();

/** What the worker pulls out of `realtime_events` for one job. */
type RealtimeEventRow = {
  id: string;
  type: string;
  workspaceId: string;
  boardId: string | null;
  cardId: string | null;
  actorId: string | null;
  clientMutationId: string | null;
  payload: unknown;
  publishedAt: Date | null;
  createdAt: Date;
};

/**
 * Read the row, format the envelope, publish, stamp `published_at`. Returns
 * `'published'` on success or `'missing'` if the row was already published
 * (the common idempotent case) or deleted between enqueue and now.
 */
export async function processRealtimePublishJob(
  db: Database,
  publisher: RealtimePublisher,
  data: RealtimePublishJobData,
): Promise<'published' | 'missing'> {
  return db.transaction(async (tx) => {
    // `FOR UPDATE SKIP LOCKED` so two concurrent workers (or a worker + the
    // sweeper) can't fight over the same row — the loser just skips. The
    // `published_at IS NULL` filter makes this idempotent: a re-run after a
    // crash mid-publish is a no-op once the previous run committed.
    const [row] = (await tx
      .select({
        id: realtimeEvents.id,
        type: realtimeEvents.type,
        workspaceId: realtimeEvents.workspaceId,
        boardId: realtimeEvents.boardId,
        cardId: realtimeEvents.cardId,
        actorId: realtimeEvents.actorId,
        clientMutationId: realtimeEvents.clientMutationId,
        payload: realtimeEvents.payload,
        publishedAt: realtimeEvents.publishedAt,
        createdAt: realtimeEvents.createdAt,
      })
      .from(realtimeEvents)
      .where(and(eq(realtimeEvents.id, data.eventId), isNull(realtimeEvents.publishedAt)))
      .limit(1)
      .for('update', { skipLocked: true })) as RealtimeEventRow[];
    if (!row) {
      // Either the row was already published (the common idempotent case) or
      // it was deleted between enqueue and now. Distinguishing the two costs an
      // extra query and changes no behaviour.
      return 'missing' as const;
    }

    const envelope = toEnvelope(row);
    const rooms = roomsFor(row);
    const message: RealtimePublishMessage = { envelope, rooms };
    await publisher.publish(REALTIME_PUBLISH_CHANNEL, JSON.stringify(message));

    await tx
      .update(realtimeEvents)
      .set({
        publishedAt: new Date(),
        status: 'sent',
        attempts: sql`${realtimeEvents.attempts} + 1`,
      })
      .where(eq(realtimeEvents.id, row.id));

    return 'published' as const;
  });
}

/** Build a typed envelope from the DB row. */
function toEnvelope(row: RealtimeEventRow): RealtimeEventEnvelope {
  const payload = (row.payload ?? {}) as { seq?: unknown; data?: unknown };
  const seq = typeof payload.seq === 'number' && Number.isFinite(payload.seq) ? payload.seq : 0;
  // `createdAt` comes back as a `Date` through Drizzle's query builder, but
  // be defensive in case a row was hand-built with a string (tests, replay).
  const createdAt =
    row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as unknown as string);
  return {
    id: row.id,
    type: row.type,
    workspaceId: row.workspaceId,
    boardId: row.boardId ?? undefined,
    cardId: row.cardId ?? undefined,
    // `realtime_events.actor_id` is `ON DELETE SET NULL`. A deleted actor
    // shouldn't kill a realtime event — fall back to the empty string so the
    // envelope still satisfies `actorUserId: string`. Activity rows have the
    // same fallback semantics; the audit truth still lives in `activity_events`.
    actorUserId: row.actorId ?? '',
    clientMutationId: row.clientMutationId ?? undefined,
    seq,
    payload: parseEventPayload(row.type, payload.data ?? null),
    createdAt: createdAt.toISOString(),
  };
}

function parseEventPayload(type: string, payload: unknown): unknown {
  if (type === 'list.updated') {
    return listUpdatedPayloadSchema.parse(payload);
  }
  return payload;
}

/**
 * Which rooms an envelope fans out to. `card.movedToList` events for a
 * cross-board move carry `fromBoardId` in their payload and need to reach the
 * source board's room too (so a viewer there sees the card *leave*).
 *
 * Contract: `payload.data.fromBoardId` is the documented cross-board fan-out
 * marker — any event type that wants to be delivered to both a source and a
 * target board opts in by putting it in the payload. Currently only
 * `card.movedToList` uses it; `card.copy` deliberately doesn't (the source
 * card is unchanged, so the source board has nothing new to render).
 */
function roomsFor(row: RealtimeEventRow): RealtimePublishMessage['rooms'] {
  const rooms: RealtimePublishMessage['rooms'] = [];
  if (row.boardId) rooms.push({ kind: 'board', id: row.boardId });

  const payloadData = ((row.payload ?? {}) as { data?: unknown }).data;
  if (payloadData && typeof payloadData === 'object' && 'fromBoardId' in payloadData) {
    const fromBoardId = (payloadData as { fromBoardId?: unknown }).fromBoardId;
    if (typeof fromBoardId === 'string' && fromBoardId !== row.boardId) {
      rooms.push({ kind: 'board', id: fromBoardId });
    }
  }
  return rooms;
}

/** Default Redis publisher (production wiring). */
export function createDefaultPublisher(
  redisUrl: string,
): RealtimePublisher & { quit: () => Promise<'OK'> } {
  const redis = new Redis(redisUrl);
  redis.on('error', (err) => {
    console.error('[worker:realtime] redis publisher error:', err.message);
  });
  return redis;
}
