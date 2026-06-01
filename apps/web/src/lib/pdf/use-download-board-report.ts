/**
 * Faz 14F — Klasik pano PDF indirme hook'u (DEM-296, web).
 *
 * `GET ${NEXT_PUBLIC_API_URL}/api/boards/:boardId/report` (Hono — apps/api)
 * çağırır; blob → `<a download>` trick'i; toast (sonner). `isDownloading` aynı
 * kart üzerinde paralel ikinci tıklamayı yutar.
 *
 * **2026-06-01 prod-fix:** Endpoint apps/web route handler'dan apps/api Hono raw
 * route'a taşındı. Önceki same-origin `/api/boards/:id/report` çağrısı browser
 * cookie scope'u nedeniyle Better Auth session'ını forward edemiyordu (cookie
 * `api.pusulaportal.com` host-only). Artık doğrudan API origin'ine
 * `credentials: 'include'` ile gider.
 *
 * i18n: TR sabit metinler `strings.board.topBar.report*` namespace'inden gelir
 * (`apps/web/src/lib/strings.ts`).
 */
'use client';

import { useCallback, useState } from 'react';
import { toast } from '@pusula/ui';

import { env } from '@/env';
import { strings } from '@/lib/strings';

const FILENAME_PATTERN = /filename="([^"]+)"/;

function extractFilename(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback;
  const match = contentDisposition.match(FILENAME_PATTERN);
  return match?.[1] ?? fallback;
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Safari Blob URL'lerini hemen revoke ederse `click()` iptal olabilir;
  // microtask sonrası güvenli.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface UseDownloadBoardReportResult {
  download: () => Promise<void>;
  isDownloading: boolean;
}

export interface UseDownloadBoardReportOptions {
  boardId: string;
  /** Filename Content-Disposition'da yoksa fallback üreten kaynak. */
  boardTitle: string;
}

export function useDownloadBoardReport({
  boardId,
  boardTitle,
}: UseDownloadBoardReportOptions): UseDownloadBoardReportResult {
  const [isDownloading, setIsDownloading] = useState(false);

  const download = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const response = await fetch(
        `${env.NEXT_PUBLIC_API_URL}/api/boards/${encodeURIComponent(boardId)}/report`,
        {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        },
      );
      if (!response.ok) {
        throw new Error(`Report download failed (${response.status})`);
      }
      const blob = await response.blob();
      const filename = extractFilename(
        response.headers.get('Content-Disposition'),
        `${boardTitle || 'pano'}-raporu.pdf`,
      );
      triggerBrowserDownload(blob, filename);
      toast.success(strings.board.topBar.reportToastSuccess);
    } catch (error) {
      console.error('[classic-pdf] download failed:', error);
      toast.error(strings.board.topBar.reportToastError);
    } finally {
      setIsDownloading(false);
    }
  }, [boardId, boardTitle, isDownloading]);

  return { download, isDownloading };
}
