import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import {
  LabelDistribution,
  labelDistributionManifest,
} from '../../micro/label-distribution';
import {
  labelDistributionEmptyFixture,
  labelDistributionFixture,
} from '../../fixtures/label-distribution.fixture';
import { renderUi, t, TEST_LOCALE } from '../test-utils';

const SCOPE = { kind: 'board' as const, boardId: 'b1', workspaceId: 'w1' };
const FILTERS = { range: { kind: 'preset' as const, preset: 'last30d' as const } };

describe('LabelDistribution', () => {
  it('print mode renders chart + table', () => {
    renderUi(
      <LabelDistribution
        data={labelDistributionFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="print"
      />,
    );
    // 5 label + header
    expect(screen.getAllByRole('row').length).toBe(6);
  });

  it('panel mode renders chart but no inline table', () => {
    renderUi(
      <LabelDistribution
        data={labelDistributionFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    // Panel mode'da yalnız chart frame var; tablo print mode'a özel
    expect(screen.queryByRole('row')).toBeNull();
  });

  it('empty state', () => {
    renderUi(
      <LabelDistribution
        data={labelDistributionEmptyFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(
      screen.getByText('reports.microReports.labelDistribution.emptyState'),
    ).toBeInTheDocument();
  });

  it('worksheet export 5 label rows', () => {
    const out = labelDistributionManifest.worksheetExport!(labelDistributionFixture);
    expect(out.rows.length).toBe(5);
  });
});
