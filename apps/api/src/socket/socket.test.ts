/**
 * Socket.IO server tests — Faz 5A (DEM-83).
 *
 * Spins up an ephemeral HTTP server + Socket.IO server with stubbed
 * `resolveSession` / `resolveBoardAccess` callbacks, then drives it with
 * `socket.io-client`. The factory's dependency injection is the entire point
 * of the unit boundary: we don't touch Better Auth or the DB here.
 *
 * Covers (per the tab spec):
 *  - auth middleware rejects a handshake with no resolved session
 *  - auth middleware accepts a handshake with a resolved session and stamps
 *    `socket.data.userId`
 *  - `board:join` with a valid `viewer+` role joins the `board:{boardId}` room
 *  - `board:join` with no access (resolver returns `null`) rejects with
 *    `Forbidden` and does not join the room
 *  - the emit helpers reach the right room (a separate client in `user:{id}`
 *    receives `emitToUser`, a board-joiner receives `emitToBoard`)
 *  - bad `board:join` payload (no `boardId`) acks `BadRequest`
 *
 * No Redis adapter in tests — Socket.IO defaults to in-memory.
 */
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { roomName } from '@pusula/domain';
import {
  createSocketServer,
  type SocketServerHandle,
} from './server';
import { REALTIME_EVENT_CHANNEL } from './emit';
import type { SocketSessionResolver } from './auth';
import type { BoardAccessResolver } from './rooms';

interface Harness {
  httpServer: HttpServer;
  socketHandle: SocketServerHandle;
  port: number;
  resolveSession: ReturnType<typeof vi.fn<SocketSessionResolver>>;
  resolveBoardAccess: ReturnType<typeof vi.fn<BoardAccessResolver>>;
}

async function buildHarness(): Promise<Harness> {
  const resolveSession = vi.fn<SocketSessionResolver>(async () => null);
  const resolveBoardAccess = vi.fn<BoardAccessResolver>(async () => null);

  const httpServer = createServer();
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address() as AddressInfo;
  const port = address.port;

  const socketHandle = await createSocketServer({
    httpServer,
    corsOrigin: 'http://localhost:3000',
    resolveSession,
    resolveBoardAccess,
  });

  return { httpServer, socketHandle, port, resolveSession, resolveBoardAccess };
}

async function teardown(h: Harness): Promise<void> {
  // `socketHandle.close()` calls `io.close()` which, per Socket.IO's docs,
  // also closes the attached HTTP server. We don't `httpServer.close()`
  // ourselves to avoid the second close throwing "Server is not running".
  await h.socketHandle.close();
}

function connect(port: number): ClientSocket {
  return ioClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    timeout: 2_000,
  });
}

function waitForConnect(client: ClientSocket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    client.once('connect', () => resolve());
    client.once('connect_error', (err) => reject(err));
  });
}

describe('Socket.IO server — Faz 5A (DEM-83)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await teardown(h);
  });

  describe('auth middleware', () => {
    it('rejects a handshake when the session resolver returns null', async () => {
      h.resolveSession.mockResolvedValueOnce(null);
      const client = connect(h.port);

      await expect(waitForConnect(client)).rejects.toMatchObject({
        message: 'Unauthorized',
      });

      expect(h.resolveSession).toHaveBeenCalledTimes(1);
      client.disconnect();
    });

    it('rejects a handshake when the session resolver throws', async () => {
      h.resolveSession.mockRejectedValueOnce(new Error('better-auth blew up'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const client = connect(h.port);

      await expect(waitForConnect(client)).rejects.toMatchObject({
        message: 'Unauthorized',
      });

      expect(warn).toHaveBeenCalled();
      client.disconnect();
      warn.mockRestore();
    });

    it('accepts a handshake when a session resolves and stamps socket.data.userId', async () => {
      h.resolveSession.mockResolvedValueOnce({ userId: 'user_aria' });
      const seenUserIds: string[] = [];
      h.socketHandle.io.on('connection', (socket) => {
        seenUserIds.push(socket.data.userId as string);
      });

      const client = connect(h.port);
      await waitForConnect(client);

      // Allow the server-side `connection` handler to run.
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(seenUserIds).toEqual(['user_aria']);
      client.disconnect();
    });
  });

  describe('board:join / board:leave', () => {
    it('joins board:{boardId} when the resolver returns a viewer+ role', async () => {
      h.resolveSession.mockResolvedValueOnce({ userId: 'user_aria' });
      h.resolveBoardAccess.mockResolvedValueOnce({ role: 'viewer' });

      const client = connect(h.port);
      await waitForConnect(client);

      const ack = await emitWithAck(client, 'board:join', { boardId: 'board_1' });
      expect(ack).toEqual({ ok: true });
      expect(h.resolveBoardAccess).toHaveBeenCalledWith('board_1', 'user_aria');

      // Verify the socket is actually a member of the board room.
      const sockets = await h.socketHandle.io.in(roomName('board', 'board_1')).fetchSockets();
      expect(sockets).toHaveLength(1);

      client.disconnect();
    });

    it('accepts a board:join for any non-null role (including admin/member)', async () => {
      h.resolveSession.mockResolvedValueOnce({ userId: 'user_aria' });
      h.resolveBoardAccess.mockResolvedValueOnce({ role: 'admin' });

      const client = connect(h.port);
      await waitForConnect(client);

      const ack = await emitWithAck(client, 'board:join', { boardId: 'board_admin' });
      expect(ack).toEqual({ ok: true });
      client.disconnect();
    });

    it('rejects board:join with Forbidden when the resolver returns null', async () => {
      h.resolveSession.mockResolvedValueOnce({ userId: 'user_aria' });
      h.resolveBoardAccess.mockResolvedValueOnce(null);

      const client = connect(h.port);
      await waitForConnect(client);

      const ack = await emitWithAck(client, 'board:join', { boardId: 'board_locked' });
      expect(ack).toEqual({ ok: false, error: 'Forbidden' });

      const sockets = await h.socketHandle.io.in(roomName('board', 'board_locked')).fetchSockets();
      expect(sockets).toHaveLength(0);

      client.disconnect();
    });

    it('rejects board:join with Forbidden when the resolver throws', async () => {
      h.resolveSession.mockResolvedValueOnce({ userId: 'user_aria' });
      h.resolveBoardAccess.mockRejectedValueOnce(new Error('db down'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const client = connect(h.port);
      await waitForConnect(client);

      const ack = await emitWithAck(client, 'board:join', { boardId: 'board_x' });
      expect(ack).toEqual({ ok: false, error: 'Forbidden' });
      expect(warn).toHaveBeenCalled();

      client.disconnect();
      warn.mockRestore();
    });

    it('acks BadRequest when board:join payload has no boardId', async () => {
      h.resolveSession.mockResolvedValueOnce({ userId: 'user_aria' });

      const client = connect(h.port);
      await waitForConnect(client);

      const ack = await emitWithAck(client, 'board:join', { boardId: '' });
      expect(ack).toEqual({ ok: false, error: 'BadRequest' });
      expect(h.resolveBoardAccess).not.toHaveBeenCalled();

      client.disconnect();
    });

    it('board:leave removes the socket from the room', async () => {
      h.resolveSession.mockResolvedValueOnce({ userId: 'user_aria' });
      h.resolveBoardAccess.mockResolvedValueOnce({ role: 'member' });

      const client = connect(h.port);
      await waitForConnect(client);

      await emitWithAck(client, 'board:join', { boardId: 'board_leavable' });
      let sockets = await h.socketHandle.io
        .in(roomName('board', 'board_leavable'))
        .fetchSockets();
      expect(sockets).toHaveLength(1);

      const leaveAck = await emitWithAck(client, 'board:leave', { boardId: 'board_leavable' });
      expect(leaveAck).toEqual({ ok: true });

      sockets = await h.socketHandle.io
        .in(roomName('board', 'board_leavable'))
        .fetchSockets();
      expect(sockets).toHaveLength(0);

      client.disconnect();
    });
  });

  describe('auto user:{userId} join', () => {
    it('places every authenticated socket into user:{userId} on connect', async () => {
      h.resolveSession.mockResolvedValueOnce({ userId: 'user_aria' });
      const client = connect(h.port);
      await waitForConnect(client);

      // Give the server a tick to run the connection handler.
      await new Promise((resolve) => setTimeout(resolve, 10));

      const sockets = await h.socketHandle.io
        .in(roomName('user', 'user_aria'))
        .fetchSockets();
      expect(sockets).toHaveLength(1);

      client.disconnect();
    });
  });

  describe('emit helpers', () => {
    it('emitToUser reaches only sockets in user:{userId}', async () => {
      h.resolveSession.mockResolvedValueOnce({ userId: 'user_aria' });
      h.resolveSession.mockResolvedValueOnce({ userId: 'user_dmitri' });

      const aria = connect(h.port);
      await waitForConnect(aria);

      const dmitri = connect(h.port);
      await waitForConnect(dmitri);

      const ariaInbox: unknown[] = [];
      const dmitriInbox: unknown[] = [];
      aria.on(REALTIME_EVENT_CHANNEL, (ev) => ariaInbox.push(ev));
      dmitri.on(REALTIME_EVENT_CHANNEL, (ev) => dmitriInbox.push(ev));

      // Give both sockets a tick to land in their personal rooms.
      await new Promise((resolve) => setTimeout(resolve, 20));

      const envelope = {
        id: 'evt_1',
        type: 'board.updated',
        workspaceId: 'ws_1',
        boardId: 'board_x',
        actorUserId: 'user_dmitri',
        seq: 7,
        payload: { title: 'New' },
        createdAt: new Date().toISOString(),
      };
      h.socketHandle.realtime.emitToUser('user_aria', envelope);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(ariaInbox).toEqual([envelope]);
      expect(dmitriInbox).toEqual([]);

      aria.disconnect();
      dmitri.disconnect();
    });

    it('emitToBoard reaches only sockets joined to board:{boardId}', async () => {
      h.resolveSession.mockResolvedValueOnce({ userId: 'user_aria' });
      h.resolveSession.mockResolvedValueOnce({ userId: 'user_dmitri' });
      h.resolveBoardAccess
        .mockResolvedValueOnce({ role: 'member' }) // aria joins
        .mockResolvedValueOnce(null);              // dmitri rejected

      const aria = connect(h.port);
      await waitForConnect(aria);
      const dmitri = connect(h.port);
      await waitForConnect(dmitri);

      const ariaInbox: unknown[] = [];
      const dmitriInbox: unknown[] = [];
      aria.on(REALTIME_EVENT_CHANNEL, (ev) => ariaInbox.push(ev));
      dmitri.on(REALTIME_EVENT_CHANNEL, (ev) => dmitriInbox.push(ev));

      const ariaJoin = await emitWithAck(aria, 'board:join', { boardId: 'board_shared' });
      expect(ariaJoin).toEqual({ ok: true });
      const dmitriJoin = await emitWithAck(dmitri, 'board:join', { boardId: 'board_shared' });
      expect(dmitriJoin).toEqual({ ok: false, error: 'Forbidden' });

      const envelope = {
        id: 'evt_2',
        type: 'card.moved',
        workspaceId: 'ws_1',
        boardId: 'board_shared',
        actorUserId: 'user_aria',
        seq: 12,
        payload: { cardId: 'c1' },
        createdAt: new Date().toISOString(),
      };
      h.socketHandle.realtime.emitToBoard('board_shared', envelope);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(ariaInbox).toEqual([envelope]);
      expect(dmitriInbox).toEqual([]);

      aria.disconnect();
      dmitri.disconnect();
    });
  });
});

/** `socket.io-client` v4 supports ack callbacks; wrap them in a Promise for tests. */
function emitWithAck<TPayload, TAck>(
  client: ClientSocket,
  event: string,
  payload: TPayload,
): Promise<TAck> {
  return new Promise<TAck>((resolve) => {
    client.emit(event, payload, (res: TAck) => resolve(res));
  });
}
