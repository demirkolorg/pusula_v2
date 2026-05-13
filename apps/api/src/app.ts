import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, type RealtimeEmit } from '@pusula/api';
import { auth } from './auth';
import { env } from './env';
import { buildTrpcContext } from './trpc';

/**
 * Faz 5A (DEM-83) — the Socket.IO server is attached *after* the HTTP server
 * starts listening (it needs the `Server` handle from `@hono/node-server`).
 * Once it's up, `index.ts` calls `setRealtimeEmit` and from then on every
 * tRPC request picks the helpers up through `getRealtimeEmit()` inside
 * `buildTrpcContext`. Until then (and in unit tests that drive `app.fetch`
 * directly), `ctx.realtime` stays `undefined` and emits are a no-op.
 */
let realtimeEmit: RealtimeEmit | undefined;
export function setRealtimeEmit(emit: RealtimeEmit | undefined): void {
  realtimeEmit = emit;
}
export function getRealtimeEmit(): RealtimeEmit | undefined {
  return realtimeEmit;
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
app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

// --- Better Auth: owns /api/auth/* (sign-up / sign-in / session / ...) ---
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// --- tRPC: the shared web/mobile API contract ---
app.all(`${TRPC_ENDPOINT}/*`, (c) =>
  fetchRequestHandler({
    endpoint: TRPC_ENDPOINT,
    req: c.req.raw,
    router: appRouter,
    createContext: (opts) => buildTrpcContext(opts, c),
  }),
);

export type AppType = typeof app;
