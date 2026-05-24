'use client';

/**
 * Faz 13I (DEM-265) — print sayfası client component.
 *
 * Server Component (`page.tsx`) tRPC `print.verifyToken` ile dataset envelope
 * + i18n stub + workspace meta'sını alır; bu component recharts ile micro-
 * report'ları render eder. Render fragmanı tamamlanınca `window.__reportReady
 * = true` set edilir — Puppeteer worker bunu bekler ve PDF üretir.
 *
 * `getMicroReportComponent(id)` UI registry'sinden component'i çözer; eksik
 * micro-report id (registry'de yoksa) → placeholder yer. Lookup paneli
 * 13G/13H'de cilalanır.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §16.8.
 */
import { useEffect, useMemo } from 'react';
import type { ReportEnvelope } from '@pusula/api/lib/report-envelope';
import { PrintPageFrame, getMicroReportComponent } from '@pusula/ui/reports';

export interface ReportPrintPayload {
  envelope: ReportEnvelope;
  /** Server-side resolve edilmiş i18n key→Tr stub map (13Q'a kadar). */
  i18n: Record<string, string>;
  workspaceName: string;
  locale: string;
}

export interface ReportPrintClientProps {
  payload: ReportPrintPayload;
  renderId: string;
}

/**
 * `t(key, params?)` resolver — `payload.i18n[key]` lookup + `{{name}}` /
 * `{{count}}` placeholder interpolation. Eksik key → key string'i ekrana.
 * Bu, 13Q i18n provider geldikte `next-intl` ile ikame edilir.
 */
function makeTranslator(
  i18n: Record<string, string>,
): (key: string, params?: Record<string, unknown>) => string {
  return (key, params) => {
    const template = i18n[key] ?? key;
    if (!params) return template;
    return template.replace(/{{\s*(\w+)\s*}}/g, (_, name) => {
      const value = params[name as keyof typeof params];
      return value === undefined || value === null ? '' : String(value);
    });
  };
}

export function ReportPrintClient({ payload, renderId }: ReportPrintClientProps) {
  const { envelope, i18n, workspaceName, locale } = payload;
  const t = useMemo(() => makeTranslator(i18n), [i18n]);

  // Faz 13I: tüm micro-report'lar mount edildikten sonra
  // `window.__reportReady = true`. `useEffect` mount sonrası tek sefer
  // koşar; recharts initial render senkron, dolayısıyla bu mount-time
  // signal yeterli (chart'lar JSdom benzeri tarafsız ortamda da
  // synchronous render eder — bkz. UI test setup `recharts` shim).
  //
  // requestAnimationFrame ile bir tick erteleme: animation off olsa da
  // recharts ResponsiveContainer ölçüm yapar; 2 raf yeterli garantör.
  useEffect(() => {
    let cancelled = false;
    const handle = requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        (window as unknown as { __reportReady?: boolean }).__reportReady = true;
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [renderId, envelope.generatedAt]);

  const title = t(`reports.presets.${envelope.presetId}.title`);
  const subtitle = `${envelope.microReports.length} micro-report · ${formatScope(envelope.scope, t)}`;

  return (
    <div data-print-page-root data-render-id={renderId}>
      <PrintPageFrame
        title={title === `reports.presets.${envelope.presetId}.title` ? envelope.presetId : title}
        subtitle={subtitle}
        generatedAt={envelope.generatedAt}
        workspaceName={workspaceName}
        t={t}
        locale={locale}
      >
        {envelope.microReports.map((micro) => {
          const manifest = getMicroReportComponent(micro.id);
          if (!manifest) {
            return (
              <div
                key={micro.id}
                data-slot="micro-report-shell"
                data-mode="print"
                className="rounded border border-dashed p-4 text-sm text-muted-foreground"
              >
                {t('reports.errors.manifestMissing')}
              </div>
            );
          }
          if (micro.error) {
            return (
              <div
                key={micro.id}
                data-slot="micro-report-shell"
                data-mode="print"
                className="rounded border border-dashed p-4 text-sm text-muted-foreground"
              >
                {t('reports.errors.widgetUnavailable')}
              </div>
            );
          }
          const Component = manifest.PrintComponent ?? manifest.Component;
          return (
            <Component
              key={micro.id}
              data={micro.data}
              comparisonData={micro.comparisonData}
              scope={envelope.scope}
              filters={envelope.filters}
              comparison={envelope.comparison}
              restricted={envelope.restrictedScope}
              mode="print"
              t={t}
              locale={locale}
            />
          );
        })}
      </PrintPageFrame>
    </div>
  );
}

/**
 * Scope açıklaması (`subtitle` için) — workspace/board/list/card kind'lara
 * göre i18n key fallback. Tam workspace adı `verifyToken` payload'unda
 * (`payload.workspaceName`); kart/liste/board adı `entity-summary` micro-
 * report'unda var, ama subtitle için kind etiketi yeterli.
 */
function formatScope(
  scope: ReportEnvelope['scope'],
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  switch (scope.kind) {
    case 'workspace':
      return t('reports.scope.workspace');
    case 'board':
      return t('reports.scope.board');
    case 'list':
      return t('reports.scope.list');
    case 'card':
      return t('reports.scope.card');
  }
}
