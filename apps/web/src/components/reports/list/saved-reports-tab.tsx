/**
 * Faz 13H (DEM-264) — Kaydedilmiş raporlar sekmesi.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.3.
 * Filter bar (scope + preset + search + archived toggle) + list.
 * `report.listSaved` query + client-side preset filter (server-side
 * filter shape henüz `presetId` opsiyonel; search server-side yok →
 * V1 client-side).
 */
'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppSpinner } from '@/components/app-spinner';
import { useReportI18n } from '../hooks/use-report-i18n';
import { useReportPermission } from '../hooks/use-report-permission';
import { useTRPC } from '@/trpc/client';
import { EmptyStateSaved } from './empty-state-saved';
import { FilterBar, type SavedFilterValue } from './filter-bar';
import { SavedReportRow, type SavedReportRowSaved } from './saved-report-row';

export interface SavedReportsTabProps {
  workspaceId: string;
  onNewReport: () => void;
}

export function SavedReportsTab({ workspaceId, onNewReport }: SavedReportsTabProps) {
  const { t } = useReportI18n();
  const trpc = useTRPC();
  const [filter, setFilter] = useState<SavedFilterValue>({});

  const perm = useReportPermission({ scope: { kind: 'workspace', workspaceId } });

  const query = useQuery({
    ...trpc.report.listSaved.queryOptions({
      workspaceId,
      scopeKind: filter.scopeKind,
      archived: filter.includeArchived ? undefined : false,
      limit: 50,
    }),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const items = (query.data?.items ?? []) as SavedReportRowSaved[];

  // Client-side search filter (V1; server-side text-search 13H scope dışı).
  const visibleItems = useMemo(() => {
    if (!filter.search) return items;
    const q = filter.search.toLocaleLowerCase('tr-TR');
    return items.filter(
      (row) =>
        row.title.toLocaleLowerCase('tr-TR').includes(q) ||
        (row.description?.toLocaleLowerCase('tr-TR').includes(q) ?? false),
    );
  }, [items, filter.search]);

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
        data-testid="reports-saved-error"
      >
        <p className="font-medium text-destructive">{t('reports.list.errorTitle')}</p>
        <p className="mt-1 text-muted-foreground">{query.error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FilterBar
        kind="saved"
        value={filter}
        onChange={(next) => setFilter(next as SavedFilterValue)}
      />
      {visibleItems.length === 0 ? (
        <EmptyStateSaved onCreate={onNewReport} canCreate={perm.canGenerate} />
      ) : (
        <ul className="space-y-2" data-testid="saved-reports-list">
          {visibleItems.map((saved) => (
            <SavedReportRow key={saved.id} workspaceId={workspaceId} saved={saved} />
          ))}
        </ul>
      )}
    </div>
  );
}
