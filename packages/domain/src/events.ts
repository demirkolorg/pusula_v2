import { z } from 'zod';
import { ACTIVITY_EVENT_TYPES, type RealtimeRoomKind } from './constants';

/**
 * Realtime event envelope published to Socket.IO rooms after the DB transaction
 * commits. `sequence` / `boardVersion` let a reconnecting client detect missed
 * events and refetch instead of patching sockets. `clientMutationId` lets the
 * originating client ignore the echo of its own optimistic mutation.
 *
 * See `docs/PUSULA_TEKNIK_MIMARI.md` §8.
 */
export interface RealtimeEventEnvelope<TPayload = unknown> {
  id: string;
  workspaceId: string;
  boardId?: string;
  cardId?: string;
  actorId: string;
  type: string;
  payload: TPayload;
  clientMutationId?: string;
  boardVersion?: number;
  sequence: number;
  createdAt: string;
}

export const activityEventTypeSchema = z.enum(ACTIVITY_EVENT_TYPES);

export const realtimeEventEnvelopeSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  boardId: z.string().optional(),
  cardId: z.string().optional(),
  actorId: z.string(),
  type: z.string(),
  payload: z.unknown(),
  clientMutationId: z.string().optional(),
  boardVersion: z.number().int().nonnegative().optional(),
  sequence: z.number().int().nonnegative(),
  createdAt: z.string(),
});

/** Builds a Socket.IO room name, e.g. `board:abc123`. */
export function roomName(kind: RealtimeRoomKind, id: string): string {
  return `${kind}:${id}`;
}
