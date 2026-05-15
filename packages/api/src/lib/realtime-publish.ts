/**
 * Realtime outbox insert + producer plumbing (Faz 5B — DEM-84).
 *
 * Each board/list/card collaborative mutation writes a `realtime_events` row in
 * the same transaction as the domain change, then — after the tx commits — the
 * host app (`apps/api`) hands the `eventId` to a BullMQ producer. The worker
 * (`apps/worker` `pusula-realtime-publish`) picks it up, formats the
 * `RealtimeEventEnvelope`, and publishes it to the Socket.IO room.
 *
 * The procedures stay framework-agnostic: they call `insertRealtimeEvent` with
 * the scope (board / list / card) and event-specific payload, then enqueue via
 * `ctx.enqueueRealtimePublish` (host-supplied). In tests / Next route handlers
 * the hook is absent → enqueue is a no-op; the periodic sweeper
 * (`apps/worker/src/jobs/realtime-publish-sweeper.ts`) drains any stragglers.
 *
 * The DB row is the source of truth: `payload` carries `{ seq, data }` where
 * `seq` mirrors `boards.version` (envelope.`seq` for client gap detection) and
 * `data` is the event-specific payload (envelope.`payload`). Top-level columns
 * (`type`, `workspaceId`, `boardId`, `cardId`, `actorId`, `clientMutationId`)
 * map straight to envelope fields. The worker reconstructs the envelope at
 * publish time.
 *
 * See `docs/architecture/05-board-mekanigi.md` §5.3 and
 * `docs/architecture/06-bildirim-altyapisi.md` "Realtime event yayın katmanı (Faz 5)".
 */
import { boards, eq, realtimeEvents, sql } from '@pusula/db';
import type { Database } from '@pusula/db';

/** The minimal transaction-or-db handle the helper needs. */
type InsertTx = Pick<Database, 'insert'>;
type UpdateTx = Pick<Database, 'update'>;

/** Host-supplied, best-effort enqueue hook (Redis errors must be swallowed by the host). */
export type EnqueueRealtimePublish = (args: { eventId: string }) => void | Promise<void>;

/** Shape persisted in `realtime_events.payload` — worker rebuilds the envelope from it. */
export interface RealtimePayloadEnvelope<TData = unknown> {
  /** `boards.version` snapshot at insert time. Surfaces as `RealtimeEventEnvelope.seq`. */
  seq: number;
  /** Event-specific data. Surfaces as `RealtimeEventEnvelope.payload`. */
  data: TData;
}

/** Inputs `insertRealtimeEvent` accepts — mirrors the envelope shape. */
export interface InsertRealtimeEventInput<TData = unknown> {
  type: string;
  workspaceId: string;
  boardId?: string | null;
  cardId?: string | null;
  actorId: string;
  clientMutationId?: string | null;
  /** `boards.version` snapshot — surfaces as envelope.`seq`. */
  seq: number;
  /** Event-specific data — surfaces as envelope.`payload`. */
  data: TData;
}

/**
 * Insert a pending `realtime_events` row inside the caller's transaction and
 * return its id. Caller enqueues `{ eventId }` to `pusula-realtime-publish`
 * **after** the tx commits (so the worker never reads a row that doesn't
 * exist yet); a failed enqueue is fine — the sweeper picks the row up by
 * `published_at IS NULL` after 30 s.
 *
 * `clientMutationId` propagates `null` → DB `null`, so `payload->>'clientMutationId'`
 * downstream queries don't have to coalesce `undefined`.
 */
export async function insertRealtimeEvent<TData>(
  tx: InsertTx,
  input: InsertRealtimeEventInput<TData>,
): Promise<string> {
  const envelope: RealtimePayloadEnvelope<TData> = { seq: input.seq, data: input.data };
  const [row] = await tx
    .insert(realtimeEvents)
    .values({
      type: input.type,
      workspaceId: input.workspaceId,
      boardId: input.boardId ?? null,
      cardId: input.cardId ?? null,
      actorId: input.actorId,
      clientMutationId: input.clientMutationId ?? null,
      payload: envelope,
    })
    .returning({ id: realtimeEvents.id });
  if (!row) throw new Error('realtime_events insert returned no row');
  return row.id;
}

/** Bump `boards.version` and return the fresh value for envelope `seq`. */
export async function bumpBoardVersionForRealtime(tx: UpdateTx, boardId: string): Promise<number> {
  const [row] = await tx
    .update(boards)
    .set({ version: sql`${boards.version} + 1` })
    .where(eq(boards.id, boardId))
    .returning({ version: boards.version });
  return row?.version ?? 0;
}

/** Minimal slice of the tRPC context this helper needs. */
interface CtxWithEnqueue {
  enqueueRealtimePublish?: EnqueueRealtimePublish;
}

/**
 * Best-effort enqueue helper — fires `ctx.enqueueRealtimePublish({ eventId })`
 * iff the host wired it. The caller `void`s the call (the host is expected to
 * swallow Redis errors); this wrapper centralises the null-check so procedures
 * don't repeat `if (ctx.enqueueRealtimePublish) void ctx.enqueueRealtimePublish(...)`.
 */
export function maybeEnqueueRealtimePublish(
  ctx: CtxWithEnqueue,
  eventId: string | undefined,
): void {
  if (!eventId) return;
  if (!ctx.enqueueRealtimePublish) return;
  void ctx.enqueueRealtimePublish({ eventId });
}

/** Best-effort enqueue for mutations that create multiple realtime rows. */
export function maybeEnqueueRealtimePublishes(
  ctx: CtxWithEnqueue,
  eventIds: readonly string[],
): void {
  for (const eventId of eventIds) maybeEnqueueRealtimePublish(ctx, eventId);
}
