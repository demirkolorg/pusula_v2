/**
 * Better Auth core tables. Field (JS-key) names follow Better Auth's expected
 * schema so the Drizzle adapter resolves them by property name; DB column names
 * are snake-cased via the `casing: 'snake_case'` option. Table names are plural
 * to match the rest of the schema and the architecture doc.
 *
 * Keep these in sync with Better Auth: `pnpm dlx @better-auth/cli generate` can
 * regenerate this file when the auth config changes.
 */
import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    /**
     * Service-account marker. `true` for bot users bound 1:1 to an `api_keys`
     * row (public API + bot access). Bots never receive notifications, cannot
     * log in and cannot be invited — see `docs/domain/10-bot-ve-api-key-kurallari.md`.
     */
    isBot: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    token: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sessions_token_uq').on(t.token)],
);

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  password: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * `auth_known_devices` (Faz 10I / DEM-143) — fingerprint of every (userAgent
 * hash + IP subnet) pair we have seen for a given user. The login-success hook
 * (`apps/api/src/known-devices.ts`) uses `INSERT ... ON CONFLICT` against the
 * unique index to decide "new device" (insert path → send Resend security
 * email) vs "known device" (conflict path → bump `last_seen_at`). This is
 * deliberately a separate channel from `notification_outbox`: security mail is
 * not user-controllable, see `docs/architecture/15-bildirim-ayar-ekrani.md`
 * §15.4 Section 8 + `docs/architecture/07-auth.md`.
 */
export const authKnownDevices = pgTable(
  'auth_known_devices',
  {
    id: text('id').primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** sha256(normalized UA). Deterministic, low-entropy salt-free OK here — we
     * are only correlating to an existing row for the same user. */
    userAgentHash: text().notNull(),
    /** IPv4 `/24` (e.g. `203.0.113.0/24`) or IPv6 `/48` prefix. Coarse on
     * purpose: same office NAT looks like one device, mobile carrier IPs jump
     * around but stay within a subnet for short windows. */
    ipSubnet: text().notNull(),
    /** Optional raw UA snapshot kept for UI display ("Chrome · Windows · …").
     * Truncated by the helper so we don't store unbounded strings. */
    userAgent: text(),
    firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('auth_known_devices_user_device_uq').on(t.userId, t.userAgentHash, t.ipSubnet),
    index('auth_known_devices_user_idx').on(t.userId, t.lastSeenAt.desc()),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type AuthKnownDevice = typeof authKnownDevices.$inferSelect;
export type NewAuthKnownDevice = typeof authKnownDevices.$inferInsert;
