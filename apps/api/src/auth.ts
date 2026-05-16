import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { count, eq, getDb, accounts, sessions, users, verifications, workspaces } from '@pusula/db';
import { canDeleteOwnAccount, userImageUrlSchema, userNameSchema } from '@pusula/domain';
import { bootstrapNewUser } from './bootstrap';
import {
  sendNewDeviceLoginEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
} from './auth-emails';
import { env } from './env';
import { recordSessionDevice } from './known-devices';

/**
 * Better Auth instance. Self-hosted, TypeScript-first; serves its own HTTP
 * routes under `${API_URL}/api/auth/*` (mounted in `app.ts`). Authorization
 * (workspace/board/card permissions) is NOT here — it lives in the domain/API
 * layer (architecture doc §10).
 *
 * Self-service account management (name/avatar, password, account deletion) goes
 * straight to Better Auth's own endpoints — there's no tRPC `user.*` router.
 * See `docs/architecture/07-auth.md` (Profil & hesap yönetimi) and §8.1.7 of the
 * web doc. The policy we add here:
 *  - `databaseHooks.user.update.before` re-validates `name`/`image` against the
 *    `@pusula/domain` schemas server-side (Better Auth's `/update-user` body is
 *    untyped, so client-side validation alone isn't enough);
 *  - `user.deleteUser.beforeDelete` blocks deleting an account while the user
 *    still owns a workspace.
 */
export const auth = betterAuth({
  secret: env.AUTH_SECRET,
  baseURL: env.API_URL,
  trustedOrigins: [env.APP_URL],
  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),
  emailVerification: {
    sendOnSignUp: true,
    expiresIn: 60 * 60,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      void sendVerificationEmail({ to: user.email, url });
    },
  },
  emailAndPassword: {
    enabled: true,
    // Soft policy for DEM-72: unverified users can sign in and continue
    // onboarding, but the web shell shows a persistent verification banner.
    requireEmailVerification: false,
    // "Forgot password": the web app calls `authClient.requestPasswordReset({
    // email, redirectTo: '${window.location.origin}/reset-password' })` — an
    // *absolute* URL on the web app's origin. Better Auth resolves `redirectTo`
    // server-side; our `baseURL` here is `env.API_URL` (`:3001`), so a relative
    // path would point at the API server (no `/reset-password` route there).
    // Passing the absolute web URL makes Better Auth keep it as-is and call this
    // with `url` = `${APP_URL}/reset-password?token=…&callbackURL=${APP_URL}/reset-password`
    // (and `env.APP_URL` is in `trustedOrigins`, so the origin check passes).
    // Better Auth mints a one-time, ~1h token (in the `verifications` table); we
    // just mail that link via Resend. This is best-effort and never throws — see
    // `./auth-emails.ts` and `docs/architecture/07-auth.md` (Şifre sıfırlama
    // akışı). `resetPasswordTokenExpiresIn` is left at the default (1 hour).
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail({ to: user.email, url });
    },
    // When the password is actually reset, drop the user's other sessions —
    // a reset is a strong signal the old credential may be compromised.
    revokeSessionsOnPasswordReset: true,
  },
  user: {
    // Self-service account deletion (`authClient.deleteUser({ password })`).
    // No email verification step (Resend lands in Faz 6); the client re-auths
    // with the password instead. `beforeDelete` enforces the "you can't delete
    // your account while you own a workspace" rule (domain: `canDeleteOwnAccount`).
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        await assertCanDeleteAccount(user.id);
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once a day
  },
  databaseHooks: {
    user: {
      update: {
        // Server-side validation for self-service profile edits. Better Auth's
        // `/update-user` body schema is `z.record(z.string(), z.any())`, so
        // `name`/`image` aren't validated unless we do it here. Only touches the
        // two fields and only when present — internal updates (`emailVerified`,
        // session refresh, …) pass through untouched. See `@pusula/domain`
        // `userNameSchema` / `userImageUrlSchema`.
        before: async (data) => {
          const next: { name?: string; image?: string | null } = {};

          if (data.name !== undefined) {
            const parsed = userNameSchema.safeParse(data.name);
            if (!parsed.success) {
              throw new APIError('BAD_REQUEST', {
                message: parsed.error.issues[0]?.message ?? 'Geçersiz ad.',
              });
            }
            next.name = parsed.data;
          }

          if (data.image !== undefined) {
            if (data.image === null || data.image === '') {
              next.image = null;
            } else {
              const parsed = userImageUrlSchema.safeParse(data.image);
              if (!parsed.success) {
                throw new APIError('BAD_REQUEST', {
                  message: parsed.error.issues[0]?.message ?? 'Geçersiz avatar bağlantısı.',
                });
              }
              next.image = parsed.data;
            }
          }

          if (Object.keys(next).length === 0) return;
          return { data: next };
        },
      },
      create: {
        // Onboarding bootstrap: give a brand-new user a default workspace + an
        // "İlk Pano" board seeded with default lists + welcome cards, so they don't
        // land on a blank screen. Best-effort — a failure here must not fail signup,
        // so we log and move on (the user then lands on the onboarding empty state).
        // Runs after the user row is committed; see `./bootstrap.ts` and
        // `docs/architecture/08-web-ve-mobil.md` §8.1.3.
        after: async (user) => {
          try {
            await bootstrapNewUser(user.id);
          } catch (error) {
            console.error(`[auth] onboarding bootstrap failed for user ${user.id}:`, error);
          }
        },
      },
    },
    session: {
      // Faz 10I (DEM-143) — Yeni cihazdan oturum güvenlik maili. Better Auth her
      // başarılı login (e-posta+parola, OAuth, …) sonrası `sessions` satırını
      // yazar; biz burada (user_agent, IP /24 veya /48 subnet) parmak izini
      // `auth_known_devices`'a upsert ederiz. İlk görüşse Resend ile güvenlik
      // maili gönderilir — bildirim outbox'tan **bağımsız** (security mail
      // user'ın kanal tercihine bakmaz). Tamamen best-effort: helper / mail
      // başarısız olursa login akışı bozulmaz.
      //
      // Detay: `./known-devices.ts` + `./auth-emails.ts:sendNewDeviceLoginEmail`,
      // `docs/architecture/07-auth.md` (Yeni cihazda oturum maili — Faz 10I),
      // `docs/architecture/15-bildirim-ayar-ekrani.md` §15.4 Section 8.
      create: {
        after: async (session) => {
          try {
            const result = await recordSessionDevice({
              userId: session.userId,
              userAgent: session.userAgent,
              ip: session.ipAddress,
            });
            if (!result || !result.isNewDevice) return;
            const userEmail = await getUserEmail(session.userId);
            if (!userEmail) return;
            await sendNewDeviceLoginEmail({
              to: userEmail.email,
              userName: userEmail.name,
              userAgent: result.userAgentNormalized,
              ipSubnet: result.ipSubnet,
              loginAt: new Date(),
              secureAccountUrl: `${env.APP_URL}/account?tab=security`,
            });
          } catch (error) {
            console.error(
              `[auth] new-device login notification failed for session ${session.id}:`,
              error,
            );
          }
        },
      },
    },
  },
});

/**
 * Throws a user-facing `APIError` if the user still owns any workspace (archived
 * ones included) — there's no ownership transfer yet, so they must delete/archive
 * those workspaces first. `workspaces.owner_id` is `ON DELETE RESTRICT`, so the
 * DB would also reject the delete; this turns that into a clear message before it
 * gets there. Note `workspace.list` (what the web account screen reads to hint
 * this) excludes archived workspaces — the count here is the authoritative one.
 * See `@pusula/domain` `canDeleteOwnAccount` and `docs/domain/02-yetkilendirme-kurallari.md`.
 */
/**
 * Look up the user's email + display name for transactional auth mail. Returns
 * `null` if the row is missing (race against deletion) or the lookup fails —
 * the caller treats that as "skip the email" rather than throwing.
 */
async function getUserEmail(userId: string): Promise<{ email: string; name: string } | null> {
  try {
    const [row] = await getDb()
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ?? null;
  } catch (error) {
    console.error(`[auth] failed to load user ${userId} for security email:`, error);
    return null;
  }
}

async function assertCanDeleteAccount(userId: string): Promise<void> {
  const [row] = await getDb()
    .select({ value: count() })
    .from(workspaces)
    .where(eq(workspaces.ownerId, userId));
  const ownedCount = Number(row?.value ?? 0);
  if (canDeleteOwnAccount(ownedCount)) return;
  throw new APIError('BAD_REQUEST', {
    message:
      ownedCount === 1
        ? 'Hesabını silmeden önce sahibi olduğun çalışma alanını (arşivli olanlar dahil) silmen veya başka birine devretmen gerekiyor.'
        : `Hesabını silmeden önce sahibi olduğun ${ownedCount} çalışma alanını (arşivli olanlar dahil) silmen veya başka birine devretmen gerekiyor.`,
  });
}

export type Auth = typeof auth;
