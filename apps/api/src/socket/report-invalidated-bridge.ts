/**
 * Faz 13E ([DEM-261](https://linear.app/demirkol/issue/DEM-261)) — rapor
 * cache invalidator → Socket.IO bridge.
 *
 * `apps/worker` `report-cache-invalidator` job, cache key'leri sildikten
 * sonra `pusula:report:invalidated` Redis channel'ına bir `ReportInvalidatedMessage`
 * basar. Bu bridge `apps/api` içinde çalışır, mesajı dinler ve
 * `workspace:{id}` room'una `report.invalidated` event'i emit eder. 13N
 * (`useReportStale`) web hook'u bu event'i dinleyip `<StaleBadge/>`'i
 * tetikler.
 *
 * Pattern: Faz 5B `realtime-bridge.ts` ile birebir simetrik (`.local`
 * cross-node duplicate emit'i engeller).
 */
import type { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import { roomName } from '@pusula/domain';
import {
  REPORT_INVALIDATED_CHANNEL,
  REPORT_INVALIDATED_SOCKET_EVENT,
  type ReportInvalidatedMessage,
} from '@pusula/api/lib/report-invalidation';

export interface ReportInvalidatedBridgeHandle {
  close: () => Promise<void>;
}

export async function attachReportInvalidatedBridge(
  io: Server,
  client: Redis,
): Promise<ReportInvalidatedBridgeHandle> {
  await client.subscribe(REPORT_INVALIDATED_CHANNEL);

  // DEM-261 code-review W2: shutdown race — in-flight message callback'i
  // io.local emit ederken socket.io kapandıysa sessiz drop.
  let closed = false;

  const onMessage = (channel: string, raw: string) => {
    if (closed || channel !== REPORT_INVALIDATED_CHANNEL) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn(
        '[api:report-invalidated-bridge] malformed message (json parse):',
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
    if (!isReportInvalidatedMessage(parsed)) {
      console.warn('[api:report-invalidated-bridge] malformed message (shape mismatch)');
      return;
    }
    // `.local` cross-node duplicate emit engeli — her API replica kendi
    // bridge'iyle channel'a abone; `io.local` sadece lokal socket'lara
    // basar (5B realtime-bridge ile aynı pattern).
    io.local
      .to(roomName(parsed.room.kind, parsed.room.id))
      .emit(REPORT_INVALIDATED_SOCKET_EVENT, parsed.event);
  };

  client.on('message', onMessage);

  return {
    close: async () => {
      closed = true;
      client.off('message', onMessage);
      await client.unsubscribe(REPORT_INVALIDATED_CHANNEL).catch(() => {});
      await client.quit().catch(() => {});
    },
  };
}

const VALID_SCOPE_KINDS = new Set(['card', 'list', 'board', 'workspace']);

function isReportInvalidatedMessage(value: unknown): value is ReportInvalidatedMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as { event?: unknown; room?: unknown };
  if (!v.event || typeof v.event !== 'object') return false;
  const ev = v.event as {
    at?: unknown;
    scopeKinds?: unknown;
    workspaceId?: unknown;
    eventType?: unknown;
  };
  if (typeof ev.at !== 'string' || typeof ev.workspaceId !== 'string') return false;
  if (typeof ev.eventType !== 'string') return false;
  if (!Array.isArray(ev.scopeKinds)) return false;
  // DEM-261 security MED-2: scopeKinds enum whitelist (untrusted Redis
  // pub/sub channel — malicious publisher arbitrary string basabilirdi).
  for (const k of ev.scopeKinds) {
    if (typeof k !== 'string' || !VALID_SCOPE_KINDS.has(k)) return false;
  }
  if (!v.room || typeof v.room !== 'object') return false;
  const room = v.room as { kind?: unknown; id?: unknown };
  if (room.kind !== 'workspace' || typeof room.id !== 'string') return false;
  // DEM-261 security MED-2: room.id workspaceId ile eşit olmalı —
  // saldırgan room=A workspaceId=B basarak çapraz workspace metadata
  // sızdıramasın. Spec'te `room` zaten workspace event'in workspaceId'sine
  // bound; uyumsuzluk anomalidir.
  if (room.id !== ev.workspaceId) return false;
  return true;
}
