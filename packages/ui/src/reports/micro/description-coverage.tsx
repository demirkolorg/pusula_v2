import { FileTextIcon } from 'lucide-react';
import { Progress } from '../../components/progress';
import { MicroReportShell } from '../primitives/micro-report-shell';
import { ReportEmptyState } from '../primitives/empty-state';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface DescriptionCoverageData {
  total: number;
  withDescription: number;
  percentage: number | null;
}

export function DescriptionCoverage(props: MicroReportProps<DescriptionCoverageData>) {
  const { data, t, locale, mode } = props;
  const title = t('reports.microReports.descriptionCoverage.title');
  if (data.total === 0) {
    return (
      <MicroReportShell title={title} colSpan={2} mode={mode}>
        <ReportEmptyState
          i18nKey="reports.microReports.descriptionCoverage.emptyState"
          t={t}
          mode={mode}
        />
      </MicroReportShell>
    );
  }
  const pctText =
    data.percentage === null
      ? '—'
      : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(
          data.percentage / 100,
        );
  return (
    <MicroReportShell title={title} colSpan={2} mode={mode} minHeight={200}>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-semibold tabular-nums text-foreground">{pctText}</span>
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <FileTextIcon className="size-4" aria-hidden />
            {t('reports.microReports.descriptionCoverage.ratio', {
              withDescription: data.withDescription,
              total: data.total,
            })}
          </span>
        </div>
        <Progress value={data.percentage ?? 0} />
      </div>
    </MicroReportShell>
  );
}

export const descriptionCoverageManifest: MicroReportUiManifest<DescriptionCoverageData> = {
  id: 'description-coverage',
  Component: DescriptionCoverage,
  worksheetExport(data) {
    return {
      columns: [
        { header: 'metric', key: 'metric', width: 18 },
        { header: 'value', key: 'value', width: 12 },
      ],
      rows: [
        { metric: 'total', value: data.total },
        { metric: 'with_description', value: data.withDescription },
        { metric: 'percentage', value: data.percentage },
      ],
    };
  },
};
