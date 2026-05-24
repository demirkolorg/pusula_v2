import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import {
  MemberContribution,
  memberContributionManifest,
} from '../../micro/member-contribution';
import {
  memberContributionEmptyFixture,
  memberContributionFixture,
} from '../../fixtures/member-contribution.fixture';
import { renderUi, t, TEST_LOCALE } from '../test-utils';

const SCOPE = { kind: 'board' as const, boardId: 'b1', workspaceId: 'w1' };
const FILTERS = { range: { kind: 'preset' as const, preset: 'last30d' as const } };

describe('MemberContribution', () => {
  it('renders chart + table with all rows in print', () => {
    renderUi(
      <MemberContribution
        data={memberContributionFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="print"
      />,
    );
    // 4 contributor row + header
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(5);
  });

  it('empty state when contributors empty', () => {
    renderUi(
      <MemberContribution
        data={memberContributionEmptyFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(
      screen.getByText('reports.microReports.memberContribution.emptyState'),
    ).toBeInTheDocument();
  });

  it('worksheet export maps userId+count', () => {
    const out = memberContributionManifest.worksheetExport!(memberContributionFixture);
    expect(out.rows.length).toBe(4);
    expect(out.rows[0]).toHaveProperty('userId');
  });
});
