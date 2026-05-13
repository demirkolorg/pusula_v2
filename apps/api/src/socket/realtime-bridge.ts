/**
 * Worker → Socket.IO bridge (Faz 5B — DEM-84).
 *
 * The `apps/worker` `pusula-realtime-publish` processor publishes
 * `RealtimePublishMessage`s (envelope + target rooms) onto the Redis pub/sub
 * channel `pusula:realtime:envelope`. This bridge runs inside `apps/api`,
 * subscribes to that channel, and fans each message out to its locally-
 * connected Socket.IO clients via `io.local.to(room).emit(...)`.
 *
 * Why `.local`? With the Redis adapter mounted, `io.to(room).emit(...)` is
 * cross-node — every API replica would re-broadcast the same envelope, so
 * each client would receive it `N` times (N = replicas). `.local` confines
 * the emit to *this* process's sockets; combined with every replica running
 * its own bridge subscriber, the net delivery is exactly-once per client.
 *
 * The bridge is best-effort: a malformed message is logged + skipped (we never
 * trust a Redis payload blindly), and a Redis disconnect is just a transient
 * outage — the sweeper in `apps/worker` will re-publish stale rows once
 * connectivity recovers.
 */
import type { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import { roomName, type RealtimeEventEnvelope } from '@pusula/domain';
import { REALTIME_EVENT_CHANNEL } from './emit';

/** Channel name — must stay in sync with `apps/worker/src/jobs/realtime-publish.ts`. */
export const REALTIME_PUBLISH_CHANNEL = 'pusula:realtime:envelope';

/** Bridge handle the caller holds for graceful shutdown. */
export interface RealtimeBridgeHandle {
  /** Unsubscribe + dispose the Redis client. Idempotent. */
  close: () => Promise<void>;
}

/**
 * Wire the bridge: subscribe `client` to `REALTIME_PUBLISH_CHANNEL` and route
 * every message to `io.local.to(room).emit(REALTIME_EVENT_CHANNEL, envelope)`.
 *
 * The caller owns the `Redis` client and is responsible for connection
 * lifecycle outside of `close()` (which just unsubscribes + quits).
 */
export async function attachRealtimeBridge(
  io: Server,
  client: Redis,
): Promise<RealtimeBridgeHandle> {
  await client.subscribe(REALTIME_PUBLISH_CHANNEL);

  const onMessage = (channel: string, raw: string) => {
    if (channel !== REALTIME_PUBLISH_CHANNEL) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn(
        '[api:realtime-bridge] malformed message (json parse):',
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
    if (!isPublishMessage(parsed)) {
      console.warn('[api:realtime-bridge] malformed message (shape mismatch)');
      return;
    }
    for (const room of parsed.rooms) {
      // `.local` bypasses the Redis adapter's cross-node fan-out — each
      // replica subscribes to the channel itself, so we'd double-deliver
      // otherwise. See the file header.
      io.local.to(roomName(room.kind, room.id)).emit(REALTIME_EVENT_CHANNEL, parsed.envelope);
    }
  };

  client.on('message', onMessage);

  return {
    close: async () => {
      client.off('message', onMessage);
      await client.unsubscribe(REALTIME_PUBLISH_CHANNEL).catch(() => {});
      await client.quit().catch(() => {});
    },
  };
}

interface PublishMessage {
  envelope: RealtimeEventEnvelope;
  rooms: Array<{ kind: 'board' | 'user'; id: string }>;
}

function isPublishMessage(value: unknown): value is PublishMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as { envelope?: unknown; rooms?: unknown };
  if (!v.envelope || typeof v.envelope !== 'object') return false;
  const env = v.envelope as { id?: unknown; type?: unknown };
  if (typeof env.id !== 'string' || typeof env.type !== 'string') return false;
  if (!Array.isArray(v.rooms) || v.rooms.length === 0) return false;
  for (const r of v.rooms) {
    if (!r || typeof r !== 'object') return false;
    const room = r as { kind?: unknown; id?: unknown };
    if (room.kind !== 'board' && room.kind !== 'user') return false;
    if (typeof room.id !== 'string') return false;
  }
  return true;
}
