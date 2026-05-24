import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface LabelCooccurrenceData {
  pairs: Array<{
    labelAId: string;
    labelAName: string;
    labelAColor: string;
    labelBId: string;
    labelBName: string;
    labelBColor: string;
    count: number;
  }>;
}

export function LabelCooccurrence(props: MicroReportProps<LabelCooccurrenceData>) {
  const { data, t, mode } = props;
  const title = t('reports.microReports.labelCooccurrence.title');
  if (data.pairs.length === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.labelCooccurrence.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={280}>
      <ul className="space-y-1.5 text-sm">
        {data.pairs.map((p) => (
          <li
            key={`${p.labelAId}-${p.labelBId}`}
            className="flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                aria-hidden
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: p.labelAColor }}
              />
              <span className="truncate">{p.labelAName}</span>
              <span aria-hidden className="text-muted-foreground">+</span>
              <span
                aria-hidden
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: p.labelBColor }}
              />
              <span className="truncate">{p.labelBName}</span>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.count}</span>
          </li>
        ))}
      </ul>
    </MicroReportShell>
  );
}

export const labelCooccurrenceManifest: MicroReportUiManifest<LabelCooccurrenceData> = {
  id: 'label-cooccurrence',
  Component: LabelCooccurrence,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'labelAName', key: 'labelAName', width: 18 },
        { header: 'labelBName', key: 'labelBName', width: 18 },
        { header: 'count', key: 'count', width: 10 },
      ],
      rows: data.pairs,
    };
  },
};
