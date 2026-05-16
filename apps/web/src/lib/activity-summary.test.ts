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
    expect(activitySummary('card.member_added', { cardTitle: 'Eski kart' })).toContain('Eski kart');
    expect(activitySummary('comment.created', { cardTitle: 'Yorum' })).toContain('Yorum');
    expect(activitySummary('due_reminder_1h', { cardTitle: 'Due' })).toContain('Due');
  });

  it('DEM-152 — renders granular card-activity notification types', () => {
    expect(activitySummary('card_moved', { cardTitle: 'Taşınan' })).toContain('taşıdı');
    expect(activitySummary('card_archived', { cardTitle: 'Arşiv' })).toContain('arşivledi');
    expect(activitySummary('card_completed', { cardTitle: 'Bitti' })).toContain(
      'tamamlandı işaretledi',
    );
    expect(
      activitySummary('card_completed', {
        cardTitle: 'Geri',
        activityType: 'card.uncompleted',
      }),
    ).toContain('işaretini kaldırdı');
    expect(activitySummary('card_due_changed', { cardTitle: 'Tarih' })).toContain(
      'teslim tarihi belirledi',
    );
    expect(
      activitySummary('card_due_changed', {
        cardTitle: 'Tarih',
        activityType: 'card.due_cleared',
      }),
    ).toContain('teslim tarihini kaldırdı');
    expect(activitySummary('card_cover_changed', { cardTitle: 'Kapak' })).toContain(
      'kapağını değiştirdi',
    );
    expect(activitySummary('card_member_removed', { cardTitle: 'Çıkış' })).toContain('çıkardı');
    expect(activitySummary('attachment_added', { cardTitle: 'Dosya' })).toContain('dosya ekledi');
  });
});
