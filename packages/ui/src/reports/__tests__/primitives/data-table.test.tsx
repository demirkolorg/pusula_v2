import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { DataTable, type DataTableColumn } from '../../primitives/data-table';
import { renderUi, t } from '../test-utils';

interface Row {
  id: string;
  name: string;
  count: number;
}

const COLUMNS: ReadonlyArray<DataTableColumn<Row>> = [
  { key: 'name', headerKey: 'reports.x.name', render: (r) => r.name },
  { key: 'count', headerKey: 'reports.x.count', render: (r) => r.count, numeric: true },
];

const ROWS: Row[] = Array.from({ length: 12 }, (_, i) => ({
  id: `r-${i}`,
  name: `Row ${i}`,
  count: i * 10,
}));

describe('DataTable', () => {
  it('renders header keys', () => {
    renderUi(
      <DataTable columns={COLUMNS} rows={ROWS} getRowKey={(r) => r.id} t={t} mode="panel" />,
    );
    expect(screen.getByText('reports.x.name')).toBeInTheDocument();
    expect(screen.getByText('reports.x.count')).toBeInTheDocument();
  });

  it('panel mode caps rows at panelLimit (default 10)', () => {
    renderUi(
      <DataTable columns={COLUMNS} rows={ROWS} getRowKey={(r) => r.id} t={t} mode="panel" />,
    );
    // 10 satır + 1 header
    expect(screen.getAllByRole('row').length).toBe(11);
    expect(screen.getByText(/reports.dataTable.more/)).toBeInTheDocument();
  });

  it('print mode renders all rows', () => {
    renderUi(
      <DataTable columns={COLUMNS} rows={ROWS} getRowKey={(r) => r.id} t={t} mode="print" />,
    );
    expect(screen.getAllByRole('row').length).toBe(13); // 12 + header
  });

  it('panelLimit=null disables truncation in panel', () => {
    renderUi(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        getRowKey={(r) => r.id}
        t={t}
        mode="panel"
        panelLimit={null}
      />,
    );
    expect(screen.getAllByRole('row').length).toBe(13);
  });

  it('renders empty key when rows is empty', () => {
    renderUi(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        getRowKey={(r) => r.id}
        t={t}
        mode="panel"
        emptyKey="reports.x.none"
      />,
    );
    expect(screen.getByText('reports.x.none')).toBeInTheDocument();
  });

  it('printOnly columns hidden in panel, shown in print', () => {
    const cols: ReadonlyArray<DataTableColumn<Row>> = [
      ...COLUMNS,
      { key: 'extra', headerKey: 'reports.x.extra', render: () => 'X', printOnly: true },
    ];
    const { rerender } = renderUi(
      <DataTable columns={cols} rows={ROWS.slice(0, 2)} getRowKey={(r) => r.id} t={t} mode="panel" />,
    );
    expect(screen.queryByText('reports.x.extra')).toBeNull();
    rerender(
      <DataTable columns={cols} rows={ROWS.slice(0, 2)} getRowKey={(r) => r.id} t={t} mode="print" />,
    );
    expect(screen.getByText('reports.x.extra')).toBeInTheDocument();
  });
});
