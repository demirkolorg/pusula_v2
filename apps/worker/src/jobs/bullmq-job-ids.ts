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

/**
 * Faz 11C (DEM-149) — per-attachment debounce for the `pusula-attachment-
 * cleanup` queue. Same shape as the producer-side helper in `apps/api/src/
 * bullmq-job-ids.ts` (string duplicated here to keep `apps/worker` free of
 * the API host's bullmq-job-ids module).
 */
export function attachmentCleanupJobId(attachmentId: string): string {
  return bullmqJobId('cleanup', attachmentId);
}
