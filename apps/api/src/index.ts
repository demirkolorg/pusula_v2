import { serve } from '@hono/node-server';
import { app } from './app';
import { closeCompactionQueue } from './compaction-queue';
import { env } from './env';

const server = serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.warn(`[api] listening on http://localhost:${info.port}  (NODE_ENV=${env.NODE_ENV})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.warn(`[api] ${signal} received — shutting down`);
    server.close(() => {
      void closeCompactionQueue().finally(() => process.exit(0));
    });
  });
}
