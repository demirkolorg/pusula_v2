/**
 * Socket.IO room management — Faz 5A (DEM-83).
 *
 * Three rooms matter:
 *  - `user:{userId}` — auto-joined on connection. Faz 6 notification fan-out
 *    targets this room; Faz 5 already populates it so server-initiated user
 *    events (e.g. a board the user no longer has access to) have a destination.
 *  - `board:{boardId}` — joined on demand via `board:join`. Server resolves
 *    the user's effective board role (`viewer+` suffices). Archived boards
 *    reject (Karar 2026-05-13(c)).
 *  - `workspace:{workspaceId}` — joined on demand via `workspace:join` (Faz
 *    13N / DEM-270). 13E report-cache-invalidator publishes
 *    `report.invalidated` to this room so any open report panel in that
 *    workspace can render the stale badge. Membership (`owner/admin/member/
 *    guest`) is required; non-members reject with `Forbidden`.
 *
 * `resolveBoardAccess` + `resolveWorkspaceAccess` are injected so the socket
 * tests can swap in stubs (the real implementations in `@pusula/api` read
 * the DB).
 */
import type { Server, Socket } from 'socket.io';
import { roomName, type BoardRoomAck } from '@pusula/domain';

/** Pluggable board-access resolver — defaults to `@pusula/api`'s `resolveBoardAccess` in production. */
export type BoardAccessResolver = (
  boardId: string,
  userId: string,
) => Promise<{ role: string } | null>;

/**
 * Pluggable workspace-access resolver — Faz 13N (DEM-270). Returns the
 * workspace role string (`owner/admin/member/guest`) or `null` when the
 * user is not a member of the workspace.
 */
export type WorkspaceAccessResolver = (
  workspaceId: string,
  userId: string,
) => Promise<{ role: string } | null>;

/**
 * Inbound `board:join` payload — currently just the board id, kept open so we
 * can add e.g. a desired role bound check later without breaking the wire.
 */
export interface BoardJoinPayload {
  boardId: string;
}

/** Inbound `workspace:join` / `workspace:leave` payload — Faz 13N. */
export interface WorkspaceJoinPayload {
  workspaceId: string;
}

export interface AttachRoomHandlersDeps {
  resolveBoardAccess: BoardAccessResolver;
  /**
   * Faz 13N — optional during transition; when omitted, `workspace:join`
   * rejects with `Forbidden` (defense-in-depth: no silent open room).
   * Production wiring in `index.ts` always supplies this.
   */
  resolveWorkspaceAccess?: WorkspaceAccessResolver;
}

/**
 * Wire the per-connection room handlers onto a freshly authenticated socket.
 * Called from inside the `connection` handler — by then `socket.data.userId`
 * has been set by the auth middleware.
 */
export function attachRoomHandlers(socket: Socket, deps: AttachRoomHandlersDeps): void {
  const userId = socket.data.userId as string | undefined;
  if (!userId) {
    // Defensive: the auth middleware should have already rejected this connection.
    socket.disconnect(true);
    return;
  }

  // Auto-join the personal room — Faz 6 notification delivery target.
  // Faz 6 review fix (W4 DEM-94): join'i await edip ardından `user:joined`
  // ack event'i emit ediyoruz — e2e testleri (`installRealtimeProbe`)
  // room üyeliğinin gerçekten tamamlandığını bu sinyalle bekler; aksi halde
  // bridge'in ilk envelope'u room üyeliği tamamlanmadan önce gelirse kaçırılır.
  void (async () => {
    try {
      await socket.join(roomName('user', userId));
      socket.emit('user:joined', { userId });
    } catch (err) {
      console.warn(
        `[api:socket] user:auto-join failed (user=${userId}):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  })();

  socket.on('board:join', async (payload: BoardJoinPayload, ack?: (res: BoardRoomAck) => void) => {
    const boardId = typeof payload?.boardId === 'string' ? payload.boardId : '';
    if (!boardId) {
      respond(ack, { ok: false, error: 'BadRequest' });
      return;
    }
    try {
      const access = await deps.resolveBoardAccess(boardId, userId);
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

  socket.on('board:leave', async (payload: BoardJoinPayload, ack?: (res: BoardRoomAck) => void) => {
    const boardId = typeof payload?.boardId === 'string' ? payload.boardId : '';
    if (!boardId) {
      respond(ack, { ok: false, error: 'BadRequest' });
      return;
    }
    await socket.leave(roomName('board', boardId));
    respond(ack, { ok: true });
  });

  // Faz 13N (DEM-270) — workspace room handlers. Mirror'lar board:join
  // pattern'ini: payload doğrulama → permission check → join + ack.
  // Permission tek bilgi: workspace membership var mı? (owner/admin/member/
  // guest) — board-only kullanıcı (workspace üyesi olmayan) workspace
  // room'a join edemez; stale event'i de almaz (workspace scope rapor
  // göremedikleri için zaten alakasız).
  socket.on(
    'workspace:join',
    async (payload: WorkspaceJoinPayload, ack?: (res: BoardRoomAck) => void) => {
      const workspaceId =
        typeof payload?.workspaceId === 'string' ? payload.workspaceId : '';
      if (!workspaceId) {
        respond(ack, { ok: false, error: 'BadRequest' });
        return;
      }
      if (!deps.resolveWorkspaceAccess) {
        // Production wiring her zaman resolver verir; test injection'da
        // omit edilebilir — fail-secure default Forbidden.
        respond(ack, { ok: false, error: 'Forbidden' });
        return;
      }
      try {
        const access = await deps.resolveWorkspaceAccess(workspaceId, userId);
        if (!access) {
          respond(ack, { ok: false, error: 'Forbidden' });
          return;
        }
        await socket.join(roomName('workspace', workspaceId));
        respond(ack, { ok: true });
      } catch (err) {
        console.warn(
          `[api:socket] workspace:join resolver error (workspace=${workspaceId} user=${userId}):`,
          err instanceof Error ? err.message : String(err),
        );
        respond(ack, { ok: false, error: 'Forbidden' });
      }
    },
  );

  socket.on(
    'workspace:leave',
    async (payload: WorkspaceJoinPayload, ack?: (res: BoardRoomAck) => void) => {
      const workspaceId =
        typeof payload?.workspaceId === 'string' ? payload.workspaceId : '';
      if (!workspaceId) {
        respond(ack, { ok: false, error: 'BadRequest' });
        return;
      }
      await socket.leave(roomName('workspace', workspaceId));
      respond(ack, { ok: true });
    },
  );
}

/**
 * Wire the connection-time handler on a Socket.IO server. Separated from
 * `attachRoomHandlers` so a host can replace it (e.g. tests) without
 * re-wiring the auth middleware too.
 */
export function attachConnectionHandler(
  io: Server,
  deps: AttachRoomHandlersDeps,
): void {
  io.on('connection', (socket) => {
    attachRoomHandlers(socket, deps);
  });
}

function respond(ack: ((res: BoardRoomAck) => void) | undefined, result: BoardRoomAck): void {
  if (typeof ack === 'function') ack(result);
}
