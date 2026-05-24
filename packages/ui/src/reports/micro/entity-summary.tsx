import { RichTextContent } from '../../components/rich-text-editor';
import { MetaChip } from '../../components/meta-chip';
import { MicroReportShell } from '../primitives/micro-report-shell';
import type { MicroReportProps, MicroReportUiManifest } from '../types';

export interface EntitySummaryData {
  kind: 'card' | 'list' | 'board' | 'workspace';
  id: string;
  title: string;
  /** Tiptap JSON (kartta) veya null. UI olduğu gibi `RichTextContent`'e verir. */
  description: unknown | null;
  archivedAt: string | null;
  counts: {
    cards?: number;
    lists?: number;
    boards?: number;
    members?: number;
    labels?: number;
  };
  members?: Array<{ userId: string; role: string }>;
}

/**
 * §9.13 — `entity-summary` micro-report'unda kart açıklaması tam Tiptap
 * render eder (`RichTextContent` `@pusula/ui/rich-text-editor`). Diğer
 * micro-report'larda plain text özet kullanılır (yine domain disiplini —
 * bu component sadece kendi rolünü oynar).
 */
export function EntitySummary(props: MicroReportProps<EntitySummaryData>) {
  const { data, t, mode } = props;
  const title = t('reports.microReports.entitySummary.title');
  // W2 (DEM-262 code-review): adapter `description`'ı string olarak da
  // (legacy plain-text), obje olarak da (Tiptap JSON) gönderebilir.
  // `RichTextContent` `value: string | null` bekler — round-trip
  // güvenliği için typeof guard:
  const description =
    typeof data.description === 'string'
      ? data.description
      : data.description != null
        ? JSON.stringify(data.description)
        : null;

  return (
    <MicroReportShell title={title} colSpan={4} mode={mode} minHeight={200}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <h4 className="text-base font-semibold">{data.title}</h4>
          {description ? (
            <div className="prose prose-sm dark:prose-invert mt-2 max-w-none">
              <RichTextContent value={description} />
            </div>
          ) : (
            <p className="mt-2 text-sm italic text-muted-foreground">
              {t('reports.microReports.entitySummary.noDescription')}
            </p>
          )}
        </div>
        <aside className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('reports.microReports.entitySummary.metaHeading')}
          </p>
          <div className="flex flex-wrap gap-1">
            {data.counts.cards !== undefined && (
              <MetaChip>{t('reports.microReports.entitySummary.cards', { count: data.counts.cards })}</MetaChip>
            )}
            {data.counts.lists !== undefined && (
              <MetaChip>{t('reports.microReports.entitySummary.lists', { count: data.counts.lists })}</MetaChip>
            )}
            {data.counts.boards !== undefined && (
              <MetaChip>{t('reports.microReports.entitySummary.boards', { count: data.counts.boards })}</MetaChip>
            )}
            {data.counts.members !== undefined && (
              <MetaChip>{t('reports.microReports.entitySummary.members', { count: data.counts.members })}</MetaChip>
            )}
            {data.counts.labels !== undefined && (
              <MetaChip>{t('reports.microReports.entitySummary.labels', { count: data.counts.labels })}</MetaChip>
            )}
            {data.archivedAt && (
              <MetaChip>
                {t('reports.microReports.entitySummary.archived')}
              </MetaChip>
            )}
          </div>
        </aside>
      </div>
    </MicroReportShell>
  );
}

export const entitySummaryManifest: MicroReportUiManifest<EntitySummaryData> = {
  id: 'entity-summary',
  Component: EntitySummary,
  // entity-summary CSV export desteklemiyor (§9.6 — supportsCsv: false).
};
