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
