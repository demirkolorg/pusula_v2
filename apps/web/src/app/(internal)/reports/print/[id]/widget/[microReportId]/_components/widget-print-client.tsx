'use client';

/**
 * Faz 13L (DEM-268) — chart-level widget print client. Worker'ın
 * `page.screenshot({ clip: { width: 1200, height: 800 } })` veya
 * `document.querySelector('#widget-root svg').outerHTML` çağrısı bu
 * component'in DOM'unu okur.
 *
 * Minimal frame: micro-report Component dolu boyutta render edilir;
 * header/footer/chrome YOK. SVG export'da recharts `<svg>` direkt DOM'da
 * görünür.
 *
 * `window.__widgetReady = true` set edildiğinde Puppeteer screenshot/
 * outerHTML alır.
 */
import { useEffect, useMemo } from 'react';
import type { ReportEnvelope } from '@pusula/api/lib/report-envelope';
import { getMicroReportComponent } from '@pusula/ui/reports';

export interface WidgetPrintClientProps {
  microReportId: string;
  microReportData: unknown;
  comparisonData: unknown;
  envelope: ReportEnvelope;
  i18n: Record<string, string>;
  locale: string;
  format: 'png' | 'svg';
  renderId: string;
}

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

export function WidgetPrintClient(props: WidgetPrintClientProps) {
  const { microReportId, microReportData, comparisonData, envelope, i18n, locale, renderId } =
    props;
  const t = useMemo(() => makeTranslator(i18n), [i18n]);

  // 13I print page pattern: 2 raf erteleme + setTimeout = recharts'a
  // ölçüm + initial render tamamlanma süresi tanır; sonra ready flag.
  useEffect(() => {
    let cancelled = false;
    const handle = requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        setTimeout(() => {
          if (cancelled) return;
          (window as unknown as { __widgetReady?: boolean }).__widgetReady = true;
        }, 100);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [microReportId, renderId]);

  const manifest = getMicroReportComponent(microReportId);
  if (!manifest) {
    return (
      <div
        id="widget-root"
        data-widget-error="manifest-missing"
        style={widgetRootStyle}
      >
        {t('reports.errors.manifestMissing')}
      </div>
    );
  }
  const Component = manifest.PrintComponent ?? manifest.Component;
  return (
    <div
      id="widget-root"
      data-render-id={renderId}
      data-micro-report-id={microReportId}
      style={widgetRootStyle}
    >
      <Component
        data={microReportData as never}
        comparisonData={comparisonData as never}
        scope={envelope.scope}
        filters={envelope.filters}
        comparison={envelope.comparison}
        restricted={envelope.restrictedScope}
        mode="print"
        t={t}
        locale={locale}
      />
    </div>
  );
}

/** Worker viewport ile aynı sabit boyut (1200×800). */
const widgetRootStyle: React.CSSProperties = {
  width: 1200,
  height: 800,
  padding: 24,
  background: 'white',
  boxSizing: 'border-box',
  overflow: 'hidden',
};
