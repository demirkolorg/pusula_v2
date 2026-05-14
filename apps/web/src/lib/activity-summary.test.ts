import { describe, expect, it } from 'vitest';
import { activitySummary } from './activity-summary';

describe('activitySummary', () => {
  it('renders backend notification taxonomy summaries', () => {
    expect(activitySummary('card_assigned', { title: 'Kart A' })).toContain('Kart A');
    expect(activitySummary('mention', { cardTitle: 'Yorum karti' })).toContain('Yorum karti');
    expect(activitySummary('comment_reply', { title: 'Takip edilen kart' })).toContain(
      'Takip edilen kart',
    );
    expect(activitySummary('watched_activity', { title: 'Aktivite karti' })).toContain(
      'Aktivite karti',
    );
    expect(activitySummary('checklist_item_completed', { title: 'Checklist karti' })).toContain(
      'Checklist karti',
    );
  });

  it('keeps DEM-93 activity aliases supported for older payloads', () => {
    expect(activitySummary('card.member_added', { cardTitle: 'Eski kart' })).toContain(
      'Eski kart',
    );
    expect(activitySummary('comment.created', { cardTitle: 'Yorum' })).toContain('Yorum');
    expect(activitySummary('due_reminder_1h', { cardTitle: 'Due' })).toContain('Due');
  });
});
