/**
 * Faz 13T (DEM-276) follow-up 2026-06-01 — global rapor render socket
 * listener'ı. `useReportListRealtime` (raporlar sayfasına özel) sayfa
 * dışındayken event'i yakalayamıyordu; kullanıcı PDF/XLSX export başlatıp
 * başka sekmeye geçince hazır olduğunu hiç görmüyordu (bkz. post-mortem
 * memory `pdf-render-postmortem-2026-06-01`).
 *
 * Bu hook `apps/web/src/app/(app)/_components/app-shell.tsx`'de bir kez
 * çağrılır; (app) layout'unun altındaki tüm sayfalar için aktif. Event
 * geldiğinde:
 *
 *   1. `report.getRender` query'sini imperative `queryClient.fetchQuery`
 *      ile çek — asset listesi + presigned `downloadUrl` döner.
 *   2. Ana asset'i (render row format'ıyla eşleşen) bul → anchor click
 *      ile otomatik indir (browser PDF için inline veya download dialog
 *      gösterir, XLSX için doğrudan dosyaya kaydeder).
 *   3. Persistent toast — "Rapor hazır" + "Aç" aksiyon butonu. Auto-
 *      download başarısız olursa kullanıcı manuel olarak buradan açabilir.
 *
 * Failed event'inde sadece error toast. Toast'lar `@pusula/ui` `toast`
 * (Sonner sarmalı) ile.
 *
 * `useReportListRealtime` mevcut raporlar sayfasında `listRenders`
 * invalidate'i için duruyor — bu hook ek olarak global feedback verir,
 * `debouncedInvalidate` ile çakışmaz.
 */
'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@pusula/ui';
import { useSession } from '@/lib/auth-client';
import { useTRPC } from '@/trpc/client';
import { getRealtimeSocket } from './client';

const EVENT_COMPLETED = 'report.render.completed';
const EVENT_FAILED = 'report.render.failed';

interface ReportRenderEventPayload {
  renderId: string;
  workspaceId: string;
  s3Key: string | null;
  errorMessage: string | null;
  at: string;
}

/**
 * `report.getRender` cevabındaki asset shape — `downloadUrl` server-side
 * üretilmiş presigned GET URL'i (`bucket: asset.s3Bucket` ile doğru
 * bucket'a işaret eder; DEM-276 7ac0054 fix).
 */
interface AssetWithUrl {
  format: 'pdf' | 'xlsx' | 'png' | 'svg';
  downloadUrl: string | null;
}

/**
 * Anchor click ile auto-download. Browser bazı format'larda (PDF) yeni
 * sekme açıp inline gösterebilir; `download` attr ile zorla indirme
 * dialog'una düşürmek mümkün ama cross-origin presigned URL'lerinde
 * `download` çoğu zaman browser tarafından yok sayılır. Pragmatik:
 * varsayılan davranışa bırak; kullanıcı PDF'i yeni sekmede de görse
 * "Aç" toast butonuyla aynı şey.
 */
function triggerDownload(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener noreferrer';
  a.target = '_blank';
  // `download` attr same-origin'de işler; cross-origin'de browser tercih
  // ediyor. Yine de ipucu olarak boş string set ediyoruz.
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function useReportRenderGlobal(): void {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  // Aynı renderId için duplicate event geldiğinde tekrar tetiklemeyi engelle
  // (bridge `io.local` Redis adapter durumuna göre çift yayım edebilir).
  const handledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;

    const socket = getRealtimeSocket();
    if (!socket.connected) socket.connect();

    const handleCompleted = async (payload: ReportRenderEventPayload) => {
      if (handledRef.current.has(payload.renderId)) return;
      handledRef.current.add(payload.renderId);

      try {
        const result = await queryClient.fetchQuery(
          trpc.report.getRender.queryOptions({ renderId: payload.renderId }),
        );
        const assets = (result?.assets ?? []) as AssetWithUrl[];
        // Birden çok format varsa öncelik PDF; yoksa ilk URL'li asset.
        const primary =
          assets.find((a) => a.format === 'pdf' && a.downloadUrl) ??
          assets.find((a) => a.downloadUrl);

        if (primary?.downloadUrl) {
          triggerDownload(primary.downloadUrl);
          toast.success('Rapor hazır', {
            description: 'PDF indirme başlatıldı.',
            action: {
              label: 'Aç',
              onClick: () => triggerDownload(primary.downloadUrl!),
            },
            duration: 8000,
          });
        } else {
          // URL üretilemediyse (objectStorage yok ya da signing fail) —
          // kullanıcı raporlar sayfasından manuel alabilir.
          toast.success('Rapor hazır', {
            description: 'Raporlar sayfasından indirebilirsin.',
            duration: 8000,
          });
        }
      } catch {
        // getRender fail — yine de kullanıcıyı bilgilendir.
        toast.success('Rapor hazır', {
          description: 'Raporlar sayfasından indirebilirsin.',
          duration: 8000,
        });
      }
    };

    const handleFailed = (payload: ReportRenderEventPayload) => {
      if (handledRef.current.has(payload.renderId)) return;
      handledRef.current.add(payload.renderId);
      toast.error('Rapor üretilemedi', {
        description:
          payload.errorMessage === 'reports.errors.storage_upload_failed'
            ? 'Depolama hatası — birazdan tekrar dene.'
            : 'Rapor render sırasında bir hata oluştu.',
        duration: 8000,
      });
    };

    socket.on(EVENT_COMPLETED, handleCompleted);
    socket.on(EVENT_FAILED, handleFailed);

    return () => {
      socket.off(EVENT_COMPLETED, handleCompleted);
      socket.off(EVENT_FAILED, handleFailed);
    };
  }, [userId, queryClient, trpc]);
}
