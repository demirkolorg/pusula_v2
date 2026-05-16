/**
 * Unit tests for the Faz 11C (DEM-149) `maybeEnqueueAttachmentCleanup`
 * helper. Mirrors the shape of the realtime/notification publish helpers —
 * a pure null-check guard around a host-supplied closure.
 */
import { describe, expect, it, vi } from 'vitest';
import { maybeEnqueueAttachmentCleanup } from './attachment-cleanup';

describe('maybeEnqueueAttachmentCleanup', () => {
  it('calls the host enqueue when input + hook are present', () => {
    const enqueue = vi.fn();
    const ctx = { enqueueAttachmentCleanup: enqueue };
    maybeEnqueueAttachmentCleanup(ctx, { attachmentId: 'a-1', storageKey: 'k-1' });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({ attachmentId: 'a-1', storageKey: 'k-1' });
  });

  it('is a no-op when the host omitted the hook (tests / Next route handlers)', () => {
    expect(() =>
      maybeEnqueueAttachmentCleanup({}, { attachmentId: 'a-2', storageKey: 'k-2' }),
    ).not.toThrow();
  });

  it('is a no-op when input is undefined (defensive null-guard)', () => {
    const enqueue = vi.fn();
    const ctx = { enqueueAttachmentCleanup: enqueue };
    maybeEnqueueAttachmentCleanup(ctx, undefined);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('swallows promise return values — fire-and-forget contract', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const ctx = { enqueueAttachmentCleanup: enqueue };
    expect(() =>
      maybeEnqueueAttachmentCleanup(ctx, { attachmentId: 'a-3', storageKey: 'k-3' }),
    ).not.toThrow();
    // Promise still queued for the host — caller doesn't await.
    await Promise.resolve();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
