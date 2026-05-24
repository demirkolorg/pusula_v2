/**
 * Faz 13H (DEM-264) — Son Render'lar sekmesi.
 *
 * `report.listRenders` query + 13I socket bridge'inden gelen completed/
 * failed event'leri (useReportListRealtime debounced invalidate).
 */
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { useReportListRealtime } from '@/lib/realtime/use-report-list-realtime';
import { useReportI18n } from '../hooks/use-report-i18n';
import { useTRPC } from '@/trpc/client';
import { EmptyStateRenders } from './empty-state-renders';
import { FilterBar, type RendersFilterValue } from './filter-bar';
import { RenderRow, type RenderRowData } from './render-row';

export interface RecentRendersTabProps {
  workspaceId: string;
  onNewReport: () => void;
}

export function RecentRendersTab({ workspaceId }: RecentRendersTabProps) {
  const { t } = useReportI18n();
  const trpc = useTRPC();
  const [filter, setFilter] = useState<RendersFilterValue>({});

  const query = useQuery({
    ...trpc.report.listRenders.queryOptions({
      workspaceId,
      status: filter.status,
      limit: 50,
    }),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });

  // Faz 13H socket realtime — render completed/failed toast + listeyi
  // debounced invalidate (500ms).
  useReportListRealtime({
    workspaceId,
    onCompleted: (event) => {
      toast.success(
        t('reports.list.toast.renderCompleted', { id: event.renderId.slice(0, 8) }),
      );
    },
    onFailed: () => {
      toast.error(t('reports.list.toast.renderFailed'));
    },
  });

  const items = (query.data?.items ?? []) as RenderRowData[];

  // Format filter server-side yok; client-side süz.
  const visibleItems = filter.format
    ? items.filter((r) => r.format === filter.format)
    : items;

  if (query.isPending) {
    return (
      <div className="rounded-lg border bg-card p-12">
        <AppSpinner label={t('reports.list.loading')} showLabel />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm"
        data-testid="reports-renders-error"
      >
        <p className="font-medium text-destructive">{t('reports.list.errorTitle')}</p>
        <p className="mt-1 text-muted-foreground">{query.error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FilterBar
        kind="renders"
        value={filter}
        onChange={(next) => setFilter(next as RendersFilterValue)}
      />
      {visibleItems.length === 0 ? (
        <EmptyStateRenders />
      ) : (
        <ul
          className="space-y-2"
          data-testid="renders-list"
          // A11y S1: rendering durumdaki satır(lar) varsa aria-busy ile
          // SR'a "değişiyor" duyurusu (animate-spin görsel + aria-busy
          // semantik).
          aria-busy={visibleItems.some(
            (r) => r.status === 'queued' || r.status === 'rendering',
          )}
        >
          {visibleItems.map((render) => (
            <RenderRow key={render.id} workspaceId={workspaceId} render={render} />
          ))}
        </ul>
      )}
    </div>
  );
}
