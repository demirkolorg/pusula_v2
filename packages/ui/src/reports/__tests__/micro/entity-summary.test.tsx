import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { EntitySummary } from '../../micro/entity-summary';
import {
  entitySummaryBoardFixture,
  entitySummaryCardFixture,
} from '../../fixtures/entity-summary.fixture';
import { renderUi, t, TEST_LOCALE } from '../test-utils';

const CARD_SCOPE = { kind: 'card' as const, cardId: 'c1', boardId: 'b1', workspaceId: 'w1' };
const BOARD_SCOPE = { kind: 'board' as const, boardId: 'b1', workspaceId: 'w1' };
const FILTERS = { range: { kind: 'preset' as const, preset: 'last30d' as const } };

describe('EntitySummary', () => {
  it('renders card title + description (Tiptap full)', () => {
    renderUi(
      <EntitySummary
        data={entitySummaryCardFixture}
        scope={CARD_SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(screen.getByText(entitySummaryCardFixture.title)).toBeInTheDocument();
    expect(screen.getByText(/tRPC sözleşmesini netleştirmek/)).toBeInTheDocument();
  });

  it('renders meta chips with i18n count interpolation', () => {
    renderUi(
      <EntitySummary
        data={entitySummaryBoardFixture}
        scope={BOARD_SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(screen.getByText(/reports.microReports.entitySummary.lists/)).toBeInTheDocument();
    expect(screen.getByText(/count=4/)).toBeInTheDocument();
  });

  it('shows noDescription when description is null', () => {
    renderUi(
      <EntitySummary
        data={entitySummaryBoardFixture}
        scope={BOARD_SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(
      screen.getByText('reports.microReports.entitySummary.noDescription'),
    ).toBeInTheDocument();
  });

  it('print mode marker set on shell', () => {
    const { container } = renderUi(
      <EntitySummary
        data={entitySummaryCardFixture}
        scope={CARD_SCOPE}
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
});
