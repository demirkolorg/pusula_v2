import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface CycleTimeData {
  totalSamples: number;
  p50Hours: number | null;
  p75Hours: number | null;
  p95Hours: number | null;
  averageHours: number | null;
  buckets: Array<{ label: string; count: number }>;
}

function formatHours(h: number | null): string {
  if (h === null) return '—';
  if (h < 24) return `${Math.round(h)}sa`;
  return `${(h / 24).toFixed(1)}g`;
}

export function CycleTime(props: MicroReportProps<CycleTimeData>) {
  const { data, t, mode } = props;
  const title = t('reports.microReports.cycleTime.title');
  if (data.totalSamples === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.cycleTime.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={280}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="P50" value={formatHours(data.p50Hours)} t={t} />
          <Stat label="P75" value={formatHours(data.p75Hours)} t={t} />
          <Stat label="P95" value={formatHours(data.p95Hours)} t={t} />
        </div>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.buckets} accessibilityLayer role="img">
              <XAxis dataKey="label" fontSize={10} />
              <YAxis fontSize={10} allowDecimals={false} />
              <Bar
                dataKey="count"
                fill="hsl(var(--primary))"
                radius={[3, 3, 0, 0]}
                isAnimationActive={mode === 'panel'}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </MicroReportShell>
  );
}

function Stat({ label, value, t }: { label: string; value: string; t: (k: string) => string }) {
  return (
    <div className="rounded border bg-muted/30 p-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {t(`reports.microReports.cycleTime.percentile.${label.toLowerCase()}`) === `reports.microReports.cycleTime.percentile.${label.toLowerCase()}`
          ? label
          : t(`reports.microReports.cycleTime.percentile.${label.toLowerCase()}`)}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export const cycleTimeManifest: MicroReportUiManifest<CycleTimeData> = {
  id: 'cycle-time',
  Component: CycleTime,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'metric', key: 'metric', width: 16 },
        { header: 'value', key: 'value', width: 12 },
      ],
      rows: [
        { metric: 'totalSamples', value: data.totalSamples },
        { metric: 'p50Hours', value: data.p50Hours ?? '' },
        { metric: 'p75Hours', value: data.p75Hours ?? '' },
        { metric: 'p95Hours', value: data.p95Hours ?? '' },
        { metric: 'averageHours', value: data.averageHours ?? '' },
      ],
    };
  },
};
