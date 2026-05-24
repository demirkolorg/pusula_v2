import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/table';
import { cn } from '../../lib/utils';

export interface DataTableColumn<TRow> {
  key: string;
  /** i18n key — başlık. */
  headerKey: string;
  /** Hücre içeriği renderer. */
  render: (row: TRow) => ReactNode;
  /** Sayısal sütun → text-right + tabular-nums. */
  numeric?: boolean;
  /** Sabit genişlik (px) — print sayfa break için faydalı. */
  width?: number;
  /** Sadece print mode'da görünür ek sütun. */
  printOnly?: boolean;
}

export interface DataTableProps<TRow> {
  columns: ReadonlyArray<DataTableColumn<TRow>>;
  rows: ReadonlyArray<TRow>;
  /** Satır identity key — React `key` için. */
  getRowKey: (row: TRow, index: number) => string;
  t: (key: string, params?: Record<string, unknown>) => string;
  mode: 'panel' | 'print';
  /**
   * Panel mode'da satır limit (print mode'da hep full). Default panel=10.
   * `null` → tüm satırlar her iki mode'da görünür.
   */
  panelLimit?: number | null;
  /** Empty state — t(`reports.dataTable.empty`) gibi sabit + custom. */
  emptyKey?: string;
  className?: string;
}

/**
 * Generic veri tablosu — shadcn Table primitive'i üstüne. Pagination/
 * sort 13G/13H'de (composer + workspace /reports) eklenecek; bu fazda
 * print-ready basit render.
 */
export function DataTable<TRow>({
  columns,
  rows,
  getRowKey,
  t,
  mode,
  panelLimit = 10,
  emptyKey,
  className,
}: DataTableProps<TRow>) {
  const visibleColumns =
    mode === 'print' ? columns : columns.filter((c) => !c.printOnly);
  const visibleRows =
    mode === 'panel' && panelLimit !== null && rows.length > panelLimit
      ? rows.slice(0, panelLimit)
      : rows;

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic" role="status">
        {emptyKey ? t(emptyKey) : t('reports.dataTable.empty')}
      </p>
    );
  }

  return (
    <div data-slot="report-data-table" data-mode={mode} className={cn('w-full', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {visibleColumns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(col.numeric && 'text-right tabular-nums')}
                style={col.width ? { width: col.width } : undefined}
              >
                {t(col.headerKey)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row, i) => (
            <TableRow key={getRowKey(row, i)}>
              {visibleColumns.map((col) => (
                <TableCell
                  key={col.key}
                  className={cn(col.numeric && 'text-right tabular-nums')}
                >
                  {col.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {mode === 'panel' && panelLimit !== null && rows.length > panelLimit ? (
        <p className="mt-2 text-xs text-muted-foreground panel-only">
          {t('reports.dataTable.more', { count: rows.length - panelLimit })}
        </p>
      ) : null}
    </div>
  );
}
