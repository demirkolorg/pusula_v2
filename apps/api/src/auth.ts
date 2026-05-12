import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb, accounts, sessions, users, verifications } from '@pusula/db';
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
});

export type Auth = typeof auth;
