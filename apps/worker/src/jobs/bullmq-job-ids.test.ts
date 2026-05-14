import { describe, expect, it } from 'vitest';
import {
  notificationEmailJobId,
  notificationPublishJobId,
  notificationPushJobId,
  realtimePublishJobId,
} from './bullmq-job-ids';

describe('BullMQ job ids', () => {
  it('avoids the Redis key separator in custom job ids', () => {
    expect(realtimePublishJobId('event:1')).toBe('publish-event%3A1');
    expect(notificationPublishJobId('activity:1')).toBe('notify-activity%3A1');
    expect(notificationEmailJobId('outbox:1')).toBe('email-outbox%3A1');
    expect(notificationPushJobId('outbox:1')).toBe('push-outbox%3A1');
  });
});
