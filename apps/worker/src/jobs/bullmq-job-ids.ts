function bullmqJobId(prefix: string, id: string): string {
  return `${prefix}-${encodeURIComponent(id)}`;
}

export function realtimePublishJobId(eventId: string): string {
  return bullmqJobId('publish', eventId);
}

export function notificationPublishJobId(eventId: string): string {
  return bullmqJobId('notify', eventId);
}

export function notificationEmailJobId(outboxId: string): string {
  return bullmqJobId('email', outboxId);
}

export function notificationPushJobId(outboxId: string): string {
  return bullmqJobId('push', outboxId);
}
