import { computeDelta } from '@pusula/domain/reports';
import { KpiCard, type KpiFormat } from '../primitives/kpi-card';
import { MicroReportShell } from '../primitives/micro-report-shell';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface KpiCardViewData {
  /** Domain metric id ('activityCount' | 'wipCount' | ...). */
  metric: string;
  value: number | null;
  /** UI labelKey (manifest config'inden gelir; saved report'tan da geçilebilir). */
  labelKey: string;
  format?: KpiFormat;
  /** "Geciken artması kötü" gibi inverse semantik. */
  semantics?: 'auto' | 'inverse';
}

/**
 * Tek metrik widget'ı — comparison etkin ve `comparisonData` doluysa
 * `computeDelta` ile delta hesaplanır (domain saf fonksiyon).
 */
export function KpiCardView(props: MicroReportProps<KpiCardViewData>) {
  const { data, comparisonData, t, locale, mode } = props;
  const delta =
    comparisonData && comparisonData.value !== null && data.value !== null
      ? computeDelta(data.value, comparisonData.value)
      : undefined;
  const previousValue = comparisonData?.value ?? null;
  // Eski adapter'lar / saved report'lar `labelKey` set etmeden veri
  // gönderebilir → shell başlığı boş kalmasın diye metric'ten türetilen
  // `reports.metrics.<metric>` key'ine düş. Hem onda da yoksa metric
  // adının kendisi (insan-okur fallback).
  const labelKey =
    data.labelKey && data.labelKey.length > 0
      ? data.labelKey
      : data.metric
        ? `reports.metrics.${data.metric}`
        : '';
  const resolvedTitle = labelKey ? t(labelKey) : '';
  const title = resolvedTitle && resolvedTitle !== labelKey ? resolvedTitle : data.metric ?? '';
  return (
    <MicroReportShell
      title={title}
      colSpan={1}
      mode={mode}
      minHeight={140}
    >
      <KpiCard
        labelKey={labelKey}
        value={data.value}
        previousValue={previousValue}
        delta={delta}
        format={data.format ?? 'number'}
        size="lg"
        mode={mode}
        t={t}
        locale={locale}
        semantics={data.semantics ?? 'auto'}
      />
    </MicroReportShell>
  );
}

export const kpiCardViewManifest: MicroReportUiManifest<KpiCardViewData> = {
  id: 'kpi-card',
  Component: KpiCardView,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'metric', key: 'metric', width: 20 },
        { header: 'value', key: 'value', width: 12 },
      ],
      rows: [{ metric: data.metric, value: data.value }],
    };
  },
};
