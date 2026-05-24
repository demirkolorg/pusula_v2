import { PaperclipIcon } from 'lucide-react';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface AttachmentSummaryData {
  totalCount: number;
  totalBytes: number;
  byType: { image: number; pdf: number; office: number; other: number };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function AttachmentSummary(props: MicroReportProps<AttachmentSummaryData>) {
  const { data, t, mode } = props;
  const title = t('reports.microReports.attachmentSummary.title');
  if (data.totalCount === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.attachmentSummary.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={240}>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-semibold tabular-nums">{data.totalCount}</span>
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <PaperclipIcon className="size-4" aria-hidden />
            {formatBytes(data.totalBytes)}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {(['image', 'pdf', 'office', 'other'] as const).map((kind) => (
            <div key={kind} className="rounded border bg-muted/30 p-2 text-center">
              <dt className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {t(`reports.microReports.attachmentSummary.type.${kind}`)}
              </dt>
              <dd className="text-lg font-semibold tabular-nums">{data.byType[kind]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </MicroReportShell>
  );
}

export const attachmentSummaryManifest: MicroReportUiManifest<AttachmentSummaryData> = {
  id: 'attachment-summary',
  Component: AttachmentSummary,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'metric', key: 'metric', width: 16 },
        { header: 'value', key: 'value', width: 14 },
      ],
      rows: [
        { metric: 'totalCount', value: data.totalCount },
        { metric: 'totalBytes', value: data.totalBytes },
        { metric: 'image', value: data.byType.image },
        { metric: 'pdf', value: data.byType.pdf },
        { metric: 'office', value: data.byType.office },
        { metric: 'other', value: data.byType.other },
      ],
    };
  },
};
