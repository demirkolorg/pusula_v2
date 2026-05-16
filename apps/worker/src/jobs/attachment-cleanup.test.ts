/**
 * Unit tests for the Faz 11C (DEM-149) attachment-cleanup processor.
 *
 * The processor is intentionally DB-free (the DB row is already gone by the
 * time the job runs — the sweeper handles the orphan path separately), so
 * these tests run without Postgres. A fake `AttachmentObjectStorage` records
 * delete calls and lets us assert idempotency on `NoSuchKey`-style errors.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ATTACHMENT_CLEANUP_RETRY_POLICY,
  isObjectMissingError,
  processAttachmentCleanupJob,
  s3DeleteObjectAdapter,
  type AttachmentObjectStorage,
} from './attachment-cleanup';

function fakeStorage(behaviour?: {
  throwError?: unknown;
}): AttachmentObjectStorage & { calls: Array<{ bucket: string; key: string }> } {
  const calls: Array<{ bucket: string; key: string }> = [];
  return {
    calls,
    async deleteObject(input) {
      calls.push(input);
      if (behaviour?.throwError) throw behaviour.throwError;
    },
  };
}

describe('processAttachmentCleanupJob', () => {
  it('calls DeleteObject with the configured bucket + storageKey from the payload', async () => {
    const storage = fakeStorage();
    const result = await processAttachmentCleanupJob(storage, 'pusula', {
      attachmentId: 'a-1',
      storageKey: 'boards/b-1/cards/c-1/uuid-photo.png',
    });
    expect(result).toEqual({ deleted: true });
    expect(storage.calls).toEqual([
      { bucket: 'pusula', key: 'boards/b-1/cards/c-1/uuid-photo.png' },
    ]);
  });

  it('propagates real S3 failures so BullMQ can retry the job', async () => {
    const fault = Object.assign(new Error('boom'), {
      name: 'ServiceUnavailable',
      $metadata: { httpStatusCode: 503 },
    });
    const storage = fakeStorage({ throwError: fault });
    await expect(
      processAttachmentCleanupJob(storage, 'pusula', {
        attachmentId: 'a-2',
        storageKey: 'k',
      }),
    ).rejects.toBe(fault);
  });

  it('end-to-end idempotent: NoSuchKey from the SDK still resolves the job as deleted', async () => {
    // The adapter swallows `NoSuchKey`, so the processor — driven through the
    // *real* `s3DeleteObjectAdapter` — must report success even though the
    // underlying object was already gone (BullMQ retry / duplicate delivery).
    const missing = Object.assign(new Error('not here'), { name: 'NoSuchKey' });
    const send = vi.fn().mockRejectedValue(missing);
    const adapter = s3DeleteObjectAdapter(
      { send } as unknown as Parameters<typeof s3DeleteObjectAdapter>[0],
    );
    const result = await processAttachmentCleanupJob(adapter, 'pusula', {
      attachmentId: 'a-3',
      storageKey: 'boards/b/cards/c/uuid-gone.pdf',
    });
    expect(result).toEqual({ deleted: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a re-delivered job (BullMQ retry of an already-cleaned object) is a no-op success', async () => {
    // Simulate the same job processed twice: first run deletes, second run
    // sees `NoSuchKey`. Both report `{ deleted: true }` — idempotent.
    let firstCall = true;
    const send = vi.fn().mockImplementation(() => {
      if (firstCall) {
        firstCall = false;
        return Promise.resolve({});
      }
      return Promise.reject(Object.assign(new Error('gone'), { name: 'NoSuchKey' }));
    });
    const adapter = s3DeleteObjectAdapter(
      { send } as unknown as Parameters<typeof s3DeleteObjectAdapter>[0],
    );
    const data = { attachmentId: 'a-4', storageKey: 'k-retry' };
    const first = await processAttachmentCleanupJob(adapter, 'pusula', data);
    const second = await processAttachmentCleanupJob(adapter, 'pusula', data);
    expect(first).toEqual({ deleted: true });
    expect(second).toEqual({ deleted: true });
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('s3DeleteObjectAdapter', () => {
  function fakeS3Client(send: ReturnType<typeof vi.fn>) {
    return { send } as unknown as Parameters<typeof s3DeleteObjectAdapter>[0];
  }

  it('forwards bucket/key to DeleteObjectCommand and resolves on success', async () => {
    const send = vi.fn().mockResolvedValue({});
    const adapter = s3DeleteObjectAdapter(fakeS3Client(send));
    await adapter.deleteObject({ bucket: 'b', key: 'k' });
    expect(send).toHaveBeenCalledTimes(1);
    const cmd = (send.mock.calls[0]![0] as { input: { Bucket: string; Key: string } }).input;
    expect(cmd.Bucket).toBe('b');
    expect(cmd.Key).toBe('k');
  });

  it('swallows NoSuchKey — idempotent for already-gone objects', async () => {
    const missing = Object.assign(new Error('not here'), { name: 'NoSuchKey' });
    const send = vi.fn().mockRejectedValue(missing);
    const adapter = s3DeleteObjectAdapter(fakeS3Client(send));
    await expect(adapter.deleteObject({ bucket: 'b', key: 'k' })).resolves.toBeUndefined();
  });

  it('swallows HTTP 404 NotFound responses', async () => {
    const notFound = Object.assign(new Error('404'), {
      name: 'NotFound',
      $metadata: { httpStatusCode: 404 },
    });
    const send = vi.fn().mockRejectedValue(notFound);
    const adapter = s3DeleteObjectAdapter(fakeS3Client(send));
    await expect(adapter.deleteObject({ bucket: 'b', key: 'k' })).resolves.toBeUndefined();
  });

  it('rethrows transient (non-404) failures so the processor lets BullMQ retry', async () => {
    const fault = Object.assign(new Error('boom'), {
      name: 'ServiceUnavailable',
      $metadata: { httpStatusCode: 503 },
    });
    const send = vi.fn().mockRejectedValue(fault);
    const adapter = s3DeleteObjectAdapter(fakeS3Client(send));
    await expect(adapter.deleteObject({ bucket: 'b', key: 'k' })).rejects.toBe(fault);
  });
});

describe('ATTACHMENT_CLEANUP_RETRY_POLICY', () => {
  it('declares 3 attempts with exponential backoff (DEM-149 spec)', () => {
    expect(ATTACHMENT_CLEANUP_RETRY_POLICY.attempts).toBe(3);
    expect(ATTACHMENT_CLEANUP_RETRY_POLICY.backoff).toEqual({
      type: 'exponential',
      delay: 1_000,
    });
  });

  it('keeps failed jobs 7 days for dead-letter inspection', () => {
    // After the 3rd failed attempt the job lands on the failed list; a 7-day
    // retention window lets an operator inspect / manually redrive it.
    expect(ATTACHMENT_CLEANUP_RETRY_POLICY.removeOnFail).toEqual({
      age: 60 * 60 * 24 * 7,
    });
  });

  it('prunes completed jobs after 1 day (bounded queue growth)', () => {
    expect(ATTACHMENT_CLEANUP_RETRY_POLICY.removeOnComplete).toEqual({
      age: 60 * 60 * 24,
      count: 1_000,
    });
  });
});

describe('isObjectMissingError', () => {
  it('matches `NoSuchKey` / `NotFound` name or Code shapes', () => {
    expect(isObjectMissingError({ name: 'NoSuchKey' })).toBe(true);
    expect(isObjectMissingError({ name: 'NotFound' })).toBe(true);
    expect(isObjectMissingError({ Code: 'NoSuchKey' })).toBe(true);
  });

  it('matches HTTP 404 metadata regardless of name', () => {
    expect(isObjectMissingError({ name: 'X', $metadata: { httpStatusCode: 404 } })).toBe(true);
  });

  it('returns false for transient errors and primitives', () => {
    expect(isObjectMissingError({ name: 'ServiceUnavailable' })).toBe(false);
    expect(isObjectMissingError({ $metadata: { httpStatusCode: 500 } })).toBe(false);
    expect(isObjectMissingError(null)).toBe(false);
    expect(isObjectMissingError(undefined)).toBe(false);
    expect(isObjectMissingError('boom')).toBe(false);
  });
});
