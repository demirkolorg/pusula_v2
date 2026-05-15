import { describe, expect, it } from 'vitest';
import { compactionJobId, notificationPublishJobId, realtimePublishJobId } from './bullmq-job-ids';

describe('BullMQ job ids', () => {
  it('avoids the Redis key separator in custom job ids', () => {
    expect(realtimePublishJobId('event:1')).toBe('publish-event%3A1');
    expect(notificationPublishJobId('activity:1')).toBe('notify-activity%3A1');
    expect(compactionJobId({ kind: 'list', listId: 'list:1' })).toBe('compaction-list-list%3A1');
    expect(compactionJobId({ kind: 'board', boardId: 'board:1' })).toBe(
      'compaction-board-board%3A1',
    );
  });
});
