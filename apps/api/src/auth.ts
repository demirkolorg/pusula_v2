import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb, accounts, sessions, users, verifications } from '@pusula/db';
import { bootstrapNewUser } from './bootstrap';
import { env } from './env';

/**
 * Better Auth instance. Self-hosted, TypeScript-first; serves its own HTTP
 * routes under `${API_URL}/api/auth/*` (mounted in `app.ts`). Authorization
 * (workspace/board/card permissions) is NOT here — it lives in the domain/API
 * layer (architecture doc §10).
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
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once a day
  },
  databaseHooks: {
    user: {
      create: {
        // Onboarding bootstrap: give a brand-new user a default workspace + empty
        // "İlk Pano" so they don't land on a blank screen. Best-effort — a failure
        // here must not fail signup, so we log and move on (the user lands on the
        // onboarding empty state instead). Runs after the user row is committed;
        // see `./bootstrap.ts` and `docs/architecture/08-web-ve-mobil.md` §8.1.3.
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

export type Auth = typeof auth;
