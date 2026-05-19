import type { Context as HonoContext } from 'hono';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { createContext, type Context } from '@pusula/api';
import { getRealtimeEmit } from './app';
import { enqueueAttachmentCleanup } from './attachment-cleanup-queue';
import { auth } from './auth';
import { enqueueCompaction } from './compaction-queue';
import { enqueueNotificationPublish } from './notification-queue';
import { resolveObjectStorage } from './object-storage';
import { enqueueRealtimePublish } from './realtime-publish-queue';

/** Builds the tRPC request context from a Hono request, resolving the Better Auth session. */
export async function buildTrpcContext(
  _opts: FetchCreateContextFnOptions,
  c: HonoContext,
): Promise<Context> {
  const headers = c.req.raw.headers;
  const sessionData = await auth.api.getSession({ headers });

  return createContext({
    session: sessionData
      ? {
          user: {
            id: sessionData.user.id,
            email: sessionData.user.email,
            name: sessionData.user.name,
            image: sessionData.user.image ?? null,
          },
          sessionId: sessionData.session.id,
        }
      : null,
    requestId: c.get('requestId') as string | undefined,
    ip: c.req.header('x-forwarded-for') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
    // Best-effort background position compaction (Faz 3C — DEM-44).
    enqueueCompaction,
    // Best-effort realtime emit (Faz 5A — DEM-83). `undefined` until the
    // Socket.IO server finishes attaching (`apps/api/src/index.ts` calls
    // `setRealtimeEmit` once `setupSocketServer` resolves).
    realtime: getRealtimeEmit(),
    // Best-effort realtime outbox enqueue (Faz 5B — DEM-84). The sweeper in
    // `apps/worker` picks up rows the enqueue missed, so a Redis blip never
    // drops an event — it just delays it by ≤ 60 s.
    enqueueRealtimePublish,
    // Best-effort notification outbox enqueue (Faz 6A — DEM-90). Same sweeper
    // discipline — a Redis blip just delays delivery, doesn't drop it.
    enqueueNotificationPublish,
    // Best-effort attachment cleanup enqueue (Faz 11C — DEM-149). Called by
    // the `attachment.delete` mutation (Faz 11B / DEM-148) after tx commit.
    // Redis blip leaves a stray MinIO object behind — BullMQ retries (3
    // attempts) cover transient failures; the 60-min orphan sweeper only
    // scans `committed_at IS NULL` drafts, not deleted rows.
    enqueueAttachmentCleanup,
    // İstek-kapsamlı object storage: presigned URL host'u yerel geliştirmede
    // istemcinin API'ye eriştiği `Host`'tan türetilir — mobil cihaz `localhost`
    // yerine erişebildiği LAN IP'yi alır (DEM-215; object-storage.ts §9.1.2).
    objectStorage: resolveObjectStorage(c.req.header('host') ?? undefined),
  });
}
