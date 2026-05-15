import { describe, expect, it } from 'vitest';
import { groupNotificationsByDate, type NotificationRow } from './notification-types';

function row(id: string, createdAt: Date | string): NotificationRow {
  return {
    id,
    recipientId: 'user_1',
    actorId: 'actor_1',
    type: 'card.member_added',
    workspaceId: 'ws1',
    boardId: 'b1',
    cardId: 'c1',
    payload: {},
    readAt: null,
    createdAt,
  } as NotificationRow;
}

describe('groupNotificationsByDate', () => {
  const now = new Date('2026-05-15T12:00:00.000Z');

  it('returns an empty array when there are no notifications', () => {
    expect(groupNotificationsByDate([], now)).toEqual([]);
  });

  it('groups notifications into today / yesterday / thisWeek / earlier buckets in order', () => {
    const items = [
      row('today-1', new Date('2026-05-15T08:00:00.000Z')),
      row('yesterday-1', new Date('2026-05-14T20:00:00.000Z')),
      row('thisWeek-1', new Date('2026-05-12T10:00:00.000Z')),
      row('earlier-1', new Date('2026-04-30T10:00:00.000Z')),
    ];

    const groups = groupNotificationsByDate(items, now);

    expect(groups.map((group) => group.key)).toEqual([
      'today',
      'yesterday',
      'thisWeek',
      'earlier',
    ]);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ['today-1'],
      ['yesterday-1'],
      ['thisWeek-1'],
      ['earlier-1'],
    ]);
  });

  it('skips groups with no notifications', () => {
    const items = [
      row('today-1', new Date('2026-05-15T08:00:00.000Z')),
      row('earlier-1', new Date('2026-04-30T10:00:00.000Z')),
    ];

    const groups = groupNotificationsByDate(items, now);

    expect(groups.map((group) => group.key)).toEqual(['today', 'earlier']);
  });

  it('preserves the incoming order inside each group', () => {
    const items = [
      row('today-2', new Date('2026-05-15T09:00:00.000Z')),
      row('today-1', new Date('2026-05-15T11:30:00.000Z')),
      row('today-3', new Date('2026-05-15T07:00:00.000Z')),
    ];

    const groups = groupNotificationsByDate(items, now);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(['today-2', 'today-1', 'today-3']);
  });

  it('treats an invalid date as the earlier bucket', () => {
    const items = [row('broken', 'not-a-date')];

    const groups = groupNotificationsByDate(items, now);

    expect(groups).toEqual([{ key: 'earlier', items: [items[0]] }]);
  });
});
