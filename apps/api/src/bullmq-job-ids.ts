import type { CompactionScope } from '@pusula/api';

function bullmqJobId(prefix: string, ...parts: readonly string[]): string {
  return [prefix, ...parts.map((part) => encodeURIComponent(part))].join('-');
}

export function realtimePublishJobId(eventId: string): string {
  return bullmqJobId('publish', eventId);
}

export function notificationPublishJobId(eventId: string): string {
  return bullmqJobId('notify', eventId);
}

export function compactionJobId(scope: CompactionScope): string {
  const scopeId = scope.kind === 'list' ? scope.listId : scope.boardId;
  return bullmqJobId('compaction', scope.kind, scopeId);
}

/**
 * Faz 11C (DEM-149) — `pusula-attachment-cleanup` job id. Per-attachment
 * debounce: BullMQ ignores a duplicate `jobId` while one is still waiting,
 * so a duplicate enqueue (mutation + sweeper-recover) collapses naturally.
 * Mirrors the `cleanup-{id}` shape used in the worker queue's `jobId`s.
 */
export function attachmentCleanupJobId(attachmentId: string): string {
  return bullmqJobId('cleanup', attachmentId);
}
