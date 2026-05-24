import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import {
  ActivityTimeline,
  activityTimelineManifest,
} from '../../micro/activity-timeline';
import {
  activityTimelineEmptyFixture,
  activityTimelineFixture,
} from '../../fixtures/activity-timeline.fixture';
import { renderUi, t, TEST_LOCALE } from '../test-utils';

const SCOPE = { kind: 'card' as const, cardId: 'c1', boardId: 'b1', workspaceId: 'w1' };
const FILTERS = { range: { kind: 'preset' as const, preset: 'last30d' as const } };

describe('ActivityTimeline', () => {
  it('renders one li per event', () => {
    renderUi(
      <ActivityTimeline
        data={activityTimelineFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBe(4);
  });

  it('renders i18n key per event type', () => {
    renderUi(
      <ActivityTimeline
        data={activityTimelineFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(screen.getByText('reports.activity.types.card.created')).toBeInTheDocument();
    expect(screen.getByText('reports.activity.types.card.completed')).toBeInTheDocument();
  });

  it('shows empty state when no events', () => {
    renderUi(
      <ActivityTimeline
        data={activityTimelineEmptyFixture}
        scope={SCOPE}
        filters={FILTERS}
        t={t}
        locale={TEST_LOCALE}
        mode="panel"
      />,
    );
    expect(
      screen.getByText('reports.microReports.activityTimeline.emptyState'),
    ).toBeInTheDocument();
  });

  it('worksheet export maps event id/type/actor/createdAt', () => {
    const out = activityTimelineManifest.worksheetExport!(activityTimelineFixture);
    expect(out.rows.length).toBe(4);
    expect(out.rows[0]).toHaveProperty('type');
  });
});
