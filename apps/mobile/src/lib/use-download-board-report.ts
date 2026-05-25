/**
 * Faz 14F (DEM-296) — mobile klasik pano PDF indirme akışı.
 *
 * 14A karar 10 (mobil parite) + Faz 13S `FileSystem.downloadAsync` +
 * `Sharing.shareAsync` altyapısı reuse. Endpoint: `apps/web` route handler
 * (`GET /api/boards/[boardId]/report`) — web ile aynı; mobile için tam URL
 * `env.EXPO_PUBLIC_WEB_URL` üzerinden.
 *
 * Better Auth Expo plugin SecureStore cookie tutar; `authClient.getCookie()`
 * `Cookie` başlığını döndürür. `FileSystem.downloadAsync` `headers` opsiyonunu
 * destekler — tRPC provider'daki cookie forwarding paterniyle simetrik.
 */
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { authClient } from '@/lib/auth-client';
import { safeCacheFileName } from '@/lib/attachment-format';
import { env } from '@/env';
import { strings } from '@/lib/strings';

const FILENAME_PATTERN = /filename="([^"]+)"/;

function extractFilename(headers: Record<string, string> | undefined, fallback: string): string {
  if (!headers) return fallback;
  // Header anahtarı case-insensitive arar.
  const dispositionKey = Object.keys(headers).find(
    (key) => key.toLowerCase() === 'content-disposition',
  );
  if (!dispositionKey) return fallback;
  const match = headers[dispositionKey]?.match(FILENAME_PATTERN);
  return match?.[1] ?? fallback;
}

export interface UseDownloadBoardReportResult {
  download: () => Promise<void>;
  isDownloading: boolean;
}

export function useDownloadBoardReport(
  boardId: string | undefined,
  boardTitle: string | undefined,
): UseDownloadBoardReportResult {
  const [isDownloading, setIsDownloading] = useState(false);

  const download = useCallback(async () => {
    if (!boardId || isDownloading) return;
    setIsDownloading(true);
    try {
      const cookie = authClient.getCookie();
      const url = `${env.EXPO_PUBLIC_WEB_URL}/api/boards/${encodeURIComponent(boardId)}/report`;
      const fallbackName = safeCacheFileName(`${boardTitle || 'pano'}-raporu.pdf`);
      const destination = `${FileSystem.cacheDirectory}${fallbackName}`;

      const result = await FileSystem.downloadAsync(url, destination, {
        headers: cookie ? { Cookie: cookie } : undefined,
      });

      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Report download failed (HTTP ${result.status})`);
      }

      const filename = extractFilename(result.headers, fallbackName);
      const finalUri =
        filename === fallbackName
          ? result.uri
          : await moveDownload(result.uri, filename);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(finalUri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: strings.board.downloadReport,
        });
      }
    } catch (error) {
      console.error('[classic-pdf:mobile] download failed:', error);
      Alert.alert(
        strings.board.downloadReportErrorTitle,
        strings.board.downloadReportErrorBody,
      );
    } finally {
      setIsDownloading(false);
    }
  }, [boardId, boardTitle, isDownloading]);

  return { download, isDownloading };
}

async function moveDownload(currentUri: string, desiredFilename: string): Promise<string> {
  if (!FileSystem.cacheDirectory) return currentUri;
  const target = `${FileSystem.cacheDirectory}${safeCacheFileName(desiredFilename)}`;
  try {
    await FileSystem.moveAsync({ from: currentUri, to: target });
    return target;
  } catch (error) {
    console.warn('[classic-pdf:mobile] move to canonical filename failed:', error);
    return currentUri;
  }
}
