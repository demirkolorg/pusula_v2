import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import {
  ChecklistProgress,
  checklistProgressManifest,
} from '../../micro/checklist-progress';
import {
  checklistProgressEmptyFixture,
  checklistProgressFixture,
  checklistProgressFullFixture,
} from '../../fixtures/checklist-progress.fixture';
import { renderUi, t, TEST_LOCALE } from '../test-utils';

const SCOPE = { kind: 'card' as const, cardId: 'c1', boardId: 'b1', workspaceId: 'w1' };
const FILTERS = { range: { kind: 'preset' as const, preset: 'last30d' as const } };

describe('ChecklistProgress', () => {
  it('renders percentage + ratio', () => {
    renderUi(
      <ChecklistProgress
        data={checklistProgressFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(screen.getByText(/%64/)).toBeInTheDocument();
    expect(
      screen.getByText(/reports.microReports.checklistProgress.ratio/),
    ).toBeInTheDocument();
  });

  it('shows celebrate badge at 100%', () => {
    renderUi(
      <ChecklistProgress
        data={checklistProgressFullFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(
      screen.getByText('reports.microReports.checklistProgress.celebrate'),
    ).toBeInTheDocument();
  });

  it('empty state when total=0', () => {
    renderUi(
      <ChecklistProgress
        data={checklistProgressEmptyFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(
      screen.getByText('reports.microReports.checklistProgress.emptyState'),
    ).toBeInTheDocument();
  });

  it('worksheet export has 3 metric rows', () => {
    const out = checklistProgressManifest.worksheetExport!(checklistProgressFixture);
    expect(out.rows.length).toBe(3);
  });
});
