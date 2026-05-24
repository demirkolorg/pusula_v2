import type { ActivityTimelineData } from '../micro/activity-timeline';

export const activityTimelineFixture: ActivityTimelineData = {
  totalCount: 4,
  events: [
    {
      id: '1',
      type: 'card.created',
      actorId: 'u-1',
      createdAt: '2026-05-22T10:30:00Z',
      cardId: 'c-1',
      boardId: 'b-1',
    },
    {
      id: '2',
      type: 'card.moved',
      actorId: 'u-2',
      createdAt: '2026-05-22T11:15:00Z',
      cardId: 'c-1',
      boardId: 'b-1',
    },
    {
      id: '3',
      type: 'comment.created',
      actorId: 'u-1',
      createdAt: '2026-05-22T14:20:00Z',
      cardId: 'c-1',
      boardId: 'b-1',
    },
    {
      id: '4',
      type: 'card.completed',
      actorId: 'u-3',
      createdAt: '2026-05-23T09:00:00Z',
      cardId: 'c-1',
      boardId: 'b-1',
    },
  ],
};

export const activityTimelineEmptyFixture: ActivityTimelineData = {
  totalCount: 0,
  events: [],
};
