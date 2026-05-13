import { serve } from '@hono/node-server';
import { app, setRealtimeEmit } from './app';
import { closeCompactionQueue } from './compaction-queue';
import { env } from './env';
import {
  setupSocketServer,
  type AttachableHttpServer,
  type SocketServerHandle,
} from './socket';

const server = serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.warn(`[api] listening on http://localhost:${info.port}  (NODE_ENV=${env.NODE_ENV})`);
});

// Faz 5A (DEM-83) — attach Socket.IO to the same HTTP server. Mount runs after
// `listen()` so the upgrade handler can register; `setRealtimeEmit` makes the
// emit helpers reachable from the tRPC context (`buildTrpcContext`).
// `@hono/node-server` returns the union `ServerType` (`http.Server | Http2*`)
// — narrow it to the union Socket.IO actually accepts.
let socketHandle: SocketServerHandle | undefined;
void setupSocketServer(server as unknown as AttachableHttpServer)
  .then((handle) => {
    socketHandle = handle;
    setRealtimeEmit(handle.realtime);
    console.warn('[api] socket.io attached (transport=websocket, redis-adapter=on)');
  })
  .catch((err) => {
    console.error(
      '[api] failed to attach socket.io:',
      err instanceof Error ? err.message : String(err),
    );
  });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.warn(`[api] ${signal} received — shutting down`);
    server.close(() => {
      void (async () => {
        if (socketHandle) await socketHandle.close().catch(() => {});
        await closeCompactionQueue().catch(() => {});
        process.exit(0);
      })();
    });
  });
}
