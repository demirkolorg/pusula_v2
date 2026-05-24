/**
 * Faz 13I ([DEM-265](https://linear.app/demirkol/issue/DEM-265)) — rapor
 * render → Socket.IO bridge.
 *
 * `apps/worker` `report-render` job, PDF üretimi tamamlanınca (veya kalıcı
 * fail) `pusula:report:render` Redis channel'ına bir `ReportRenderMessage`
 * basar. Bu bridge `apps/api` içinde çalışır, mesajı dinler ve
 * `user:{triggeredBy}` room'una `report.render.completed` veya
 * `report.render.failed` event'i emit eder.
 *
 * Pattern: Faz 5B `realtime-bridge.ts` + 13E `report-invalidated-bridge.ts`
 * ile birebir simetrik (`.local` cross-node duplicate emit'i engeller).
 *
 * Neden user room (workspace değil)? Render kullanıcı-spesifik tetiklenir
 * (`report_renders.triggered_by`); kullanıcı yalnız kendi tetiklediği
 * render'ın completion'ını görmek ister. Workspace-wide leak (örn. başka
 * bir admin'in render'ı) UX gürültüsü + minimal bilgi sızıntısı (render
 * varlığı/zamanlaması). Spec §16.8 "Socket: 'report.render.completed'
 * { renderId, signedUrl (1sa) }" → triggeredBy room.
 */
import type { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import { roomName } from '@pusula/domain';

export const REPORT_RENDER_CHANNEL = 'pusula:report:render';
export const REPORT_RENDER_SOCKET_EVENT_COMPLETED = 'report.render.completed';
export const REPORT_RENDER_SOCKET_EVENT_FAILED = 'report.render.failed';

/** Wire-format — worker `report-render.ts` `ReportRenderMessage` ile uyumlu. */
interface ReportRenderMessage {
  event: {
    type: 'report.render.completed' | 'report.render.failed';
    renderId: string;
    workspaceId: string;
    userId: string | null;
    s3Key: string | null;
    errorMessage: string | null;
    at: string;
  };
}

export interface ReportRenderBridgeHandle {
  close: () => Promise<void>;
}

export async function attachReportRenderBridge(
  io: Server,
  client: Redis,
): Promise<ReportRenderBridgeHandle> {
  await client.subscribe(REPORT_RENDER_CHANNEL);

  let closed = false;

  const onMessage = (channel: string, raw: string) => {
    if (closed || channel !== REPORT_RENDER_CHANNEL) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn(
        '[api:report-render-bridge] malformed message (json parse):',
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
    if (!isReportRenderMessage(parsed)) {
      console.warn('[api:report-render-bridge] malformed message (shape mismatch)');
      return;
    }
    // `triggeredBy` null ise (W7 fail-secure verifyToken zaten engelliyor,
    // ama defense-in-depth): event'i kim duyacak yok → drop. Worker'ın
    // hâlâ basabileceği tek senaryo: scheduled run trigger (13J ekleyecek)
    // — orada `user:{schedule.created_by}` daha mantıklı; bu fazda
    // schedule path'i yok.
    if (!parsed.event.userId) return;

    const eventName =
      parsed.event.type === 'report.render.completed'
        ? REPORT_RENDER_SOCKET_EVENT_COMPLETED
        : REPORT_RENDER_SOCKET_EVENT_FAILED;

    io.local.to(roomName('user', parsed.event.userId)).emit(eventName, {
      renderId: parsed.event.renderId,
      workspaceId: parsed.event.workspaceId,
      s3Key: parsed.event.s3Key,
      errorMessage: parsed.event.errorMessage,
      at: parsed.event.at,
    });
  };

  client.on('message', onMessage);

  return {
    close: async () => {
      closed = true;
      client.off('message', onMessage);
      await client.unsubscribe(REPORT_RENDER_CHANNEL).catch(() => {});
      await client.quit().catch(() => {});
    },
  };
}

const VALID_EVENT_TYPES = new Set<string>([
  'report.render.completed',
  'report.render.failed',
]);

function isReportRenderMessage(value: unknown): value is ReportRenderMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as { event?: unknown };
  if (!v.event || typeof v.event !== 'object') return false;
  const ev = v.event as {
    type?: unknown;
    renderId?: unknown;
    workspaceId?: unknown;
    userId?: unknown;
    s3Key?: unknown;
    errorMessage?: unknown;
    at?: unknown;
  };
  // Security: untrusted Redis pub/sub channel — kötü niyetli publisher
  // arbitrary string atabilirdi. Whitelist + tip kontrolü zorunlu.
  if (typeof ev.type !== 'string' || !VALID_EVENT_TYPES.has(ev.type)) return false;
  if (typeof ev.renderId !== 'string' || ev.renderId.length === 0) return false;
  if (typeof ev.workspaceId !== 'string' || ev.workspaceId.length === 0) return false;
  if (ev.userId !== null && typeof ev.userId !== 'string') return false;
  if (ev.s3Key !== null && typeof ev.s3Key !== 'string') return false;
  if (ev.errorMessage !== null && typeof ev.errorMessage !== 'string') return false;
  if (typeof ev.at !== 'string') return false;
  return true;
}
