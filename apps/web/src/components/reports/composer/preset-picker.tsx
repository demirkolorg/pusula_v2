/**
 * Faz 13G (DEM-263) — composer preset picker.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.1.
 * Scope kind'a göre filtreli preset listesi (`getPresetsForScope`).
 *
 * İki varyant:
 *  - default (grid)  — 3 sütun kart grid (responsive 2→1). Standalone
 *    sayfa veya geniş yerleşim için.
 *  - `compact` true  — Tek sütun sıkı liste; composer sol panelinde
 *    sığsın diye. Açıklama gizli (seçili olan ekranda görünür kalır;
 *    yine de yatayda daha az yer kaplar).
 */
'use client';

import { useId } from 'react';
import { BarChart3Icon, CheckIcon } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@pusula/ui';
import {
  getPresetsForScope,
  type ReportScopeKind,
} from '@pusula/domain';
import { useReportI18n } from '../hooks/use-report-i18n';

export interface PresetPickerProps {
  scopeKind: ReportScopeKind;
  value: string | null;
  onChange: (presetId: string) => void;
  /** Disabled durum (örn permission yok — composer açık ama seçim engelli). */
  disabled?: boolean;
  /**
   * Sıkı tek-sütun liste varyantı; composer sol paneli için. Default
   * `false` (3-col grid).
   */
  compact?: boolean;
}

export function PresetPicker({ scopeKind, value, onChange, disabled, compact }: PresetPickerProps) {
  const { t } = useReportI18n();
  const groupLabelId = useId();
  const presets = getPresetsForScope(scopeKind);

  return (
    <TooltipProvider delayDuration={300}>
      <section
        aria-labelledby={groupLabelId}
        role="radiogroup"
        className="space-y-2.5"
      >
        <h3
          id={groupLabelId}
          className={cn(
            'font-semibold text-foreground',
            compact ? 'text-xs uppercase tracking-wide text-muted-foreground' : 'text-sm',
          )}
        >
          {t('reports.composer.preset.label')}
        </h3>
        <div
          className={cn(
            compact
              ? 'flex flex-col gap-1.5'
              : 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3',
          )}
        >
          {presets.map((preset) => {
            const selected = value === preset.id;
            // `preset.i18nKey` zaten `reports.presets.<segment>.title` formatında
            // (örn. `reports.presets.workspaceExecutiveSummary.title`). Burada
            // `preset.id`'den (nokta içerdiği için resolver'da yanlış lookup
            // yapan) key türetmiyoruz — manifest'in i18nKey'ini doğrudan
            // kullanıp `.description` varyantını da ondan üretiyoruz.
            const titleKey = preset.i18nKey;
            const descKey = preset.i18nKey.replace(/\.title$/, '.description');
            const title = t(titleKey);
            const description = t(descKey);
            const resolvedTitle = title === titleKey ? preset.id : title;
            const resolvedDescription = description === descKey ? null : description;
            const countLabel = t('reports.composer.preset.includesCount', {
              count: preset.microReportIds.length,
            });

            if (compact) {
              return (
                <Tooltip key={preset.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={disabled}
                      onClick={() => onChange(preset.id)}
                      className={cn(
                        'group relative flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selected
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-card hover:bg-accent/40',
                        disabled && 'cursor-not-allowed opacity-60',
                      )}
                      data-testid={`report-preset-${preset.id}`}
                    >
                      <BarChart3Icon
                        className={cn(
                          'size-4 shrink-0',
                          selected ? 'text-primary' : 'text-muted-foreground',
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">
                        {resolvedTitle}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {preset.microReportIds.length}
                      </span>
                      {selected && (
                        <span
                          aria-hidden
                          className="ml-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                        >
                          <CheckIcon className="size-2.5" />
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" align="start" className="max-w-xs space-y-1">
                    <p className="text-xs font-medium">{resolvedTitle}</p>
                    {resolvedDescription && (
                      <p className="text-xs text-muted-foreground">{resolvedDescription}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">{countLabel}</p>
                    <ul className="space-y-0.5 text-[11px]">
                      {preset.microReportIds.map((id) => {
                        const key = `reports.microReports.${id}.title`;
                        const resolved = t(key);
                        return <li key={id}>· {resolved === key ? id : resolved}</li>;
                      })}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              );
            }

            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onChange(preset.id)}
                className={cn(
                  'relative flex w-full flex-col gap-1.5 rounded-lg border bg-card px-4 py-3 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                    : 'border-border hover:bg-accent/40',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
                data-testid={`report-preset-${preset.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <BarChart3Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 break-words text-sm font-medium leading-tight">
                      {resolvedTitle}
                    </span>
                  </div>
                  {selected && (
                    <span
                      aria-hidden
                      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    >
                      <CheckIcon className="size-3" />
                    </span>
                  )}
                </div>
                {resolvedDescription && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{resolvedDescription}</p>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="mt-1 inline-flex w-fit text-[11px] font-medium text-muted-foreground hover:text-foreground">
                      {countLabel}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <ul className="space-y-0.5 text-xs">
                      {preset.microReportIds.map((id) => {
                        const key = `reports.microReports.${id}.title`;
                        const resolved = t(key);
                        return <li key={id}>· {resolved === key ? id : resolved}</li>;
                      })}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </button>
            );
          })}
        </div>
      </section>
    </TooltipProvider>
  );
}
