import { describe, expect, it, vi } from 'vitest';
import { enqueueRecoverableJob, type RecoverableQueue } from './recoverable-job';

function queueWithExisting(state?: string) {
  const remove = vi.fn(async () => {});
  const add = vi.fn(async () => ({}));
  const getJob = vi.fn(async () =>
    state
      ? {
          getState: async () => state,
          remove,
        }
      : undefined,
  );
  const queue: RecoverableQueue<{ outboxId: string }> = { getJob, add };
  return { queue, getJob, add, remove };
}

describe('enqueueRecoverableJob', () => {
  it('adds a new deterministic job when no queue record exists', async () => {
    const { queue, add, remove } = queueWithExisting();
    await enqueueRecoverableJob(queue, 'notification-push', { outboxId: 'o1' }, 'push-o1');
    expect(remove).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith('notification-push', { outboxId: 'o1' }, { jobId: 'push-o1' });
  });

  it.each(['waiting', 'delayed', 'active'])('keeps an existing %s job', async (state) => {
    const { queue, add, remove } = queueWithExisting(state);
    await enqueueRecoverableJob(queue, 'notification-push', { outboxId: 'o1' }, 'push-o1');
    expect(remove).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it.each(['completed', 'failed'])('revives a retained %s job', async (state) => {
    const { queue, add, remove } = queueWithExisting(state);
    await enqueueRecoverableJob(queue, 'notification-push', { outboxId: 'o1' }, 'push-o1');
    expect(remove).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
  });
});
