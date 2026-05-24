/**
 * Faz 13G (DEM-263) — composer state + tRPC çağrıları hook'u.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.1.
 * Tek hook'ta:
 *   - preset / filter / comparison state
 *   - `report.catalog` query (mount + scope.kind değişiminde)
 *   - `report.preview` query (preset+filter+comparison değişiminde, debounce)
 *   - `report.save` + `report.export` mutations
 *
 * Preset seçildiğinde `defaultFilters` merge (`mergeFiltersWithPresetDefaults`)
 * — kullanıcı sonradan override edebilir. Preview keepPreviousData ile
 * loading durumunda eski dataset kalır (UX gürültüsü yok).
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@pusula/ui';
import {
  getPresetById,
  type ComparisonConfig,
  type ReportFilters,
  type ReportScope,
} from '@pusula/domain';

/**
 * Default filter — domain'deki `DEFAULT_FILTERS` modul-private; UI tarafında
 * preset seçilmeden filter shape'i gereklidir. `preview` query yine de
 * preset gerektiriyor (enabled flag), yani bu yalnız initial state için.
 */
const DEFAULT_FILTERS: ReportFilters = { range: { kind: 'preset', preset: 'last30d' } };
const COMPARISON_OFF: ComparisonConfig = { enabled: false, mode: 'previousPeriod' };
import { useTRPC } from '@/trpc/client';
import { useReportI18n } from '../hooks/use-report-i18n';

export interface UseComposerStateArgs {
  scope: ReportScope;
  initialPresetId?: string;
  initialFilters?: ReportFilters;
  initialComparison?: ComparisonConfig;
  /**
   * Mount sonrası ilk preview otomatik tetiklensin mi? V1: `true` —
   * preset auto-seç (ilk preset) varsa preview otomatik fetch'lenir;
   * `false` ise kullanıcı "Önizle" butonuna basana kadar bekler.
   */
  autoPreview?: boolean;
}

/**
 * Preset değiştiğinde default filter'ları (`PRESETS[id].defaultFilters`)
 * mevcut kullanıcı state'i ile birleştir. Kullanıcı override etmediği
 * alanlar default'a düşer; override ettiği alanlar (range, members vb.)
 * korunur. V1: preset değişiminde **filter sıfırlanır** (basit) — gelecek
 * sprint'te "preset ön-default + user-modified" ayrımı.
 */
function mergeFiltersWithPresetDefaults(
  base: ReportFilters | undefined,
  presetId: string | null,
): ReportFilters {
  if (!presetId) return base ?? DEFAULT_FILTERS;
  const preset = getPresetById(presetId);
  if (!preset) return base ?? DEFAULT_FILTERS;
  return preset.defaultFilters;
}

export function useComposerState(args: UseComposerStateArgs) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { t } = useReportI18n();

  const [presetId, setPresetId] = useState<string | null>(args.initialPresetId ?? null);
  const [filters, setFilters] = useState<ReportFilters>(() =>
    args.initialFilters ?? mergeFiltersWithPresetDefaults(undefined, args.initialPresetId ?? null),
  );
  const [comparison, setComparison] = useState<ComparisonConfig>(
    args.initialComparison ?? COMPARISON_OFF,
  );

  // Catalog — preset listesi + micro-report listesi.
  const catalogQuery = useQuery(
    trpc.report.catalog.queryOptions({ scopeKind: args.scope.kind }),
  );

  // İlk preset otomatik seç: catalog yüklendiğinde + initialPresetId yok +
  // catalog'da preset varsa. code-review H4: `prev ??` no-op'tu (DEFAULT_
  // FILTERS ile state always non-null) → preset defaults hiç uygulanmıyordu.
  // Manuel onPresetChange ile aynı davranışı sağla.
  useEffect(() => {
    if (presetId) return;
    if (!catalogQuery.data) return;
    const first = catalogQuery.data.presets[0];
    if (!first) return;
    setPresetId(first.id);
    setFilters(mergeFiltersWithPresetDefaults(undefined, first.id));
  }, [catalogQuery.data, presetId]);

  // Preview — preset + filter + comparison değişiminde otomatik fetch.
  // `keepPreviousData` ile loading durumunda eski dataset kalır (titreme yok).
  const previewQuery = useQuery({
    ...trpc.report.preview.queryOptions(
      presetId
        ? {
            scope: args.scope,
            presetId,
            filters,
            comparison: comparison.enabled ? comparison : null,
          }
        : (undefined as never),
    ),
    enabled: Boolean(presetId) && (args.autoPreview ?? true),
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  // Save mutation.
  const saveMutation = useMutation(
    trpc.report.save.mutationOptions({
      onSuccess: () => {
        toast.success(t('reports.composer.save.successToast'));
        void queryClient.invalidateQueries(
          trpc.report.listSaved.queryFilter({ workspaceId: args.scope.workspaceId }),
        );
      },
      onError: (err) => {
        toast.error(err.message || t('reports.composer.save.errorToast'));
      },
    }),
  );

  // Export mutation (PDF + Excel). Worker (13I) sonucu socket event ile
  // gelir; bu mutation yalnız enqueue eder + render id döner.
  const exportMutation = useMutation(
    trpc.report.export.mutationOptions({
      onSuccess: () => {
        toast.success(t('reports.composer.export.queuedToast'));
        void queryClient.invalidateQueries(
          trpc.report.listRenders.queryFilter({ workspaceId: args.scope.workspaceId }),
        );
      },
      onError: (err) => {
        toast.error(err.message || t('reports.composer.export.errorToast'));
      },
    }),
  );

  const onPresetChange = useCallback((nextId: string) => {
    setPresetId(nextId);
    setFilters(mergeFiltersWithPresetDefaults(undefined, nextId));
  }, []);

  return useMemo(
    () => ({
      // State
      presetId,
      filters,
      comparison,
      // Setters
      setPresetId: onPresetChange,
      setFilters,
      setComparison,
      // Queries
      catalogQuery,
      previewQuery,
      // Mutations
      saveMutation,
      exportMutation,
    }),
    [
      presetId,
      filters,
      comparison,
      onPresetChange,
      catalogQuery,
      previewQuery,
      saveMutation,
      exportMutation,
    ],
  );
}

export type ComposerState = ReturnType<typeof useComposerState>;
