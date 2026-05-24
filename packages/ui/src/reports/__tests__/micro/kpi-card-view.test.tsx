import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { KpiCardView, kpiCardViewManifest } from '../../micro/kpi-card-view';
import { kpiCardViewFixture, kpiCardViewPrevFixture } from '../../fixtures/kpi-card-view.fixture';
import { renderUi, t, TEST_LOCALE } from '../test-utils';

const SCOPE = { kind: 'board' as const, boardId: 'b1', workspaceId: 'w1' };
const FILTERS = { range: { kind: 'preset' as const, preset: 'last30d' as const } };

describe('KpiCardView', () => {
  it('renders raw value', () => {
    renderUi(
      <KpiCardView
        data={kpiCardViewFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(screen.getByText(/142/)).toBeInTheDocument();
  });

  it('shows previous + delta when comparisonData present', () => {
    renderUi(
      <KpiCardView
        data={kpiCardViewFixture}
        comparisonData={kpiCardViewPrevFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(screen.getByText(/142/)).toBeInTheDocument();
    expect(screen.getByText(/reports.kpi.previousLabel/)).toBeInTheDocument();
    // 124 önceki
    expect(screen.getByText(/124/)).toBeInTheDocument();
  });

  it('print mode marker', () => {
    const { container } = renderUi(
      <KpiCardView
        data={kpiCardViewFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="print"
      />,
    );
    expect(
      container.querySelector('[data-slot="kpi-card"]')?.getAttribute('data-mode'),
    ).toBe('print');
  });

  it('worksheetExport returns a single metric row', () => {
    const out = kpiCardViewManifest.worksheetExport!(kpiCardViewFixture);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toEqual({ metric: 'activityCount', value: 142 });
  });
});
