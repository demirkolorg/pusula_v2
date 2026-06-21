/**
 * Faz 13S (DEM-275) — kaydedilmiş rapor detay ekranı (mobil).
 *
 * Web `apps/web/src/app/(app)/workspaces/[id]/reports/[reportId]/page.tsx`
 * (13H) sayfasını WebView ile render eder; mobile chrome (app-shell header,
 * admin-only butonlar) `?embed=mobile` query'siyle CSS olarak gizlenir
 * (`embed-mobile.css` web tarafında).
 *
 * PDF butonu: `report.export({ source: 'saved', savedReportId, format: 'pdf' })`
 * → polling `report.getRender` (2sn × 60 max = 120sn) → `FileSystem.downloadAsync`
 * → `Sharing.shareAsync` (native share sheet). `attachments-section.tsx`
 * (Faz 7J) indirme akışıyla simetrik.
 *
 * Auth cookie share: `sharedCookiesEnabled` (iOS) + `thirdPartyCookiesEnabled`
 * (Android). Better Auth Expo client session cookie'sini cihaz cookie jar'ında
 * tutar; web ve API parent domain'i paylaşır (`pusulaportal.com` /
 * `api.pusulaportal.com`).
 */
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { LoadingScreen } from '@/components/loading-screen';
import { EmptyState } from '@/components/empty-state';
import { ScreenHeader, ScreenHeaderAction } from '@/components/screen-header';
import { env } from '@/env';
import { strings } from '@/lib/strings';

type RenderRow = RouterOutputs['report']['getRender'];

/** Render polling parametreleri — V1 polling (V2 socket subscription planlanıyor). */
const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 60; // 60 × 2sn = 120sn (worker default render ≤ 30sn, marjin 4x)

function buildEmbedUrl(workspaceId: string, savedReportId: string): string {
  const base = env.EXPO_PUBLIC_WEB_URL.replace(/\/+$/, '');
  return `${base}/workspaces/${encodeURIComponent(workspaceId)}/reports/${encodeURIComponent(savedReportId)}?embed=mobile`;
}

function safeCacheFileName(savedReportId: string): string {
  // saved id zaten nanoid (URL-safe); defansif olarak yine de normalize et.
  return savedReportId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export default function SavedReportDetailScreen() {
  const params = useLocalSearchParams<{ id: string; workspaceId?: string; title?: string }>();
  const savedReportId = params.id;
  const workspaceId = params.workspaceId ?? '';
  const initialTitle = params.title ?? '';
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = useState(false);

  const exportMutation = useMutation(trpc.report.export.mutationOptions());

  const pollRenderUntilCompleted = useCallback(
    async (renderId: string): Promise<RenderRow> => {
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
        // staleTime 0 — her tick taze. Cache'te eski bir kopya varsa
        // poll oldukça hızlı yanıt verirdi; `getRender` her zaman fresh.
        const row = await queryClient.fetchQuery(
          trpc.report.getRender.queryOptions({ renderId }, { staleTime: 0 }),
        );
        if (row.render.status === 'completed') return row;
        if (row.render.status === 'failed') {
          throw new Error(row.render.errorMessage ?? strings.reports.detail.pdfErrorBody);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      // Timeout — V1 polling sınırı. V2 socket subscription bu sınırı kaldırır.
      throw new Error(strings.reports.detail.pdfTimeoutBody);
    },
    [queryClient, trpc.report.getRender],
  );

  const handleDownloadPdf = useCallback(async () => {
    if (downloading || !savedReportId) return;
    setDownloading(true);
    try {
      const { renderId } = await exportMutation.mutateAsync({
        source: 'saved',
        savedReportId,
        format: 'pdf',
      });
      const row = await pollRenderUntilCompleted(renderId);
      // İlk PDF asset'ini bul — V1 PDF için tek asset; defansif olarak ilk
      // `format='pdf'` satırı seçilir. `downloadUrl` server'ın presigned GET
      // URL'i (TTL 5 dk — `report.getRender` ctx.objectStorage'tan).
      const pdfAsset = row.assets.find((asset) => asset.format === 'pdf');
      if (!pdfAsset?.downloadUrl) {
        throw new Error(strings.reports.detail.pdfErrorBody);
      }
      const target = `${FileSystem.cacheDirectory ?? ''}pusula-report-${safeCacheFileName(savedReportId)}.pdf`;
      const downloaded = await FileSystem.downloadAsync(pdfAsset.downloadUrl, target);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloaded.uri, {
          mimeType: 'application/pdf',
          dialogTitle: strings.reports.detail.pdfDownloadButton,
        });
      } else {
        Alert.alert(
          strings.reports.detail.pdfErrorTitle,
          strings.reports.detail.pdfShareUnavailable,
        );
      }
    } catch (err) {
      Alert.alert(
        strings.reports.detail.pdfErrorTitle,
        err instanceof Error && err.message
          ? err.message
          : strings.reports.detail.pdfErrorBody,
      );
    } finally {
      setDownloading(false);
    }
  }, [downloading, exportMutation, pollRenderUntilCompleted, savedReportId]);

  if (!savedReportId || !workspaceId) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-card">
        <ScreenHeader title={strings.reports.detail.headerTitle} />
        <EmptyState
          icon="alert-triangle"
          title={strings.reports.detail.loadError}
          description={strings.common.unknownError}
        />
      </SafeAreaView>
    );
  }

  const targetUrl = buildEmbedUrl(workspaceId, savedReportId);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-card">
      <ScreenHeader
        title={initialTitle || strings.reports.detail.headerTitle}
        right={
          <ScreenHeaderAction
            icon="download"
            accessibilityLabel={strings.reports.detail.pdfDownloadButton}
            onPress={handleDownloadPdf}
            disabled={downloading}
          />
        }
      />
      <View className="flex-1 bg-card">
        <WebView
          source={{ uri: targetUrl }}
          // iOS + Android cookie share — Better Auth Expo client session cookie'si
          // cihaz cookie jar'ında. Parent domain `.pusulaportal.com` ile web ve
          // API aynı cookie'yi paylaşır.
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          // Pull-to-refresh — kullanıcı raporu yenilemek için ekranı çekebilir.
          pullToRefreshEnabled
          // Daha az şaşırtıcı geri davranışı — WebView içinde geri ekran
          // yenilemesin diye, ana Expo Router back action her zaman üst seviye
          // navigation'ı çalıştırır (varsayılan).
          startInLoadingState
          renderLoading={() => <LoadingScreen />}
          // iOS arka plan → foreground sonrası WebView state restoration
          // beklenenden uzun sürerse memory pressure crash'ında reload et.
          onContentProcessDidTerminate={(syntheticEvent) => {
            // Best-effort — `WebView` ref'imiz yok; default davranış restart.
            void syntheticEvent;
          }}
        />
      </View>
    </SafeAreaView>
  );
}
