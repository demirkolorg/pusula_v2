/**
 * Faz 13H (DEM-264) — saved report detay sayfası üst bar.
 *
 * Anatomi:
 *   - Sol: back link + başlık + scope etiketi
 *   - Orta: filtre özet chips
 *   - Sağ: Yenile + PDF + Excel + Zamanla (admin+) + ⋯ + Stale slot (13N)
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.2 (panel header)
 * + §10.3 (workspace merkez).
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  CalendarClockIcon,
  DownloadIcon,
  FileDownIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, cn, toast } from '@pusula/ui';
import { StaleBadge } from '@pusula/ui/reports';
import type { ReportFilters, ReportScope } from '@pusula/domain';
import { useReportI18n } from '../hooks/use-report-i18n';
import { useReportPermission } from '../hooks/use-report-permission';
import { PermissionGatedButton } from '../shared/permission-gated-button';
import { ScheduleDialog } from '../shared/schedule-dialog';
import { FilterSummaryChips } from '../shared/filter-summary-chips';
import { useTRPC } from '@/trpc/client';
import { SavedReportActions } from './saved-report-actions';

export interface SavedReportDetailBarProps {
  workspaceId: string;
  savedReportId: string;
  title: string;
  scope: ReportScope;
  filters: ReportFilters;
  isArchived: boolean;
  /** 13N için iskelet — bu fazda daima false. */
  isStale?: boolean;
  isFetching?: boolean;
  onRefresh?: () => void;
}

export function SavedReportDetailBar({
  workspaceId,
  savedReportId,
  title,
  scope,
  filters,
  isArchived,
  isStale = false,
  isFetching = false,
  onRefresh,
}: SavedReportDetailBarProps) {
  const { t } = useReportI18n();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const perm = useReportPermission({ scope });
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const exportMutation = useMutation(
    trpc.report.export.mutationOptions({
      onSuccess: () => {
        toast.success(t('reports.composer.export.queuedToast'));
        void queryClient.invalidateQueries(
          trpc.report.listRenders.queryFilter({ workspaceId }),
        );
      },
      onError: (err) =>
        toast.error(err.message || t('reports.composer.export.errorToast')),
    }),
  );

  function handleExport(format: 'pdf' | 'xlsx' | 'png' | 'svg', microReportId?: string) {
    if ((format === 'png' || format === 'svg') && !microReportId) return;
    exportMutation.mutate({
      source: 'saved',
      savedReportId,
      format,
      assetTarget: microReportId ? { microReportId } : undefined,
    });
  }

  const scopeLabel = t(`reports.scope.${scope.kind}`);

  return (
    <header
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card px-4 py-3',
        isArchived && 'opacity-75',
      )}
      data-testid="saved-report-detail-bar"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <Link
          href={`/workspaces/${workspaceId}/reports`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 rounded-md text-xs underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <ArrowLeftIcon className="size-3" />
          {t('reports.detail.back')}
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          {isArchived && (
            <Badge variant="outline" className="text-[10px]">
              {t('reports.list.archivedBadge')}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{scopeLabel}</span>
          <span aria-hidden>·</span>
          <FilterSummaryChips filters={filters} />
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {isStale && onRefresh && (
          <StaleBadge visible={isStale} onRefresh={onRefresh} t={t} />
        )}
        {onRefresh && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            data-testid="saved-report-detail-refresh"
            aria-label={t('reports.actions.refresh')}
          >
            <RefreshCwIcon className={cn('size-4', isFetching && 'animate-spin')} />
            {t('reports.actions.refresh')}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExport('pdf')}
          disabled={exportMutation.isPending}
          data-testid="saved-report-detail-pdf"
        >
          <DownloadIcon className="size-4" />
          {exportMutation.isPending
            ? t('reports.actions.export.preparing')
            : t('reports.actions.export.pdf')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExport('xlsx')}
          disabled={exportMutation.isPending}
          data-testid="saved-report-detail-xlsx"
          // Faz 13S (DEM-275) — mobile WebView embed mode'da Excel butonu
          // gizlenir (mobil V1 sadece PDF; CSV daha mobile-friendly olabilir,
          // V2). `data-embed-hide` selector `embed-mobile.css`'te.
          data-embed-hide="true"
        >
          <FileDownIcon className="size-4" />
          {exportMutation.isPending
            ? t('reports.actions.export.preparing')
            : t('reports.actions.export.xlsx')}
        </Button>
        <PermissionGatedButton
          can={perm.canScheduleCreate}
          hide
          variant="outline"
          size="sm"
          onClick={() => setScheduleOpen(true)}
          data-testid="saved-report-detail-schedule"
          // Faz 13S — Zamanla butonu mobil V1'de yok (oluştur/zamanla web'de).
          data-embed-hide="true"
        >
          <CalendarClockIcon className="size-4" />
          {t('reports.actions.schedule.label')}
        </PermissionGatedButton>
        <span data-embed-hide="true">
          <SavedReportActions
            workspaceId={workspaceId}
            savedReportId={savedReportId}
            scope={scope}
            title={title}
            isArchived={isArchived}
          />
        </span>
      </div>
      {scheduleOpen && (
        <ScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          savedReportId={savedReportId}
        />
      )}
    </header>
  );
}
