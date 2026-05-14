import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { workspaces } from './workspaces';
import { boardRoleEnum, invitationStatusEnum } from './enums';
import { archivedAt, primaryId, timestamps } from './_common';

export const boards = pgTable(
  'boards',
  {
    id: primaryId(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    icon: text().notNull().default('layout-grid'),
    background: text(),
    /** Monotonic counter bumped on every board mutation; lets clients detect missed realtime events. */
    version: integer().notNull().default(0),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [index('boards_workspace_idx').on(t.workspaceId)],
);

export const boardMembers = pgTable(
  'board_members',
  {
    boardId: text()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: boardRoleEnum().notNull().default('member'),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.boardId, t.userId] }),
    index('board_members_user_idx').on(t.userId),
  ],
);

/**
 * Pending/closed invitations to join a *board* by email. The board-scoped twin
 * of `workspace_invitations` (same shape): `token` is a secret random string
 * surfaced only in the invitation email; an invitation is single-use and
 * time-limited (`expires_at`). At most one `pending` row per (board, email) is
 * enforced *in the database* by a partial unique index on
 * `(board_id, lower(email)) WHERE status = 'pending'` — the API layer keeps a
 * fast pre-check + friendly message, but the index is the race-proof guarantee.
 * The `role` is never `owner`-equivalent (board roles are `admin|member|viewer`).
 * Accepting also (lazily) makes the invitee a workspace `guest` if they aren't a
 * member yet. See `docs/domain/02-yetkilendirme-kurallari.md` (Board davet akışı)
 * and `docs/domain/01-urun-modeli.md` invariant 13.
 */
export const boardInvitations = pgTable(
  'board_invitations',
  {
    id: primaryId(),
    boardId: text()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    /** Invitee email, stored lowercased. */
    email: text().notNull(),
    role: boardRoleEnum().notNull().default('member'),
    /** Secret, single-use token; only ever sent in the invitation email. */
    token: text().notNull(),
    invitedById: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: invitationStatusEnum().notNull().default('pending'),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedById: text().references(() => users.id, { onDelete: 'set null' }),
    acceptedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('board_invitations_token_uq').on(t.token),
    index('board_invitations_board_status_idx').on(t.boardId, t.status),
    index('board_invitations_email_idx').on(t.email),
    // At most one `pending` invitation per (board, email) — case-insensitive.
    uniqueIndex('board_invitations_pending_email_uq')
      .on(t.boardId, sql`lower(${t.email})`)
      .where(sql`${t.status} = 'pending'`),
  ],
);

/**
 * Board-scoped access requests created from a shared board link. This is not an
 * invitation: the requester initiates it, and a board admin later approves it.
 * Approval provisions workspace `guest` membership when needed, then creates the
 * selected board membership in one transaction. At most one pending request per
 * (board, requester) is allowed; rejected users can request again later.
 */
export const boardAccessRequests = pgTable(
  'board_access_requests',
  {
    id: primaryId(),
    boardId: text()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    requesterId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text().notNull().default('pending'),
    message: text(),
    resolvedById: text().references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('board_access_requests_board_status_idx').on(t.boardId, t.status),
    index('board_access_requests_requester_idx').on(t.requesterId),
    uniqueIndex('board_access_requests_pending_uq')
      .on(t.boardId, t.requesterId)
      .where(sql`${t.status} = 'pending'`),
    check(
      'board_access_requests_status_check',
      sql`${t.status} IN ('pending', 'approved', 'rejected')`,
    ),
  ],
);

export const labels = pgTable(
  'labels',
  {
    id: primaryId(),
    boardId: text()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    name: text().notNull().default(''),
    /** Tailwind-ish token, e.g. `green`, `blue-600`. */
    color: text().notNull(),
    ...timestamps,
  },
  (t) => [
    index('labels_board_idx').on(t.boardId),
    uniqueIndex('labels_board_color_name_uq').on(t.boardId, t.color, t.name),
  ],
);

export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;
export type BoardMember = typeof boardMembers.$inferSelect;
export type BoardInvitation = typeof boardInvitations.$inferSelect;
export type NewBoardInvitation = typeof boardInvitations.$inferInsert;
export type BoardAccessRequest = typeof boardAccessRequests.$inferSelect;
export type NewBoardAccessRequest = typeof boardAccessRequests.$inferInsert;
export type Label = typeof labels.$inferSelect;
