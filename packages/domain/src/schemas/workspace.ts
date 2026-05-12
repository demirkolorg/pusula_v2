import { z } from 'zod';
import { idSchema, withClientMutationId } from './common';
import { workspaceRoleSchema } from '../roles';

export const workspaceNameSchema = z.string().trim().min(1).max(100);
export const workspaceSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Yalnızca küçük harf, rakam ve tire');

/** Workspace member roles that may be assigned via member management (never `owner`). */
export const assignableWorkspaceRoleSchema = workspaceRoleSchema.exclude(['owner']);

export const createWorkspaceInput = z.object({
  name: workspaceNameSchema,
  slug: workspaceSlugSchema.optional(),
  ...withClientMutationId,
});

/**
 * `workspace.update` input. `name` and `slug` are both optional; the procedure
 * rejects the no-op case (neither provided) — kept a plain object so it merges
 * cleanly with `workspaceProcedure`'s `{ workspaceId }` input.
 */
export const updateWorkspaceInput = z.object({
  workspaceId: idSchema,
  name: workspaceNameSchema.optional(),
  slug: workspaceSlugSchema.optional(),
  ...withClientMutationId,
});

export const archiveWorkspaceInput = z.object({
  workspaceId: idSchema,
  ...withClientMutationId,
});

/** `workspace.members.updateRole` input. `owner` cannot be assigned here (owner transfer is a separate flow). */
export const updateWorkspaceMemberRoleInput = z.object({
  workspaceId: idSchema,
  userId: idSchema,
  role: assignableWorkspaceRoleSchema,
  ...withClientMutationId,
});

/** `workspace.members.remove` input. */
export const removeWorkspaceMemberInput = z.object({
  workspaceId: idSchema,
  userId: idSchema,
  ...withClientMutationId,
});

export const inviteWorkspaceMemberInput = z.object({
  workspaceId: idSchema,
  email: z.email(),
  role: assignableWorkspaceRoleSchema.default('member'),
  ...withClientMutationId,
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInput>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInput>;
export type ArchiveWorkspaceInput = z.infer<typeof archiveWorkspaceInput>;
export type UpdateWorkspaceMemberRoleInput = z.infer<typeof updateWorkspaceMemberRoleInput>;
export type RemoveWorkspaceMemberInput = z.infer<typeof removeWorkspaceMemberInput>;
export type InviteWorkspaceMemberInput = z.infer<typeof inviteWorkspaceMemberInput>;
