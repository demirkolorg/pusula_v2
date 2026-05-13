/**
 * Socket.IO module — public API surface for `apps/api` (Faz 5A — DEM-83).
 *
 * Production wiring: `setupSocketServer(httpServer)` binds the factory to
 * the real Better Auth session resolver, `@pusula/api`'s `resolveBoardAccess`,
 * and a fresh pair of `ioredis` connections for `@socket.io/redis-adapter`
 * (BullMQ shares the URL but not the client instance — the adapter needs its
 * own pub/sub pair). Tests construct `createSocketServer` directly with stub
 * resolvers and no Redis adapter.
 */
import { Redis } from 'ioredis';
import { resolveBoardAccess } from '@pusula/api';
import { getDb } from '@pusula/db';
import { auth } from '../auth';
import { env } from '../env';
import {
  createSocketServer,
  type AttachableHttpServer,
  type SocketServerHandle,
} from './server';

export type { SocketServerHandle, AttachableHttpServer } from './server';
export { REALTIME_EVENT_CHANNEL } from './emit';
export { roomName } from '@pusula/domain';

/**
 * Boot the Socket.IO server with production dependencies. Called once from
 * `apps/api/src/index.ts` after the HTTP server is listening; the returned
 * handle is held for graceful shutdown.
 */
export function setupSocketServer(httpServer: AttachableHttpServer): Promise<SocketServerHandle> {
  return createSocketServer({
    httpServer,
    corsOrigin: env.APP_URL,
    resolveSession: async (headers) => {
      const sessionData = await auth.api.getSession({ headers });
      if (!sessionData) return null;
      return { userId: sessionData.user.id };
    },
    resolveBoardAccess: async (boardId, userId) => {
      try {
        const access = await resolveBoardAccess(getDb(), boardId, userId);
        // Archived boards reject the join (Karar 2026-05-13(c) in
        // `02-teknoloji-kararlari.md`; `03-backend.md` "Yetki & arşiv"). The
        // archived state isn't fatal — the existing tRPC `board.get` still
        // returns the read-only payload — but real-time fan-out stops at the
        // archive boundary.
        if (access.archivedAt) return null;
        return { role: access.role };
      } catch {
        // `resolveBoardAccess` throws `TRPCError` on NOT_FOUND/FORBIDDEN —
        // for the socket join we just need null/non-null.
        return null;
      }
    },
    createRedisAdapterClients: () => {
      // The Redis adapter needs its *own* pub/sub pair — BullMQ's
      // `maxRetriesPerRequest: null` connection is dedicated to its blocking
      // commands and shouldn't be reused for pub/sub.
      const pub = new Redis(env.REDIS_URL, { lazyConnect: false });
      const sub = pub.duplicate();
      pub.on('error', (err) => {
        console.error('[api:socket] redis adapter pub error:', err.message);
      });
      sub.on('error', (err) => {
        console.error('[api:socket] redis adapter sub error:', err.message);
      });
      return { pub, sub };
    },
  });
}
