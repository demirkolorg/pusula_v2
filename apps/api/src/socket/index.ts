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
import * as Sentry from '@sentry/node';
import { resolveBoardAccess } from '@pusula/api';
import { getDb } from '@pusula/db';
import { auth } from '../auth';
import { env } from '../env';
import { attachRealtimeBridge, type RealtimeBridgeHandle } from './realtime-bridge';
import { attachNotificationBridge, type NotificationBridgeHandle } from './notification-bridge';
import {
  attachReportInvalidatedBridge,
  type ReportInvalidatedBridgeHandle,
} from './report-invalidated-bridge';
import {
  attachReportRenderBridge,
  type ReportRenderBridgeHandle,
} from './report-render-bridge';
import { createSocketServer, type AttachableHttpServer, type SocketServerHandle } from './server';

export type { SocketServerHandle, AttachableHttpServer } from './server';
export { REALTIME_EVENT_CHANNEL } from './emit';
export { roomName } from '@pusula/domain';

/**
 * Boot the Socket.IO server with production dependencies. Called once from
 * `apps/api/src/index.ts` after the HTTP server is listening; the returned
 * handle is held for graceful shutdown. Faz 5B (DEM-84) also wires the
 * worker → bridge Redis subscriber (`pusula:realtime:envelope`) onto the
 * same `Server` so worker-published envelopes fan out to local sockets via
 * `io.local.to(...)`.
 */
export async function setupSocketServer(httpServer: AttachableHttpServer): Promise<
  SocketServerHandle & {
    realtimeBridge?: RealtimeBridgeHandle;
    notificationBridge?: NotificationBridgeHandle;
    reportInvalidatedBridge?: ReportInvalidatedBridgeHandle;
    reportRenderBridge?: ReportRenderBridgeHandle;
  }
> {
  const handle = await createSocketServer({
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

  // Faz 5B (DEM-84) — bridge worker-published envelopes into local sockets.
  // Best-effort: a Redis blip here is fine, the worker sweeper re-publishes
  // pending rows. A separate client (not the BullMQ one) because BullMQ's
  // `maxRetriesPerRequest: null` doesn't play nicely with `SUBSCRIBE`.
  let realtimeBridge: RealtimeBridgeHandle | undefined;
  // Holding the client outside the try so a failed `attachRealtimeBridge`
  // doesn't leak an open ioredis socket (`lazyConnect: false` opens
  // immediately).
  let bridgeClient: Redis | undefined;
  try {
    bridgeClient = new Redis(env.REDIS_URL, { lazyConnect: false });
    bridgeClient.on('error', (err) => {
      console.error('[api:realtime-bridge] redis error:', err.message);
    });
    realtimeBridge = await attachRealtimeBridge(handle.io, bridgeClient);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:realtime-bridge] failed to attach:', message);
    await bridgeClient?.quit().catch(() => {});
    await handle.close().catch(() => {});
    throw new Error(`realtime bridge failed to attach: ${message}`);
  }

  let notificationBridge: NotificationBridgeHandle | undefined;
  let notificationBridgeClient: Redis | undefined;
  try {
    notificationBridgeClient = new Redis(env.REDIS_URL, { lazyConnect: false });
    notificationBridgeClient.on('error', (err) => {
      console.error('[api:notification-bridge] redis error:', err.message);
    });
    notificationBridge = await attachNotificationBridge(handle.io, notificationBridgeClient);
  } catch (err) {
    console.error(
      '[api:notification-bridge] failed to attach (notification badge pushes will wait for refetch):',
      err instanceof Error ? err.message : String(err),
    );
    Sentry.captureException(err, {
      tags: { component: 'notification-bridge', feature: 'realtime-notifications' },
    });
    await notificationBridgeClient?.quit().catch(() => {});
  }

  // Faz 13E (DEM-261) — rapor cache invalidator → socket bridge. Worker
  // `pusula:report:invalidated` channel'ına basar; bu bridge `workspace:{id}`
  // room'una `report.invalidated` event'i emit eder (13N stale rozeti
  // tetiği). Best-effort: bridge fail olursa stale rozeti gelmeyebilir
  // ama cache TTL ile dataset eninde sonunda fresh olur.
  let reportInvalidatedBridge: ReportInvalidatedBridgeHandle | undefined;
  let reportInvalidatedBridgeClient: Redis | undefined;
  try {
    reportInvalidatedBridgeClient = new Redis(env.REDIS_URL, { lazyConnect: false });
    reportInvalidatedBridgeClient.on('error', (err) => {
      console.error('[api:report-invalidated-bridge] redis error:', err.message);
    });
    reportInvalidatedBridge = await attachReportInvalidatedBridge(
      handle.io,
      reportInvalidatedBridgeClient,
    );
  } catch (err) {
    console.error(
      '[api:report-invalidated-bridge] failed to attach (stale rozeti gecikecek):',
      err instanceof Error ? err.message : String(err),
    );
    // DEM-261 code-review W1 + security LOW-2: bridge fail UX'i sessizce
    // bozar (rapor stale rozeti gelmez); operator görmesin diye Sentry'ye
    // bağla. Cache TTL backstop var (data integrity etkilenmez).
    Sentry.captureException(err, {
      tags: { component: 'report-invalidated-bridge', feature: 'report-stale-rozeti' },
    });
    await reportInvalidatedBridgeClient?.quit().catch(() => {});
  }

  // Faz 13I (DEM-265) — PDF render → socket bridge. Worker
  // `pusula:report:render` channel'ına `report.render.completed` /
  // `report.render.failed` event'i basar; bu bridge `user:{triggeredBy}`
  // room'una emit eder. UI listener `useReportRender` (13J/13K'da)
  // toast + `report.getRender` query invalidate ile signed URL'i alır.
  let reportRenderBridge: ReportRenderBridgeHandle | undefined;
  let reportRenderBridgeClient: Redis | undefined;
  try {
    reportRenderBridgeClient = new Redis(env.REDIS_URL, { lazyConnect: false });
    reportRenderBridgeClient.on('error', (err) => {
      console.error('[api:report-render-bridge] redis error:', err.message);
    });
    reportRenderBridge = await attachReportRenderBridge(handle.io, reportRenderBridgeClient);
  } catch (err) {
    console.error(
      '[api:report-render-bridge] failed to attach (rapor tamamlandı bildirimi gelmeyecek):',
      err instanceof Error ? err.message : String(err),
    );
    // Sentry: bridge fail UX'i sessizce bozar (kullanıcı rapor üretiminin
    // bittiğini görmez). Operator görsün diye Sentry'ye bağla. DB durumu
    // 'completed' kaldığından kullanıcı `report.listRenders` ile manuel
    // refetch yaparak download alabilir.
    Sentry.captureException(err, {
      tags: { component: 'report-render-bridge', feature: 'pdf-render-pipeline' },
    });
    await reportRenderBridgeClient?.quit().catch(() => {});
  }

  const originalClose = handle.close;
  return {
    ...handle,
    realtimeBridge,
    notificationBridge,
    reportInvalidatedBridge,
    reportRenderBridge,
    close: async () => {
      if (realtimeBridge) await realtimeBridge.close();
      if (notificationBridge) await notificationBridge.close();
      if (reportInvalidatedBridge) await reportInvalidatedBridge.close();
      if (reportRenderBridge) await reportRenderBridge.close();
      await originalClose();
    },
  };
}
