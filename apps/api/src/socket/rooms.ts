/**
 * Socket.IO room management — Faz 5A (DEM-83).
 *
 * Two rooms matter in Faz 5:
 *  - `user:{userId}` — auto-joined on connection. Faz 6 notification fan-out
 *    targets this room; Faz 5 already populates it so server-initiated user
 *    events (e.g. a board the user no longer has access to) have a destination.
 *  - `board:{boardId}` — joined on demand. The client emits `board:join` when
 *    a board page mounts; the server resolves the user's effective board role
 *    (`viewer+` suffices — viewers see events but `apps/web` Faz 4C won't let
 *    them mutate). Archived boards reject the join (Karar 2026-05-13(c)) —
 *    the production resolver in `index.ts` is what enforces this; this module
 *    just sees a `null` resolver result and acks `Forbidden`.
 *
 * `resolveBoardAccess` is injected so the socket tests can swap in a stub
 * (the real implementation in `@pusula/api` reads the DB).
 */
import type { Server, Socket } from 'socket.io';
import { roomName } from '@pusula/domain';

/** Pluggable board-access resolver — defaults to `@pusula/api`'s `resolveBoardAccess` in production. */
export type BoardAccessResolver = (
  boardId: string,
  userId: string,
) => Promise<{ role: string } | null>;

/**
 * Inbound `board:join` payload — currently just the board id, kept open so we
 * can add e.g. a desired role bound check later without breaking the wire.
 */
export interface BoardJoinPayload {
  boardId: string;
}

/**
 * Wire the per-connection room handlers onto a freshly authenticated socket.
 * Called from inside the `connection` handler — by then `socket.data.userId`
 * has been set by the auth middleware.
 */
export function attachRoomHandlers(socket: Socket, resolveBoardAccess: BoardAccessResolver): void {
  const userId = socket.data.userId as string | undefined;
  if (!userId) {
    // Defensive: the auth middleware should have already rejected this connection.
    socket.disconnect(true);
    return;
  }

  // Auto-join the personal room — Faz 6 notification delivery target.
  void socket.join(roomName('user', userId));

  socket.on('board:join', async (payload: BoardJoinPayload, ack?: (res: AckResult) => void) => {
    const boardId = typeof payload?.boardId === 'string' ? payload.boardId : '';
    if (!boardId) {
      respond(ack, { ok: false, error: 'BadRequest' });
      return;
    }
    try {
      const access = await resolveBoardAccess(boardId, userId);
      if (!access) {
        respond(ack, { ok: false, error: 'Forbidden' });
        return;
      }
      await socket.join(roomName('board', boardId));
      respond(ack, { ok: true });
    } catch (err) {
      // Treat a resolver throw as a forbidden join — never leak internals.
      console.warn(
        `[api:socket] board:join resolver error (board=${boardId} user=${userId}):`,
        err instanceof Error ? err.message : String(err),
      );
      respond(ack, { ok: false, error: 'Forbidden' });
    }
  });

  socket.on('board:leave', async (payload: BoardJoinPayload, ack?: (res: AckResult) => void) => {
    const boardId = typeof payload?.boardId === 'string' ? payload.boardId : '';
    if (!boardId) {
      respond(ack, { ok: false, error: 'BadRequest' });
      return;
    }
    await socket.leave(roomName('board', boardId));
    respond(ack, { ok: true });
  });
}

/**
 * Wire the connection-time handler on a Socket.IO server. Separated from
 * `attachRoomHandlers` so a host can replace it (e.g. tests) without
 * re-wiring the auth middleware too.
 */
export function attachConnectionHandler(io: Server, resolveBoardAccess: BoardAccessResolver): void {
  io.on('connection', (socket) => {
    attachRoomHandlers(socket, resolveBoardAccess);
  });
}

type AckResult = { ok: true } | { ok: false; error: 'Forbidden' | 'BadRequest' };

function respond(ack: ((res: AckResult) => void) | undefined, result: AckResult): void {
  if (typeof ack === 'function') ack(result);
}
