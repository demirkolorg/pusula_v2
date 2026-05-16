/**
 * Push-token input schemas (Faz 6B — DEM-91).
 *
 * Mobile clients call `push.tokens.register` after Expo Notifications hands
 * them a device token; the token has a strict shape (`ExponentPushToken[xxx]`
 * or the legacy `ExpoPushToken[xxx]` form) which we re-validate server-side
 * so a misconfigured client can't pollute the table with garbage that the
 * Expo Push API will later reject. Web clients can also register tokens
 * (`platform: 'web'`) for Expo's web push support, even though Faz 6 ships
 * push-backend-only (the real mobile wiring lands in Faz 7).
 *
 * The schemas live in `@pusula/domain` so both the tRPC procedure
 * (`packages/api/src/routers/push.ts`) and any future mobile client can
 * import the same Zod object — single source of truth.
 *
 * Schema details:
 *  - `token` matches `Exp(onent)?PushToken[...]` — anchored, non-empty body.
 *    A typo or random string is rejected with the Turkish error message
 *    ("Geçersiz Expo push token formatı").
 *  - `platform` is one of `'ios' | 'android' | 'web'` (matches the DB
 *    `push_tokens_platform_check` constraint — keep them in sync).
 *  - `deviceName` is an optional human label (≤120 chars) shown in the
 *    "logged-in devices" list (Faz 7); we cap it instead of leaving it
 *    free-form so a malicious or buggy client can't park megabytes there.
 */
import { z } from 'zod';

/**
 * Allowed platforms for a push token row. Mirrors the DB CHECK constraint in
 * migration `0010_dem91_push_tokens` — keep in sync.
 */
export const PUSH_TOKEN_PLATFORMS = ['ios', 'android', 'web'] as const;
export type PushTokenPlatform = (typeof PUSH_TOKEN_PLATFORMS)[number];

/**
 * Expo push token format: `ExponentPushToken[...]` (current) or
 * `ExpoPushToken[...]` (legacy). Anchored so a token-shaped substring
 * embedded in junk is rejected.
 */
export const expoPushTokenSchema = z
  .string()
  .regex(/^Expo(nent)?PushToken\[[^\]]+\]$/, { message: 'Geçersiz Expo push token formatı.' });

export const pushTokenPlatformSchema = z.enum(PUSH_TOKEN_PLATFORMS);

export const registerPushTokenInput = z.object({
  token: expoPushTokenSchema,
  platform: pushTokenPlatformSchema,
  /** Optional human label ("Abdullah'ın iPhone"); cap to keep the row sane. */
  deviceName: z.string().min(1).max(120).optional(),
});

export const revokePushTokenInput = z.object({
  token: expoPushTokenSchema,
});

/**
 * Faz 10E (DEM-139) — bildirim ayar ekranı "Cihazlar" section'ı için id-tabanlı
 * revoke. `push.tokens.list` privacy nedeniyle ham token string'ini hiçbir
 * zaman dönmediğinden web istemci, satırı tablo `id`'siyle iptal eder.
 * Mobil istemci (Faz 7) logout akışında elindeki token'ı verdiği için
 * `revokePushTokenInput`'i kullanmaya devam eder; iki şema aynı tablo üstünde
 * farklı anahtarlarla aynı `revoked_at = NOW()` damgasını basar.
 *
 * `id` formatı — Postgres `gen_random_uuid()` veya `nanoid` benzeri opak string;
 * boyut/karakter sınırı yok (validation procedure'de UNAUTHORIZED+ownership ile
 * çözülür, Zod sadece tip garantisi sağlar).
 */
export const revokePushTokenByIdInput = z.object({
  id: z.string().min(1, { message: 'Token kimliği boş olamaz.' }),
});

export type RegisterPushTokenInput = z.infer<typeof registerPushTokenInput>;
export type RevokePushTokenInput = z.infer<typeof revokePushTokenInput>;
export type RevokePushTokenByIdInput = z.infer<typeof revokePushTokenByIdInput>;
