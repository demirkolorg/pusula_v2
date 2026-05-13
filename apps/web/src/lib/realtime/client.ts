/**
 * Socket.IO client singleton — Phase 5C (DEM-85).
 *
 * One `io()` instance for the whole web tab, lazily constructed on first call
 * (`getRealtimeSocket`) so SSR / route prefetch doesn't open a WebSocket. The
 * connection itself stays manual — `autoConnect: false`; `useBoardRealtime`
 * calls `socket.connect()` when a board page mounts. Reconnect is handled by
 * Socket.IO's defaults (exponential backoff, infinite retries) — the hook
 * registers a `connect` listener so it can re-emit `board:join` + invalidate
 * the board cache when the link comes back.
 *
 *   • Same origin as the tRPC client (`env.NEXT_PUBLIC_API_URL`) → Better Auth
 *     session cookie flows in on the WebSocket upgrade handshake.
 *   • Transport pinned to WebSocket (no long-polling fallback) so Dokploy /
 *     Traefik doesn't need sticky sessions — matches Karar 2026-05-13(b).
 *   • `disconnectRealtimeSocket()` is exported for test teardown / sign-out;
 *     the singleton is rebuilt the next time `getRealtimeSocket()` is called.
 */
'use client';

import { io, type Socket } from 'socket.io-client';
import { env } from '@/env';

/** Single Socket.IO event name the server wraps every `RealtimeEventEnvelope` in. */
export const REALTIME_EVENT_CHANNEL = 'realtime:event';

let socket: Socket | null = null;

export function getRealtimeSocket(): Socket {
  if (socket) return socket;
  socket = io(env.NEXT_PUBLIC_API_URL, {
    withCredentials: true,
    transports: ['websocket'],
    autoConnect: false,
  });
  return socket;
}

/** Drop the active socket (sign-out / test teardown). The next `getRealtimeSocket()` rebuilds. */
export function disconnectRealtimeSocket(): void {
  if (!socket) return;
  socket.disconnect();
  socket = null;
}
