import { z } from 'zod';
import { AVATAR_IMAGE_MAX_BYTES, AVATAR_IMAGE_MIME_TYPES } from '../constants';
import { nameSchema, passwordSchema } from './auth';

/**
 * Self-service account schemas — the contract for the web (and later mobile)
 * "profile / account settings" screen. These don't go through tRPC: name/avatar
 * and password are handled by Better Auth's own endpoints (`/api/auth/*`), and
 * account deletion by Better Auth's `deleteUser` flow (with a `beforeDelete`
 * hook on the server). Keeping the shapes here lets every client validate the
 * same rules. See `docs/architecture/07-auth.md` (Profil & hesap yönetimi),
 * `docs/architecture/08-web-ve-mobil.md` §8.1.7 and
 * `docs/domain/02-yetkilendirme-kurallari.md` (Hesap (User) — öz-yönetim).
 */

/** Display name — same rule as sign-up (`auth.ts` `nameSchema`: trimmed, 1..80). */
export const userNameSchema = nameSchema;

/**
 * Avatar URL. Two ways to set an avatar: a direct file upload (DEM-160 — see
 * `avatarUploadInitiateInput` below) or pasting a plain `http(s)` URL, which
 * stays an optional fallback. Either way `users.image` ends up holding an
 * `http(s)` URL — for an upload it's the public MinIO object URL, which still
 * satisfies this schema. An empty value clears the avatar; the screen sends
 * `null` for "no avatar", so the schema itself only validates a non-empty URL.
 *
 * Only `http(s)` is allowed — `javascript:` / `data:` / `file:` etc. are
 * rejected so a stored value can't turn into a script sink once it's rendered as
 * `<img src>` / `<a href>` (defense in depth; the server re-validates via Better
 * Auth's `databaseHooks.user.update.before` — see `apps/api/src/auth.ts`).
 */
export const userImageUrlSchema = z
  .string()
  .trim()
  .max(2048, 'Bağlantı çok uzun')
  .pipe(z.url('Geçerli bir bağlantı girin'))
  // Only `http(s)`: among valid URLs the dangerous schemes (`javascript:`,
  // `data:`, `file:`, …) never start with `http://` / `https://`, so this is a
  // strict allow-list without needing a runtime `URL` parser (this package has
  // no DOM/Node lib in scope).
  .refine((value) => /^https?:\/\//i.test(value), {
    message: 'Yalnızca http(s) bağlantısı geçerli',
  });

/** Update name + avatar via Better Auth `updateUser`. `image: null` clears the avatar. */
export const updateProfileInput = z.object({
  name: userNameSchema,
  image: userImageUrlSchema.nullable(),
});

/** MIME type accepted for an avatar upload (DEM-160 — `image/jpeg|png|webp`). */
export const avatarImageMimeTypeSchema = z.enum(AVATAR_IMAGE_MIME_TYPES);

/**
 * Input for `user.initiateAvatarUpload` (DEM-160). The client declares the
 * file's MIME type + byte size; the server validates against the avatar
 * allowlist, mints a presigned PUT URL for an `avatars/{userId}/{uuid}.{ext}`
 * key and returns the eventual public URL. There is no second "commit" call —
 * once the PUT succeeds the client writes the public URL via Better Auth's
 * `updateUser` (see `docs/architecture/09-depolama-ve-arama.md` §9.1.1).
 *
 * `size` is bounded here *and* re-bound by the presigned `Content-Length`
 * signature so a caller can't request a tiny presign then PUT a huge body.
 */
export const avatarUploadInitiateInput = z.object({
  mimeType: avatarImageMimeTypeSchema,
  size: z.number().int().positive().max(AVATAR_IMAGE_MAX_BYTES),
});

/**
 * Change password via Better Auth `changePassword` (which verifies
 * `currentPassword` server-side). The new password follows the sign-up rule
 * (`passwordSchema`: 8..128) and must differ from the current one.
 */
export const changePasswordInput = z
  .object({
    currentPassword: z.string().min(1, 'Mevcut parolanızı girin'),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'Yeni parola eskisinden farklı olmalı',
    path: ['newPassword'],
  });

/**
 * Delete the account via Better Auth `deleteUser`. A credential account requires
 * the password as a re-auth confirmation. Whether deletion is *allowed* is a
 * separate domain rule — see `canDeleteOwnAccount` in `../permissions`.
 */
export const deleteAccountInput = z.object({
  password: z.string().min(1, 'Parolanızı girin'),
});

export type UpdateProfileInput = z.infer<typeof updateProfileInput>;
export type AvatarUploadInitiateInput = z.infer<typeof avatarUploadInitiateInput>;
export type ChangePasswordInput = z.infer<typeof changePasswordInput>;
export type DeleteAccountInput = z.infer<typeof deleteAccountInput>;
