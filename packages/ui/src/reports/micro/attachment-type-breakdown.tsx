import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface AttachmentTypeBreakdownData {
  items: Array<{ mimeType: string; count: number; totalBytes: number; averageBytes: number }>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentTypeBreakdown(props: MicroReportProps<AttachmentTypeBreakdownData>) {
  const { data, t, mode } = props;
  const title = t('reports.microReports.attachmentTypeBreakdown.title');
  if (data.items.length === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.attachmentTypeBreakdown.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const limit = mode === 'panel' ? 10 : 30;
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={240}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="py-1 font-medium">MIME</th>
            <th scope="col" className="text-right font-medium">{t('reports.microReports.attachmentTypeBreakdown.count')}</th>
            <th scope="col" className="text-right font-medium">{t('reports.microReports.attachmentTypeBreakdown.avg')}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.slice(0, limit).map((row) => (
            <tr key={row.mimeType} className="border-b last:border-0">
              <td className="py-1 truncate text-xs">{row.mimeType}</td>
              <td className="text-right tabular-nums">{row.count}</td>
              <td className="text-right tabular-nums text-muted-foreground">
                {formatBytes(row.averageBytes)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </MicroReportShell>
  );
}

export const attachmentTypeBreakdownManifest: MicroReportUiManifest<AttachmentTypeBreakdownData> =
  {
    id: 'attachment-type-breakdown',
    Component: AttachmentTypeBreakdown,
    worksheetExport(data) {
      return {
        columns: [
          { header: 'mimeType', key: 'mimeType', width: 24 },
          { header: 'count', key: 'count', width: 10 },
          { header: 'totalBytes', key: 'totalBytes', width: 14 },
          { header: 'averageBytes', key: 'averageBytes', width: 14 },
        ],
        rows: data.items,
      };
    },
  };
