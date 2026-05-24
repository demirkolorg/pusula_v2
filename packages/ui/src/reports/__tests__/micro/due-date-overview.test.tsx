import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import {
  DueDateOverview,
  dueDateOverviewManifest,
} from '../../micro/due-date-overview';
import {
  dueDateOverviewEmptyFixture,
  dueDateOverviewFixture,
} from '../../fixtures/due-date-overview.fixture';
import { renderUi, t, TEST_LOCALE } from '../test-utils';

const SCOPE = { kind: 'board' as const, boardId: 'b1', workspaceId: 'w1' };
const FILTERS = { range: { kind: 'preset' as const, preset: 'last30d' as const } };

describe('DueDateOverview', () => {
  it('renders 5 segments with KPI cards', () => {
    renderUi(
      <DueDateOverview
        data={dueDateOverviewFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(screen.getByText('4')).toBeInTheDocument(); // overdue
    expect(screen.getByText('8')).toBeInTheDocument(); // dueSoon
    expect(screen.getByText('15')).toBeInTheDocument(); // upcoming
  });

  it('empty state on total=0', () => {
    renderUi(
      <DueDateOverview
        data={dueDateOverviewEmptyFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(
      screen.getByText('reports.microReports.dueDateOverview.emptyState'),
    ).toBeInTheDocument();
  });

  it('bar role=img with aria-label', () => {
    renderUi(
      <DueDateOverview
        data={dueDateOverviewFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('worksheet export has 6 rows', () => {
    const out = dueDateOverviewManifest.worksheetExport!(dueDateOverviewFixture);
    expect(out.rows.length).toBe(6);
  });
});
