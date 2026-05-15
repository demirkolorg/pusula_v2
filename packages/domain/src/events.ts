import { z } from 'zod';
import { ACTIVITY_EVENT_TYPES, type RealtimeRoomKind } from './constants';

/**
 * Realtime event envelope published to Socket.IO rooms after the DB transaction
 * commits (worker emits — see `apps/worker` `pusula-realtime-publish` queue;
 * the matching DB row lives in `realtime_events` outbox). `seq` mirrors the
 * scope's `boards.version` so a reconnecting client detects missed events and
 * refetches via `board.get` instead of patching sockets. `clientMutationId`
 * lets the originating client ignore the echo of its own optimistic mutation.
 *
 * Spec: `docs/architecture/05-board-mekanigi.md` §5.3 (Faz 5).
 */
export interface RealtimeEventEnvelope<TPayload = unknown> {
  /** `realtime_events.id` (UUID) — for client-side idempotent dedupe. */
  id: string;
  /** Event type — e.g. `card.moved`, `list.archived`, `board.updated`. */
  type: string;
  workspaceId: string;
  /** Set for board-scoped events (the Faz 5 default). */
  boardId?: string;
  /** Set for card-scoped events (Faz 6+ kart detayı). */
  cardId?: string;
  /** Originating user (matches `activity_events.actor_id`). */
  actorUserId: string;
  /**
   * Echo filter: the originating client's per-mutation UUID v4. Server-initiated
   * events (no client mutation behind them) omit this field.
   */
  clientMutationId?: string;
  /** `boards.version` snapshot — gap detection drives `board.get` refetch. */
  seq: number;
  /** Event-specific payload (e.g. `{ cardId, fromListId, toListId, position }`). */
  payload: TPayload;
  /** ISO-8601 server timestamp. */
  createdAt: string;
}

export const activityEventTypeSchema = z.enum(ACTIVITY_EVENT_TYPES);

export const realtimeEventEnvelopeSchema = z.object({
  id: z.string(),
  type: z.string(),
  workspaceId: z.string(),
  boardId: z.string().optional(),
  cardId: z.string().optional(),
  actorUserId: z.string(),
  clientMutationId: z.string().optional(),
  seq: z.number().int().nonnegative(),
  payload: z.unknown(),
  createdAt: z.string(),
});

/**
 * Ack reply for `board:join` and `board:leave` Socket.IO events. Shared by
 * `apps/api/src/socket/rooms.ts` (server) and `apps/web/src/lib/realtime/`
 * (client) so neither side duplicates the error enum. Faz 5 review fix (5A.3).
 */
export type BoardRoomAck = { ok: true } | { ok: false; error: 'Forbidden' | 'BadRequest' };

/** Builds a Socket.IO room name, e.g. `board:abc123`. */
export function roomName(kind: RealtimeRoomKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * Realtime event payload shapes shared between the server producer
 * (`packages/api/src/routers/*` + `insertRealtimeEvent`) and the client
 * dispatcher (`apps/web/src/lib/realtime/event-handlers.ts`). Listed only for
 * events whose payload shape is tightly inferred client-side and where a
 * silent drift between producer and consumer would corrupt the cache.
 * Faz 5 review fix (5C.1).
 */
export interface CardCompletedPayload {
  cardId: string;
  completedAt: string;
  completedBy: string | null;
}

export const cardCompletedPayloadSchema = z.object({
  cardId: z.string().min(1),
  completedAt: z.string(),
  completedBy: z.string().nullable(),
});

export interface CardUncompletedPayload {
  cardId: string;
}

export const cardUncompletedPayloadSchema = z.object({
  cardId: z.string().min(1),
});

const payloadObjectSchema = z.record(z.string(), z.unknown());

function hasPositionField(payload: { position?: unknown; toPosition?: unknown }): boolean {
  return typeof payload.position === 'string' || typeof payload.toPosition === 'string';
}

const cardCreatedRowSchema = z
  .object({
    id: z.string().min(1),
    listId: z.string().min(1),
    title: z.string(),
  })
  .passthrough()
  .refine(hasPositionField);

const cardCreatedPayloadSchema = z.union([
  z.object({ card: cardCreatedRowSchema }).passthrough(),
  z
    .object({
      cardId: z.string().min(1),
      listId: z.string().min(1),
      title: z.string(),
    })
    .passthrough()
    .refine(hasPositionField),
]);

const cardUpdatedPayloadSchema = z
  .object({
    cardId: z.string().min(1),
    patch: payloadObjectSchema,
  })
  .passthrough();

export const realtimeEventPayloadSchemas = {
  'card.created': cardCreatedPayloadSchema,
  'card.updated': cardUpdatedPayloadSchema,
  'card.completed': cardCompletedPayloadSchema,
  'card.uncompleted': cardUncompletedPayloadSchema,
} satisfies Record<string, z.ZodType<unknown>>;

export type RealtimeEventPayloadType = keyof typeof realtimeEventPayloadSchemas;

export function hasRealtimeEventPayloadSchema(type: string): type is RealtimeEventPayloadType {
  return Object.prototype.hasOwnProperty.call(realtimeEventPayloadSchemas, type);
}

export function parseRealtimeEventPayload(type: string, payload: unknown): unknown | undefined {
  if (!hasRealtimeEventPayloadSchema(type)) return payload;
  const result = realtimeEventPayloadSchemas[type].safeParse(payload);
  return result.success ? result.data : undefined;
}
