/**
 * Faz 13H (DEM-264) — saved report detay sayfası.
 *
 * `/workspaces/[id]/reports/[reportId]` — kaydedilmiş raporun panel
 * görünümü (filter snapshot ile preview re-render). 13G `<ReportPanel>`
 * reuse.
 *
 * Kullanıcı kararı (2026-05-24): Pusula `workspaces/[id]` segment'ı +
 * `[reportId]` nested route (spec'in `[id]` collision'unu engelle —
 * outer `[id]` workspaceId, inner `[reportId]` saved id).
 *
 * Pattern: `'use client'` page (Pusula workspaces/[id]/page.tsx ile aynı);
 * SSR tRPC adapter Next route handler değil — useQuery client-side fetch.
 */
'use client';

import { use, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import {
  type ComparisonConfig,
  type ReportFilters,
  type ReportScope,
} from '@pusula/domain';
import { AppSpinner } from '@/components/app-spinner';
import { useReportI18n } from '@/components/reports/hooks/use-report-i18n';
import { ReportPanel } from '@/components/reports/panel/report-panel';
import { SavedReportDetailBar } from '@/components/reports/detail/saved-report-detail-bar';
import {
  useReportStale,
  type WatchedReportScope,
} from '@/lib/realtime/use-report-stale';
import { useTRPC } from '@/trpc/client';

export default function SavedReportDetailPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id: workspaceId, reportId } = use(params);
  const { t } = useReportI18n();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const savedQuery = useQuery({
    ...trpc.report.getSaved.queryOptions({ id: reportId }),
    staleTime: 30_000,
  });

  if (savedQuery.isPending) {
    return (
      <div className="rounded-lg border bg-card p-12">
        <AppSpinner label={t('reports.detail.loading')} showLabel />
      </div>
    );
  }

  if (savedQuery.isError) {
    // V1: NOT_FOUND ve diğer error'ları birleşik göster (timing oracle yok
    // ki — auth-gated route, leak değil).
    if (savedQuery.error.data?.code === 'NOT_FOUND') notFound();
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm"
        data-testid="saved-report-detail-error"
      >
        <p className="font-medium text-destructive">{t('reports.detail.errorTitle')}</p>
        <p className="mt-1 text-muted-foreground">{savedQuery.error.message}</p>
      </div>
    );
  }

  const saved = savedQuery.data;

  // Saved scope shape → ReportScope (UI'da composer ile aynı şekil).
  const scope: ReportScope = (() => {
    if (saved.scopeKind === 'workspace') {
      return { kind: 'workspace', workspaceId: saved.workspaceId };
    }
    if (saved.scopeKind === 'board') {
      return { kind: 'board', boardId: saved.scopeId, workspaceId: saved.workspaceId };
    }
    // list/card için boardId UI'da yok — workspace scope fallback (server
    // tarafı `scopeFromSavedReport` ile gerçek scope'u kanonik çözer).
    return { kind: 'workspace', workspaceId: saved.workspaceId };
  })();

  // Faz 13N (DEM-270) — `onRefresh` artık `SavedReportDetailContent` içindeki
  // `useReportStale.refresh()` üzerinden geçer (parent ek invalidate
  // gereksiz; hook zaten `report.preview` + `report.getSaved` pathFilter
  // ile invalidate ediyor). queryClient/trpc burada kullanılmıyor.
  void queryClient;
  void trpc;
  return (
    <SavedReportDetailContent
      workspaceId={workspaceId}
      saved={saved}
      scope={scope}
    />
  );
}

interface SavedReportDetailContentProps {
  workspaceId: string;
  saved: {
    id: string;
    title: string;
    description: string | null;
    presetId: string;
    workspaceId: string;
    filters: unknown;
    comparison: unknown;
    archivedAt: Date | string | null;
  };
  scope: ReportScope;
}

function SavedReportDetailContent({
  workspaceId,
  saved,
  scope,
}: SavedReportDetailContentProps) {
  const trpc = useTRPC();
  const filters = saved.filters as ReportFilters;
  const comparison = saved.comparison as ComparisonConfig | null;

  const previewQuery = useQuery({
    ...trpc.report.preview.queryOptions({
      scope,
      presetId: saved.presetId,
      filters,
      comparison: comparison?.enabled ? comparison : null,
    }),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Faz 13N (DEM-270) — stale rozeti hook'u. Watched scope saved row'dan
  // türetilir (kanonik scope `scopeFromSavedReport` server-side; UI tarafı
  // basit ReportScope shape'i). Workspace room'a join + report.invalidated
  // event'ini açık scope'a göre eşler.
  const watchedScope: WatchedReportScope = useMemo(() => {
    if (scope.kind === 'workspace') {
      return { kind: 'workspace', workspaceId: scope.workspaceId };
    }
    if (scope.kind === 'board') {
      return {
        kind: 'board',
        boardId: scope.boardId,
        workspaceId: scope.workspaceId,
      };
    }
    if (scope.kind === 'list') {
      return {
        kind: 'list',
        listId: scope.listId,
        boardId: scope.boardId,
        workspaceId: scope.workspaceId,
      };
    }
    return {
      kind: 'card',
      cardId: scope.cardId,
      boardId: scope.boardId,
      workspaceId: scope.workspaceId,
    };
  }, [scope]);

  const stale = useReportStale({
    workspaceId: saved.workspaceId,
    watchedScope,
  });

  return (
    <div className="space-y-3">
      <SavedReportDetailBar
        workspaceId={workspaceId}
        savedReportId={saved.id}
        title={saved.title}
        scope={scope}
        filters={filters}
        isArchived={saved.archivedAt != null}
        isFetching={previewQuery.isFetching}
        onRefresh={stale.refresh}
        isStale={stale.isStale}
      />
      <ReportPanel
        dataset={previewQuery.data ?? null}
        loading={previewQuery.isFetching}
        errorMessage={previewQuery.error?.message ?? null}
        onRefresh={stale.refresh}
        isStale={stale.isStale}
      />
    </div>
  );
}
