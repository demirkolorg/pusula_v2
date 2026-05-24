/**
 * Faz 13H (DEM-264) — list filtreleme bar'ı.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.3.
 * 3 sekme aynı bar shape'ini paylaşır ama hangi alanlar görünür `kind`
 * prop'una göre değişir.
 */
'use client';

import { SearchIcon, XIcon } from 'lucide-react';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from '@pusula/ui';
import {
  RANGE_PRESETS,
  type ReportRenderFormat,
  type ReportRenderStatus,
  type ReportScopeKind,
} from '@pusula/domain';
import { useReportI18n } from '../hooks/use-report-i18n';

export type FilterBarKind = 'saved' | 'scheduled' | 'renders';

export interface SavedFilterValue {
  scopeKind?: ReportScopeKind;
  presetId?: string;
  search?: string;
  includeArchived?: boolean;
}

export interface ScheduledFilterValue {
  isActive?: boolean | undefined;
  cadence?: 'daily' | 'weekly' | 'monthly';
}

export interface RendersFilterValue {
  status?: ReportRenderStatus;
  format?: ReportRenderFormat;
}

export type FilterBarValue =
  | { kind: 'saved'; value: SavedFilterValue }
  | { kind: 'scheduled'; value: ScheduledFilterValue }
  | { kind: 'renders'; value: RendersFilterValue };

export interface FilterBarProps {
  kind: FilterBarKind;
  // Discriminated by kind; consumer narrows in render.
  value: SavedFilterValue | ScheduledFilterValue | RendersFilterValue;
  onChange: (next: SavedFilterValue | ScheduledFilterValue | RendersFilterValue) => void;
}

const SCOPE_KINDS: ReadonlyArray<ReportScopeKind> = ['card', 'list', 'board', 'workspace'];
const ACTIVE_VALUES = ['all', 'active', 'inactive'] as const;
const CADENCE_VALUES = ['all', 'daily', 'weekly', 'monthly'] as const;
const STATUS_VALUES: ReadonlyArray<ReportRenderStatus | 'all'> = [
  'all',
  'queued',
  'rendering',
  'completed',
  'failed',
  'expired',
];
const FORMAT_VALUES: ReadonlyArray<ReportRenderFormat | 'all'> = ['all', 'pdf', 'xlsx', 'png'];

export function FilterBar({ kind, value, onChange }: FilterBarProps) {
  const { t } = useReportI18n();

  if (kind === 'saved') {
    const v = value as SavedFilterValue;
    return (
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2.5"
        data-testid="reports-filter-bar-saved"
      >
        <div className="relative flex-1 min-w-[200px]">
          {/* A11y S3: sr-only label görme zorluğu + SR uyumu için. */}
          <label htmlFor="reports-filter-search" className="sr-only">
            {t('reports.list.filter.search')}
          </label>
          <SearchIcon
            className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="reports-filter-search"
            type="search"
            value={v.search ?? ''}
            onChange={(e) => onChange({ ...v, search: e.target.value || undefined })}
            placeholder={t('reports.list.filter.searchPlaceholder')}
            className={cn('h-9 pl-8')}
          />
        </div>
        <Select
          value={v.scopeKind ?? 'all'}
          onValueChange={(next) =>
            onChange({
              ...v,
              scopeKind: next === 'all' ? undefined : (next as ReportScopeKind),
            })
          }
        >
          <SelectTrigger className="h-9 w-[140px]" aria-label={t('reports.list.filter.scope')}>
            <SelectValue placeholder={t('reports.list.filter.scope')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('reports.list.filter.allScopes')}</SelectItem>
            {SCOPE_KINDS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`reports.scope.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="inline-flex cursor-pointer items-center gap-2 px-2 text-xs">
          <Switch
            checked={v.includeArchived ?? false}
            onCheckedChange={(checked) =>
              onChange({ ...v, includeArchived: checked || undefined })
            }
            data-testid="reports-filter-show-archived"
          />
          {t('reports.list.filter.showArchived')}
        </label>
        {(v.search || v.scopeKind || v.includeArchived) && (
          <button
            type="button"
            onClick={() => onChange({} as SavedFilterValue)}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3" />
            {t('reports.list.filter.clear')}
          </button>
        )}
      </div>
    );
  }

  if (kind === 'scheduled') {
    const v = value as ScheduledFilterValue;
    return (
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2.5"
        data-testid="reports-filter-bar-scheduled"
      >
        <Select
          value={
            v.isActive === undefined ? 'all' : v.isActive ? 'active' : 'inactive'
          }
          onValueChange={(next) =>
            onChange({
              ...v,
              isActive:
                next === 'all' ? undefined : next === 'active' ? true : false,
            })
          }
        >
          <SelectTrigger className="h-9 w-[160px]" aria-label={t('reports.list.filter.activeStatus')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTIVE_VALUES.map((a) => (
              <SelectItem key={a} value={a}>
                {t(`reports.list.filter.active.${a}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={v.cadence ?? 'all'}
          onValueChange={(next) =>
            onChange({
              ...v,
              cadence: next === 'all' ? undefined : (next as ScheduledFilterValue['cadence']),
            })
          }
        >
          <SelectTrigger className="h-9 w-[140px]" aria-label={t('reports.list.filter.cadence')}>
            <SelectValue placeholder={t('reports.list.filter.cadence')} />
          </SelectTrigger>
          <SelectContent>
            {CADENCE_VALUES.map((c) => (
              <SelectItem key={c} value={c}>
                {c === 'all'
                  ? t('reports.list.filter.allCadences')
                  : t(`reports.schedule.cadence.${c}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // renders
  const v = value as RendersFilterValue;
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2.5"
      data-testid="reports-filter-bar-renders"
    >
      <Select
        value={v.status ?? 'all'}
        onValueChange={(next) =>
          onChange({
            ...v,
            status: next === 'all' ? undefined : (next as ReportRenderStatus),
          })
        }
      >
        <SelectTrigger className="h-9 w-[150px]" aria-label={t('reports.list.filter.status')}>
          <SelectValue placeholder={t('reports.list.filter.status')} />
        </SelectTrigger>
        <SelectContent>
          {STATUS_VALUES.map((s) => (
            <SelectItem key={s} value={s}>
              {s === 'all'
                ? t('reports.list.filter.allStatuses')
                : t(`reports.list.status.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={v.format ?? 'all'}
        onValueChange={(next) =>
          onChange({
            ...v,
            format: next === 'all' ? undefined : (next as ReportRenderFormat),
          })
        }
      >
        <SelectTrigger className="h-9 w-[140px]" aria-label={t('reports.list.filter.format')}>
          <SelectValue placeholder={t('reports.list.filter.format')} />
        </SelectTrigger>
        <SelectContent>
          {FORMAT_VALUES.map((f) => (
            <SelectItem key={f} value={f}>
              {f === 'all' ? t('reports.list.filter.allFormats') : f.toUpperCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Silence unused-import lint for shared exports.
void Label;
void RANGE_PRESETS;
