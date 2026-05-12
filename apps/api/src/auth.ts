import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { count, eq, getDb, accounts, sessions, users, verifications, workspaces } from '@pusula/db';
import { canDeleteOwnAccount, userImageUrlSchema, userNameSchema } from '@pusula/domain';
import { bootstrapNewUser } from './bootstrap';
import { env } from './env';

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
  emailAndPassword: {
    enabled: true,
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
