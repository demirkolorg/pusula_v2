import { timingSafeEqual } from 'node:crypto';
import type { Context as HonoContext } from 'hono';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { createContext, type Context } from '@pusula/api';
import { getRealtimeEmit } from './app';
import { env } from './env';
import { enqueueAttachmentCleanup } from './attachment-cleanup-queue';
import { auth } from './auth';
import { enqueueCompaction } from './compaction-queue';
import { enqueueNotificationPublish } from './notification-queue';
import { resolveObjectStorage } from './object-storage';
import { enqueueRealtimePublish } from './realtime-publish-queue';
import { reportCache } from './report-cache';
import { enqueueReportRender } from './report-render-queue';

/** Builds the tRPC request context from a Hono request, resolving the Better Auth session. */
export async function buildTrpcContext(
  _opts: FetchCreateContextFnOptions,
  c: HonoContext,
): Promise<Context> {
  const headers = c.req.raw.headers;
  const sessionData = await auth.api.getSession({ headers });

  // Faz 13I (DEM-265) — Worker `report.print.requestToken` çağrısı için
  // `x-worker-secret` header doğrulaması. `timingSafeEqual` ile sabit-süreli
  // compare; length mismatch → erken `false` (timingSafeEqual aksi halde
  // throw eder). Eşleşmezse ctx `workerSharedSecret` undefined kalır →
  // procedure UNAUTHORIZED.
  const workerHeader = c.req.header('x-worker-secret');
  const workerSharedSecret = (() => {
    if (!workerHeader || !env.WORKER_SHARED_SECRET) return undefined;
    const expected = Buffer.from(env.WORKER_SHARED_SECRET, 'utf8');
    const actual = Buffer.from(workerHeader, 'utf8');
    if (actual.length !== expected.length) return undefined;
    return timingSafeEqual(actual, expected) ? env.WORKER_SHARED_SECRET : undefined;
  })();

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
    // Faz 13E (DEM-261) — Redis-backed rapor dataset cache; `report.preview`
    // procedure'ü cache wrapper'dan geçer (cache miss → render → cache write).
    // NoOp fallback `noOpReportCache` zaten ctx.reportCache undefined olduğunda
    // procedure içinde devreye girer; burada Redis instance'ı explicit veriyoruz.
    reportCache,
    // Faz 13I (DEM-265) — rapor render queue producer (PDF export). Best-
    // effort; Redis blip durumunda `report_renders` row 'queued' kalır
    // (operator manuel re-enqueue ile alabilir, 13P retention worker'ı
    // ileride eski 'queued' satırları sweeper edebilir).
    enqueueReportRender,
    // Faz 13I (DEM-265) — worker → print akışı için paylaşılan secret.
    // Yukarıda `x-worker-secret` header'ı `env.WORKER_SHARED_SECRET` ile
    // eşleşirse set edilir; eşleşmezse undefined → procedure UNAUTHORIZED.
    workerSharedSecret,
  });
}
