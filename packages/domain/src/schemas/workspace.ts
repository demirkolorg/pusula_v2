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

export const createWorkspaceInput = z.object({
  name: workspaceNameSchema,
  slug: workspaceSlugSchema.optional(),
  ...withClientMutationId,
});

export const updateWorkspaceInput = z.object({
  workspaceId: idSchema,
  name: workspaceNameSchema.optional(),
  ...withClientMutationId,
});

export const inviteWorkspaceMemberInput = z.object({
  workspaceId: idSchema,
  email: z.email(),
  role: workspaceRoleSchema.exclude(['owner']).default('member'),
  ...withClientMutationId,
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInput>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInput>;
export type InviteWorkspaceMemberInput = z.infer<typeof inviteWorkspaceMemberInput>;
