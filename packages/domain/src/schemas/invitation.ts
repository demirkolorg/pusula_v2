import { z } from 'zod';
import { idSchema, withClientMutationId } from './common';
import { INVITATION_STATUSES } from '../constants';
import type { InvitationStatus } from '../constants';

/** Lifecycle state of a workspace invitation (`pending → accepted | declined | revoked | expired`). */
export const invitationStatusSchema = z.enum(INVITATION_STATUSES);

/**
 * The secret, single-use token carried by an invitation (only ever sent in the
 * invitation email). The backend generates it from `node:crypto.randomBytes`;
 * the bounds here just sanity-check inbound `accept`/`decline` calls.
 */
export const invitationTokenSchema = z.string().min(20).max(64);

/** `workspace.invitations.revoke` input. Cancels a `pending` invitation. */
export const revokeWorkspaceInvitationInput = z.object({
  workspaceId: idSchema,
  invitationId: idSchema,
  ...withClientMutationId,
});

/** `workspace.invitations.accept` input. The caller joins the workspace with the invited role. */
export const acceptWorkspaceInvitationInput = z.object({
  token: invitationTokenSchema,
  ...withClientMutationId,
});

/** `workspace.invitations.decline` input. */
export const declineWorkspaceInvitationInput = z.object({
  token: invitationTokenSchema,
  ...withClientMutationId,
});

export type { InvitationStatus };
export type RevokeWorkspaceInvitationInput = z.infer<typeof revokeWorkspaceInvitationInput>;
export type AcceptWorkspaceInvitationInput = z.infer<typeof acceptWorkspaceInvitationInput>;
export type DeclineWorkspaceInvitationInput = z.infer<typeof declineWorkspaceInvitationInput>;
