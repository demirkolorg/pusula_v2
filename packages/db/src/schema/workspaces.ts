import { index, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { workspaceRoleEnum } from './enums';
import { archivedAt, primaryId, timestamps } from './_common';

export const workspaces = pgTable(
  'workspaces',
  {
    id: primaryId(),
    name: text().notNull(),
    slug: text().notNull(),
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

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
