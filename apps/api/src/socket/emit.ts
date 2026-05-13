/**
 * Realtime emit helpers — Faz 5A (DEM-83).
 *
 * Wraps a Socket.IO `Server` with the `RealtimeEmit` shape that `@pusula/api`
 * carries on its tRPC context. Two thin helpers (`emitToBoard`, `emitToUser`)
 * — the room names live in `@pusula/domain` (`roomName`) so the producer
 * (this) and the client subscriber stay in lockstep. The Redis adapter (when
 * mounted) makes both emits cross-instance: any API node can publish, all of
 * them fan out to their locally connected sockets.
 *
 * Direct emit from procedure bodies is the exception, not the rule — Faz 5B
 * routes most writes through the `realtime_events` outbox + worker. These
 * helpers stay synchronous (fire-and-forget) because Socket.IO's emit is
 * already in-memory non-blocking; the Redis adapter publish runs async but
 * its delivery guarantees are the same as a regular `io.to(...).emit(...)`.
 */
import type { Server } from 'socket.io';
import { roomName, type RealtimeEventEnvelope } from '@pusula/domain';
import type { RealtimeEmit } from '@pusula/api';

/** Socket.IO event name used to wrap every `RealtimeEventEnvelope`. */
export const REALTIME_EVENT_CHANNEL = 'realtime:event';

/** Build the `RealtimeEmit` closure pair `@pusula/api` expects in its tRPC context. */
export function createRealtimeEmit(io: Server): RealtimeEmit {
  return {
    emitToBoard(boardId, envelope) {
      io.to(roomName('board', boardId)).emit(REALTIME_EVENT_CHANNEL, envelope);
    },
    emitToUser(userId, envelope) {
      io.to(roomName('user', userId)).emit(REALTIME_EVENT_CHANNEL, envelope);
    },
  };
}

export type { RealtimeEventEnvelope };
