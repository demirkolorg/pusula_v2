/**
 * Socket.IO server factory — Faz 5A (DEM-83).
 *
 * Creates the `Server` instance, attaches it to the `@hono/node-server` HTTP
 * handle, wires the Redis pub/sub adapter (so multi-node fan-out works the day
 * a second `apps/api` replica boots — single-instance is fine too, the adapter
 * is a no-op then), and installs the auth + room middleware/handlers.
 *
 * Transport is WebSocket-only (`transports: ['websocket']`): no long-polling
 * fallback → no sticky-session requirement (Karar 2026-05-13, `02-teknoloji-kararlari.md`).
 *
 * Dependencies are injected (`resolveSession`, `resolveBoardAccess`,
 * `redisFactory`) so tests can swap in stubs without touching Redis or Better
 * Auth. The production wiring lives in `index.ts` (`setupSocketServer`).
 */
import type { Server as HttpServer } from 'node:http';
import type { Http2SecureServer, Http2Server } from 'node:http2';
import { Server } from 'socket.io';
import type { Redis } from 'ioredis';

/**
 * Anything `@hono/node-server`'s `serve()` may return: plain HTTP, HTTPS, or
 * an HTTP/2 variant. Socket.IO's `attach` accepts all of them at runtime; the
 * union exists so TS doesn't trip on the upstream `ServerType` (which is a
 * structural superset of just `http.Server`).
 */
export type AttachableHttpServer = HttpServer | Http2Server | Http2SecureServer;
import { createSocketAuthMiddleware, type SocketSessionResolver } from './auth';
import { attachConnectionHandler, type BoardAccessResolver } from './rooms';
import { createRealtimeEmit } from './emit';
import type { RealtimeEmit } from '@pusula/api';

/** Factory dependencies — keeps the unit boundary clean for the socket tests. */
export interface CreateSocketServerOptions {
  httpServer: AttachableHttpServer;
  /** CORS origin (the web app's URL — `env.APP_URL` in production wiring). */
  corsOrigin: string;
  /** Resolves the WebSocket handshake → session (Better Auth in production). */
  resolveSession: SocketSessionResolver;
  /** Resolves a (boardId, userId) → effective board role (null = no access). */
  resolveBoardAccess: BoardAccessResolver;
  /**
   * Optional Redis adapter factory: when supplied, returns `{ pub, sub }` —
   * two `ioredis` clients used by `@socket.io/redis-adapter` for cross-node
   * pub/sub. Omit in tests → in-memory adapter (Socket.IO default), which is
   * perfectly fine for single-process suites.
   */
  createRedisAdapterClients?: () =>
    | Promise<{ pub: Redis; sub: Redis }>
    | { pub: Redis; sub: Redis };
}

/** The result of building the socket server — the host owns disposal. */
export interface SocketServerHandle {
  io: Server;
  realtime: RealtimeEmit;
  /** Graceful shutdown: closes the Socket.IO server (drops all clients) and disposes the Redis adapter clients if any. */
  close: () => Promise<void>;
}

/**
 * Build a Socket.IO server. Synchronous setup of the auth/room handlers; the
 * Redis adapter attaches asynchronously when `createRedisAdapterClients` is
 * supplied (the returned promise resolves once the adapter is mounted). The
 * returned handle is usable as soon as it resolves.
 */
export async function createSocketServer(
  opts: CreateSocketServerOptions,
): Promise<SocketServerHandle> {
  const io = new Server(opts.httpServer, {
    cors: {
      origin: opts.corsOrigin,
      credentials: true,
    },
    // Faz 5: WebSocket-only — no long-polling fallback (no sticky-session need).
    transports: ['websocket'],
  });

  io.use(createSocketAuthMiddleware(opts.resolveSession));
  attachConnectionHandler(io, opts.resolveBoardAccess);

  let redisClients: { pub: Redis; sub: Redis } | undefined;
  if (opts.createRedisAdapterClients) {
    // Lazy import so the adapter dep doesn't get pulled in tests that don't
    // supply Redis clients (and keeps `socket.io` test setup lean).
    const [{ createAdapter }, factoryResult] = await Promise.all([
      import('@socket.io/redis-adapter'),
      Promise.resolve(opts.createRedisAdapterClients()),
    ]);
    redisClients = factoryResult;
    try {
      io.adapter(createAdapter(redisClients.pub, redisClients.sub));
    } catch (adapterErr) {
      // Mount failed → the pub/sub pair never made it onto `io`, so the
      // `close()` closure below can't reach them. Reclaim here before
      // rethrowing so the boot sequence doesn't leak two ioredis sockets.
      await redisClients.pub.quit().catch(() => {});
      await redisClients.sub.quit().catch(() => {});
      throw adapterErr;
    }
  }

  const realtime = createRealtimeEmit(io);

  return {
    io,
    realtime,
    close: async () => {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (redisClients) {
        await redisClients.pub.quit().catch(() => {});
        await redisClients.sub.quit().catch(() => {});
      }
    },
  };
}
