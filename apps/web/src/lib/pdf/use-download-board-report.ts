/**
 * Faz 14F — Klasik pano PDF indirme hook'u (DEM-296, web).
 *
 * `GET /api/boards/[boardId]/report` (14E) çağırır; blob → `<a download>`
 * trick'i; toast (sonner). `isDownloading` aynı kart üzerinde paralel ikinci
 * tıklamayı yutar. Eski Pusula `handleDownloadReport` (`projeler/[id]/page.tsx:629-680`)
 * pattern adaptasyonu.
 *
 * i18n: TR sabit metinler `strings.board.topBar.report*` namespace'inden gelir
 * (`apps/web/src/lib/strings.ts`). Lint custom kuralı `pusula/no-hardcoded-text-in-reports`
 * yalnız `components/reports/` altını gözettiği için `lib/pdf/` altında string
 * literal tetiklemez; `strings.*` zaten Pusula web'in standart i18n yüzeyi.
 */
'use client';

import { useCallback, useState } from 'react';
import { toast } from '@pusula/ui';

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
      const response = await fetch(`/api/boards/${boardId}/report`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
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
