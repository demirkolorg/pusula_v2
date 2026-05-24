/**
 * Faz 13G (DEM-263) — micro-report grid dispatcher.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.2.
 * `dataset.microReports[]` → 13F UI registry'sinden (`MICRO_REPORT_COMPONENTS`)
 * component dispatch. Her micro-report KENDİ `MicroReportShell`'ini sarar
 * (13F pattern'i — bkz. `activity-timeline.tsx`); grid yalnız layout
 * (`<div className="grid">`) sağlar.
 *
 * Hata durumları:
 *  - Manifest yok (registry'de bulunamadı) → minimal `<MicroReportShell>` +
 *    "manifest eksik" mesajı.
 *  - `mr.error` field'lı → minimal shell + "widget unavailable" mesajı.
 */
'use client';

import { AlertTriangleIcon } from 'lucide-react';
import {
  MicroReportShell,
  ReportEmptyState,
  RestrictedScopeBanner,
  getMicroReportComponent,
} from '@pusula/ui/reports';
import type { ReportEnvelope } from '@pusula/api/lib/report-envelope';
import { useReportI18n } from '../hooks/use-report-i18n';

export interface MicroReportGridProps {
  dataset: ReportEnvelope;
}

export function MicroReportGrid({ dataset }: MicroReportGridProps) {
  const { t, locale } = useReportI18n();

  return (
    <div className="space-y-3">
      {dataset.restrictedScope && (
        <RestrictedScopeBanner restricted={dataset.restrictedScope} t={t} />
      )}
      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
        data-testid="report-micro-grid"
      >
        {dataset.microReports.map((mr) => {
          const manifest = getMicroReportComponent(mr.id);
          const titleKey = `reports.microReports.${mr.id}.title`;
          const title = t(titleKey);
          const titleResolved = title === titleKey ? mr.id : title;

          if (!manifest) {
            return (
              <MicroReportShell
                key={mr.id}
                title={titleResolved}
                colSpan={2}
                mode="panel"
              >
                <ReportEmptyState
                  i18nKey="reports.errors.manifestMissing"
                  icon={<AlertTriangleIcon className="size-5" />}
                  t={t}
                />
              </MicroReportShell>
            );
          }

          if (mr.error) {
            return (
              <MicroReportShell
                key={mr.id}
                title={titleResolved}
                colSpan={2}
                mode="panel"
              >
                <ReportEmptyState
                  i18nKey="reports.errors.widgetUnavailable"
                  icon={<AlertTriangleIcon className="size-5" />}
                  t={t}
                />
              </MicroReportShell>
            );
          }

          const Component = manifest.Component;
          // Component zaten MicroReportShell'i içeride sarar (13F pattern).
          return (
            <Component
              key={mr.id}
              data={mr.data}
              comparisonData={mr.comparisonData}
              scope={dataset.scope}
              filters={dataset.filters}
              comparison={dataset.comparison}
              restricted={dataset.restrictedScope}
              mode="panel"
              t={t}
              locale={locale}
            />
          );
        })}
      </div>
    </div>
  );
}
