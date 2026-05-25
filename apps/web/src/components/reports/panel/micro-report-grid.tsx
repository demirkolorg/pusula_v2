/**
 * Faz 13G (DEM-263) — micro-report grid dispatcher; 13L (DEM-268) PNG/SVG
 * export menüsü wrapper'ı.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.2 + §9.
 * `dataset.microReports[]` → 13F UI registry'sinden (`MICRO_REPORT_COMPONENTS`)
 * component dispatch. Her micro-report KENDİ `MicroReportShell`'ini sarar
 * (13F pattern'i — bkz. `activity-timeline.tsx`); grid yalnız layout
 * (`<div className="grid">`) sağlar.
 *
 * 13L: domain `MICRO_REPORTS[id].supportsPngExport` `true` ise widget'ın
 * sağ üst köşesine `<MicroReportPngExportMenu>` overlay'i eklenir. Panel
 * mode'da görünür, print mode'da gizli.
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
import { getMicroReportById } from '@pusula/domain/reports';
import type { ReportEnvelope } from '@pusula/api/lib/report-envelope';
import { useReportI18n } from '../hooks/use-report-i18n';
import { MicroReportPngExportMenu } from './micro-report-png-export-menu';

export interface MicroReportGridProps {
  dataset: ReportEnvelope;
  /**
   * Faz 13L (DEM-268) — PNG/SVG export tetikleyici. Set edildiğinde her
   * `supportsPngExport: true` widget'a overlay menü eklenir. Yoksa menü
   * gizli (V1 yerleşik: ReportPanel/SavedReportDetail wrapper'ı).
   */
  onExportPng?: (input: { microReportId: string; format: 'png' | 'svg' }) => void;
  /** Export mutation pending — buton disable için (UX). */
  exportPending?: boolean;
  /**
   * Compact mode (composer önizleme gömülü) → max 2 kolon; standalone
   * panelde (saved report detay) 4 kolon. Compact'te 4 widget'ı 580px
   * civarı sağ kolona basmaya çalışınca shell başlıkları taşıyordu.
   */
  compact?: boolean;
}

export function MicroReportGrid({
  dataset,
  onExportPng,
  exportPending,
  compact,
}: MicroReportGridProps) {
  const { t, locale } = useReportI18n();

  return (
    <div className="space-y-3">
      {dataset.restrictedScope && (
        <RestrictedScopeBanner restricted={dataset.restrictedScope} t={t} />
      )}
      <div
        className={
          compact
            ? // Widget'ların çoğu `col-span-2` taşır (donut + KPI panel,
              // chart frame'ler). 4 kolon grid'de 2'şerli yan yana hizalanır;
              // 3 kolonda son satır boşluk bırakırdı.
              'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'
            : 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'
        }
        data-testid="report-micro-grid"
      >
        {dataset.microReports.map((mr) => {
          const manifest = getMicroReportComponent(mr.id);
          const dataManifest = getMicroReportById(mr.id);
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
          const showExportMenu =
            Boolean(onExportPng) && dataManifest?.supportsPngExport === true;
          // Wrapper: shell ile aynı colSpan grid hücresini kapla; absolute
          // child'lar shell'in sağ-üst'ünü override eder. Component zaten
          // `MicroReportShell` sarıyor (13F pattern).
          return (
            <div key={mr.id} className="relative contents">
              <div className="relative">
                <Component
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
                {showExportMenu && (
                  <MicroReportPngExportMenu
                    microReportId={mr.id}
                    disabled={exportPending}
                    onExport={onExportPng!}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
