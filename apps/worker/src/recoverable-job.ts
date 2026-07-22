/**
 * BullMQ custom job ids debounce active/waiting work, but a retained
 * completed/failed job with the same id must not block recovery of a DB row
 * that is still pending. The database `processed_at` column is the durable
 * idempotency anchor; this helper only revives a stale queue handoff.
 */
export interface RecoverableJob {
  getState: () => Promise<string>;
  remove: () => Promise<void>;
}

export interface RecoverableQueue<TData> {
  getJob: (jobId: string) => Promise<RecoverableJob | undefined>;
  add: (name: string, data: TData, options: { jobId: string }) => Promise<unknown>;
}

export async function enqueueRecoverableJob<TData>(
  queue: RecoverableQueue<TData>,
  name: string,
  data: TData,
  jobId: string,
): Promise<void> {
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== 'completed' && state !== 'failed') {
      // Waiting/delayed/active jobs already owe this handoff.
      return;
    }
    // The caller reached us only because the DB outbox row is still pending.
    // Therefore a completed/failed queue record is stale and safe to revive.
    await existing.remove();
  }

  await queue.add(name, data, { jobId });
}
