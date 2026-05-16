/**
 * User / self-service account router.
 *
 * Avatar upload (DEM-160 — karar 2026-05-16):
 *  - `initiateAvatarUpload({ mimeType, size })` validates the file against the
 *    avatar allowlist, mints a presigned PUT URL for an
 *    `avatars/{userId}/{uuid}.{ext}` key and returns the eventual **public**
 *    URL. The client uploads directly to MinIO/S3 and then persists the public
 *    URL via Better Auth's `updateUser` — there is no second "commit" call
 *    (an avatar has no activity / realtime / notification side effects).
 *
 * Name / avatar-URL / password / account-deletion still go through Better
 * Auth's own endpoints (`/api/auth/*`), not tRPC — see `routers/auth.ts` and
 * `docs/architecture/07-auth.md`. This router only owns the avatar *upload*
 * presign step, which needs the object storage client.
 *
 * See `docs/architecture/09-depolama-ve-arama.md` §9.1.1.
 */
import { AVATAR_IMAGE_EXTENSIONS, avatarUploadInitiateInput } from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import type { ObjectStorage } from '../lib/object-storage';
import { protectedProcedure, router } from '../trpc';

/** Presigned PUT URL TTL, mirrored as `expiresAt` on the initiate response. */
const PRESIGN_PUT_TTL_MS = 10 * 60 * 1000;

// ───────────────────────────────────────────────────────────────────────────
// initiateAvatarUpload per-user rate limit — mirrors `attachment.initiate`
// ───────────────────────────────────────────────────────────────────────────
/**
 * Every `initiateAvatarUpload` call mints a MinIO presigned signature; without
 * a cap a user could flood storage with orphan avatar objects. Narrow in-memory
 * per-user token bucket — 10 presigns/min is far more than a human re-picking
 * an avatar needs.
 *
 * V1 limitation: in-memory state assumes a single API instance; a multi-
 * instance deploy must move this to Redis (Faz 8 hardening), same as the
 * attachment limiter. The map is bounded by the active-user count.
 */
const INITIATE_RATE_LIMIT = { max: 10, windowMs: 60_000 };
/** Exported for test isolation only (`beforeEach(() => avatarInitiateRateState.clear())`). */
export const avatarInitiateRateState = new Map<string, { count: number; windowStart: number }>();
function checkAvatarInitiateRateLimit(userId: string): void {
  const now = Date.now();
  const entry = avatarInitiateRateState.get(userId);
  if (!entry || now - entry.windowStart >= INITIATE_RATE_LIMIT.windowMs) {
    avatarInitiateRateState.set(userId, { count: 1, windowStart: now });
    return;
  }
  if (entry.count >= INITIATE_RATE_LIMIT.max) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Cok fazla yukleme istegi. Lutfen biraz bekleyin.',
    });
  }
  entry.count += 1;
}

function requireObjectStorage(ctx: { objectStorage?: ObjectStorage }): ObjectStorage {
  if (!ctx.objectStorage) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Dosya depolama servisi yapilandirilmamis.',
    });
  }
  return ctx.objectStorage;
}

export const userRouter = router({
  /**
   * Reserve a presigned PUT URL for the caller's own avatar. The storage key
   * is `avatars/{userId}/{uuid}.{ext}` — server-generated, so a user can only
   * ever write to their own avatar path. The presigned signature binds the
   * exact key, `Content-Type` and `Content-Length`, so the 10 MiB Zod cap is
   * also enforced at the storage layer (security parity with `attachment`).
   *
   * No DB row is written — avatar metadata is the `users.image` column, set
   * by the client via Better Auth `updateUser` once the PUT succeeds.
   */
  initiateAvatarUpload: protectedProcedure
    .input(avatarUploadInitiateInput)
    .mutation(async ({ ctx, input }) => {
      checkAvatarInitiateRateLimit(ctx.session.user.id);
      const objectStorage = requireObjectStorage(ctx);

      const ext = AVATAR_IMAGE_EXTENSIONS[input.mimeType];
      const objectKey = `avatars/${ctx.session.user.id}/${crypto.randomUUID()}.${ext}`;

      const upload = await objectStorage.createPresignedPutUrl({
        key: objectKey,
        contentType: input.mimeType,
        contentLength: input.size,
      });

      return {
        upload,
        objectKey,
        publicUrl: objectStorage.publicUrl(objectKey),
        expiresAt: new Date(Date.now() + PRESIGN_PUT_TTL_MS),
      };
    }),
});
