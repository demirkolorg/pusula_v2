import type { EntitySummaryData } from '../micro/entity-summary';

export const entitySummaryCardFixture: EntitySummaryData = {
  kind: 'card',
  id: 'card-1',
  title: 'API tasarımı kararlaştır',
  description: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Bu kart tRPC sözleşmesini netleştirmek için açıldı.' }],
      },
    ],
  },
  archivedAt: null,
  counts: { members: 2, labels: 3 },
  members: [
    { userId: 'u-1', role: 'assignee' },
    { userId: 'u-2', role: 'watcher' },
  ],
};

export const entitySummaryBoardFixture: EntitySummaryData = {
  kind: 'board',
  id: 'board-1',
  title: 'Ürün Sprint 23',
  description: null,
  archivedAt: null,
  counts: { lists: 4, cards: 28, labels: 6 },
};
