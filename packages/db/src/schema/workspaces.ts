import { sql } from 'drizzle-orm';
import { index, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { invitationStatusEnum, workspaceRoleEnum } from './enums';
import { archivedAt, primaryId, timestamps } from './_common';

export const workspaces = pgTable(
  'workspaces',
  {
    id: primaryId(),
    name: text().notNull(),
    slug: text().notNull(),
    icon: text().notNull().default('briefcase'),
    ownerId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [uniqueIndex('workspaces_slug_uq').on(t.slug), index('workspaces_owner_idx').on(t.ownerId)],
);

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRoleEnum().notNull().default('member'),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('workspace_members_user_idx').on(t.userId),
  ],
);

/**
 * Pending/closed invitations to join a workspace. `token` is a secret random
 * string surfaced only in the invitation email; an invitation is single-use and
 * time-limited (`expires_at`). At most one `pending` row per (workspace, email)
 * is enforced *in the database* by a partial unique index on
 * `(workspace_id, lower(email)) WHERE status = 'pending'` — the API layer keeps a
 * fast pre-check + friendly message, but the index is the race-proof guarantee.
 * The `role` is never `owner` (the API guards this via `assignableWorkspaceRoleSchema`).
 * See `docs/domain/02-yetkilendirme-kurallari.md` (Workspace davet akışı).
 */
export const workspaceInvitations = pgTable(
  'workspace_invitations',
  {
    id: primaryId(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Invitee email, stored lowercased. */
    email: text().notNull(),
    role: workspaceRoleEnum().notNull().default('member'),
    /** Secret, single-use token; only ever sent in the invitation email. */
    token: text().notNull(),
    invitedById: text().references(() => users.id, { onDelete: 'set null' }),
    status: invitationStatusEnum().notNull().default('pending'),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedById: text().references(() => users.id, { onDelete: 'set null' }),
    acceptedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('workspace_invitations_token_uq').on(t.token),
    index('workspace_invitations_workspace_status_idx').on(t.workspaceId, t.status),
    index('workspace_invitations_email_idx').on(t.email),
    // At most one `pending` invitation per (workspace, email) — case-insensitive.
    uniqueIndex('workspace_invitations_pending_email_uq')
      .on(t.workspaceId, sql`lower(${t.email})`)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type WorkspaceInvitation = typeof workspaceInvitations.$inferSelect;
export type NewWorkspaceInvitation = typeof workspaceInvitations.$inferInsert;
