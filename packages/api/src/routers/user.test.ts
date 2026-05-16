/**
 * Unit tests for the user router — `initiateAvatarUpload` (DEM-160).
 *
 * No database: `initiateAvatarUpload` never touches `ctx.db` (avatar metadata
 * is the `users.image` column, written by the client via Better Auth), so the
 * context is built with a stub `db` and the suite runs without infra.
 */
import type { Database } from '@pusula/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContext } from '../context';
import { appRouter } from '../root';
import { createCallerFactory } from '../trpc';
import { avatarInitiateRateState } from './user';

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function fakeObjectStorage() {
  return {
    createPresignedPutUrl: vi.fn(
      async (input: { key: string; contentType: string; contentLength: number }) => ({
        url: 'https://storage.test/put',
        headers: {
          'content-type': input.contentType,
          'content-length': String(input.contentLength),
        },
      }),
    ),
    createPresignedGetUrl: vi.fn(async () => 'https://storage.test/get'),
    publicUrl: vi.fn((key: string) => `https://storage.test/public/${key}`),
  };
}

interface CallerOpts {
  objectStorage?: ReturnType<typeof fakeObjectStorage> | undefined;
  anonymous?: boolean;
}

function callerFor(userId: string, opts: CallerOpts = {}) {
  const create = createCallerFactory(appRouter);
  return create(
    createContext({
      session: opts.anonymous ? null : session(userId),
      // `initiateAvatarUpload` never queries the db — a stub keeps the suite
      // infra-free.
      db: {} as Database,
      objectStorage:
        'objectStorage' in opts ? opts.objectStorage : fakeObjectStorage(),
    }),
  );
}

afterEach(() => {
  avatarInitiateRateState.clear();
});

describe('user.initiateAvatarUpload', () => {
  it('returns a presigned PUT URL + public URL for an avatars/{userId} key', async () => {
    const storage = fakeObjectStorage();
    const result = await callerFor('u-1', { objectStorage: storage }).user.initiateAvatarUpload({
      mimeType: 'image/png',
      size: 4096,
    });

    expect(result.objectKey).toMatch(
      /^avatars\/u-1\/[0-9a-f-]{36}\.png$/,
    );
    expect(result.upload.url).toBe('https://storage.test/put');
    expect(result.publicUrl).toBe(`https://storage.test/public/${result.objectKey}`);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(storage.createPresignedPutUrl).toHaveBeenCalledWith({
      key: result.objectKey,
      contentType: 'image/png',
      contentLength: 4096,
    });
  });

  it('maps the MIME type to the right key extension', async () => {
    const jpeg = await callerFor('u-2').user.initiateAvatarUpload({
      mimeType: 'image/jpeg',
      size: 100,
    });
    expect(jpeg.objectKey.endsWith('.jpg')).toBe(true);

    const webp = await callerFor('u-2').user.initiateAvatarUpload({
      mimeType: 'image/webp',
      size: 100,
    });
    expect(webp.objectKey.endsWith('.webp')).toBe(true);
  });

  it('scopes the storage key to the caller — distinct keys per call', async () => {
    const a = await callerFor('u-3').user.initiateAvatarUpload({ mimeType: 'image/png', size: 1 });
    const b = await callerFor('u-3').user.initiateAvatarUpload({ mimeType: 'image/png', size: 1 });
    expect(a.objectKey).not.toBe(b.objectKey);
    expect(a.objectKey.startsWith('avatars/u-3/')).toBe(true);
  });

  it('rejects an anonymous caller', async () => {
    await expect(
      callerFor('nobody', { anonymous: true }).user.initiateAvatarUpload({
        mimeType: 'image/png',
        size: 100,
      }),
    ).rejects.toThrow();
  });

  it('rejects a MIME type outside the avatar allowlist', async () => {
    await expect(
      callerFor('u-4').user.initiateAvatarUpload({
        // Cast: an out-of-allowlist value the schema must reject.
        mimeType: 'image/gif' as 'image/png',
        size: 100,
      }),
    ).rejects.toThrow();
  });

  it('errors when object storage is not configured', async () => {
    await expect(
      callerFor('u-5', { objectStorage: undefined }).user.initiateAvatarUpload({
        mimeType: 'image/png',
        size: 100,
      }),
    ).rejects.toThrow(/depolama/i);
  });

  it('rate-limits a caller after 10 presigns within the window', async () => {
    const caller = callerFor('u-6');
    for (let i = 0; i < 10; i += 1) {
      await caller.user.initiateAvatarUpload({ mimeType: 'image/png', size: 100 });
    }
    await expect(
      caller.user.initiateAvatarUpload({ mimeType: 'image/png', size: 100 }),
    ).rejects.toThrow();
  });
});
