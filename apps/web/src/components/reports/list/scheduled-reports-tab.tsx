/**
 * Faz 13H (DEM-264) — Zamanlanmış raporlar sekmesi.
 *
 * `report.schedule.listByWorkspace` workspace-wide schedule + saved
 * join'i döner (yeni procedure 13H'de eklendi).
 */
'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppSpinner } from '@/components/app-spinner';
import { useReportI18n } from '../hooks/use-report-i18n';
import { useTRPC } from '@/trpc/client';
import { EmptyStateScheduled } from './empty-state-scheduled';
import { FilterBar, type ScheduledFilterValue } from './filter-bar';
import { ScheduleRow, type ScheduleRowData } from './schedule-row';

export interface ScheduledReportsTabProps {
  workspaceId: string;
  onNewReport: () => void;
}

export function ScheduledReportsTab({ workspaceId }: ScheduledReportsTabProps) {
  const { t } = useReportI18n();
  const trpc = useTRPC();
  const [filter, setFilter] = useState<ScheduledFilterValue>({});

  const query = useQuery({
    ...trpc.report.schedule.listByWorkspace.queryOptions({
      workspaceId,
      isActive: filter.isActive,
    }),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const items = (query.data?.items ?? []) as ScheduleRowData[];

  // Client-side cadence filter (server-side filter eklenebilir ama
  // mevcut row sayısı genellikle düşük; V1 client OK).
  const visibleItems = useMemo(() => {
    if (!filter.cadence) return items;
    return items.filter((r) => r.schedule.cadence === filter.cadence);
  }, [items, filter.cadence]);

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
        data-testid="reports-scheduled-error"
      >
        <p className="font-medium text-destructive">{t('reports.list.errorTitle')}</p>
        <p className="mt-1 text-muted-foreground">{query.error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FilterBar
        kind="scheduled"
        value={filter}
        onChange={(next) => setFilter(next as ScheduledFilterValue)}
      />
      {visibleItems.length === 0 ? (
        <EmptyStateScheduled />
      ) : (
        <ul className="space-y-2" data-testid="scheduled-reports-list">
          {visibleItems.map((row) => (
            <ScheduleRow key={row.schedule.id} workspaceId={workspaceId} data={row} />
          ))}
        </ul>
      )}
    </div>
  );
}
