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

/** Builds a Socket.IO room name, e.g. `board:abc123`. */
export function roomName(kind: RealtimeRoomKind, id: string): string {
  return `${kind}:${id}`;
}
