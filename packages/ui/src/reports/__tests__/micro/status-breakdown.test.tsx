import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { StatusBreakdown, statusBreakdownManifest } from '../../micro/status-breakdown';
import {
  statusBreakdownEmptyFixture,
  statusBreakdownFixture,
} from '../../fixtures/status-breakdown.fixture';
import { renderUi, t, TEST_LOCALE } from '../test-utils';

const SCOPE = { kind: 'board' as const, boardId: 'b1', workspaceId: 'w1' };
const FILTERS = { range: { kind: 'preset' as const, preset: 'last30d' as const } };

describe('StatusBreakdown', () => {
  it('renders title + 3 KPI cards with data', () => {
    renderUi(
      <StatusBreakdown
        data={statusBreakdownFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(screen.getByRole('heading')).toHaveTextContent(
      'reports.microReports.statusBreakdown.title',
    );
    // KpiCard'lar role=status taşımıyor ama text görünür
    expect(screen.getByText('42')).toBeInTheDocument(); // open
    expect(screen.getByText('78')).toBeInTheDocument(); // completed
    expect(screen.getByText('11')).toBeInTheDocument(); // archived
  });

  it('shows empty state when total = 0', () => {
    renderUi(
      <StatusBreakdown
        data={statusBreakdownEmptyFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(screen.getByText('reports.microReports.statusBreakdown.emptyState')).toBeInTheDocument();
  });

  it('print mode marker reached', () => {
    const { container } = renderUi(
      <StatusBreakdown
        data={statusBreakdownFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="print"
      />,
    );
    expect(
      container.querySelector('[data-slot="micro-report-shell"]')?.getAttribute('data-mode'),
    ).toBe('print');
  });

  it('worksheet export returns rows for 3 statuses + total', () => {
    const out = statusBreakdownManifest.worksheetExport!(statusBreakdownFixture);
    expect(out.columns.map((c) => c.key)).toEqual(['metric', 'value']);
    expect(out.rows.length).toBe(4);
  });
});
