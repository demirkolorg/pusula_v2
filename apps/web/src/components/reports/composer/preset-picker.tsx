/**
 * Faz 13G (DEM-263) — composer preset picker grid.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.1.
 * Scope kind'a göre filtreli preset listesi (`getPresetsForScope`), 3
 * sütun grid (responsive 2→1). Her preset kart şeklinde — başlık + açıklama
 * + içerdiği micro-report sayısı tooltip'te.
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
}

export function PresetPicker({ scopeKind, value, onChange, disabled }: PresetPickerProps) {
  const { t } = useReportI18n();
  const groupLabelId = useId();
  const presets = getPresetsForScope(scopeKind);

  return (
    <TooltipProvider delayDuration={300}>
      <section
        aria-labelledby={groupLabelId}
        role="radiogroup"
        className="space-y-3"
      >
        <h3 id={groupLabelId} className="text-sm font-semibold text-foreground">
          {t('reports.composer.preset.label')}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((preset) => {
            const selected = value === preset.id;
            const titleKey = `reports.presets.${preset.id}.title`;
            const descKey = `reports.presets.${preset.id}.description`;
            const title = t(titleKey);
            const description = t(descKey);
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
                    ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                    : 'border-border hover:bg-accent/40',
                  disabled && 'opacity-60 cursor-not-allowed',
                )}
                data-testid={`report-preset-${preset.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BarChart3Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium leading-tight">
                      {title === titleKey ? preset.id : title}
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
                {description !== descKey && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="mt-1 inline-flex w-fit text-[11px] font-medium text-muted-foreground hover:text-foreground">
                      {t('reports.composer.preset.includesCount', {
                        count: preset.microReportIds.length,
                      })}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <ul className="space-y-0.5 text-xs">
                      {preset.microReportIds.map((id) => (
                        <li key={id}>· {t(`reports.microReports.${id}.title`) === `reports.microReports.${id}.title` ? id : t(`reports.microReports.${id}.title`)}</li>
                      ))}
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
