import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import * as Sentry from '@sentry/node';
import { appRouter, type RealtimeEmit } from '@pusula/api';
import { auth } from './auth';
import { env } from './env';
import { shareRoute } from './routes/share';
import { buildTrpcContext } from './trpc';

/**
 * Faz 5A (DEM-83) — the Socket.IO server is attached *after* the HTTP server
 * starts listening (it needs the `Server` handle from `@hono/node-server`).
 * Once it's up, `index.ts` calls `setRealtimeEmit` and
 * `markApiStartupReady()`. Until then `/health` stays non-ready and direct
 * `app.fetch` tests keep `ctx.realtime` undefined.
 */
let realtimeEmit: RealtimeEmit | undefined;
export function setRealtimeEmit(emit: RealtimeEmit | undefined): void {
  realtimeEmit = emit;
}
export function getRealtimeEmit(): RealtimeEmit | undefined {
  return realtimeEmit;
}

type ApiStartupStatus = 'starting' | 'ready' | 'failed';

interface ApiReadiness {
  status: ApiStartupStatus;
  realtime: ApiStartupStatus;
  error?: string;
}

let readiness: ApiReadiness = { status: 'starting', realtime: 'starting' };

export function markApiStartupReady(): void {
  readiness = { status: 'ready', realtime: 'ready' };
}

export function markApiStartupFailed(error: string): void {
  readiness = { status: 'failed', realtime: 'failed', error };
}

export function resetApiReadinessForTests(): void {
  readiness = { status: 'starting', realtime: 'starting' };
  realtimeEmit = undefined;
}

const TRPC_ENDPOINT = '/trpc';

export const app = new Hono();

// --- HTTP concerns (architecture doc §4): request id, logging, CORS ---
app.use('*', requestId());
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: env.APP_URL,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

// --- Liveness / readiness ---
app.get('/', (c) => c.json({ name: 'pusula-api', ok: true }));
app.get('/health', (c) => {
  const ok = readiness.status === 'ready' && readiness.realtime === 'ready';
  const body = {
    ok,
    status: readiness.status,
    realtime: readiness.realtime,
    ...(readiness.error ? { error: readiness.error } : {}),
    ts: new Date().toISOString(),
  };
  return c.json(body, ok ? 200 : 503);
});

// --- Public share endpoint (Faz 9C — DEM-129): misafir kart görüntüleme +
// anonim yorum. tRPC dışı; rate-limited + Cache-Control no-store. CORS web
// origin (üstte set edildi) + paydaşın kendi mail/uygulamasından açabilmesi
// için `origin: '*'` opsiyonu V2 için bırakıldı. ---
app.route('/share', shareRoute);

// --- Better Auth: owns /api/auth/* (sign-up / sign-in / session / ...) ---
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// --- tRPC: the shared web/mobile API contract ---
app.all(`${TRPC_ENDPOINT}/*`, (c) =>
  fetchRequestHandler({
    endpoint: TRPC_ENDPOINT,
    req: c.req.raw,
    router: appRouter,
    createContext: (opts) => buildTrpcContext(opts, c),
    // §10.5.1 — yalnız beklenmeyen sunucu hatalarını Sentry'ye gönder.
    // Permission/validation reddi (`UNAUTHORIZED`, `FORBIDDEN`, `BAD_REQUEST`…)
    // beklenen akıştır; gürültü olarak raporlanmaz.
    onError: ({ error, path }) => {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        Sentry.captureException(error.cause ?? error, {
          tags: { trpcPath: path ?? '<unknown>' },
        });
      }
    },
  }),
);

// --- Hata sınırı: tRPC dışı route'larda (share, auth, health) yakalanmayan
// hatalar. 5xx beklenmeyen hatalar Sentry'ye gider; 4xx `HTTPException`'lar
// beklenen akıştır (§10.5.1). ---
app.onError((err, c) => {
  const isClientError = err instanceof HTTPException && err.status < 500;
  if (!isClientError) {
    Sentry.captureException(err);
    console.error('[api] unhandled error:', err);
  }
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  return c.json({ error: 'Internal Server Error' }, 500);
});

export type AppType = typeof app;
