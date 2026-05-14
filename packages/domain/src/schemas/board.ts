import { z } from 'zod';
import { emailSchema } from './auth';
import { idSchema, withClientMutationId } from './common';
import { invitationTokenSchema } from './invitation';
import { boardRoleSchema } from '../roles';

export const boardTitleSchema = z.string().trim().min(1).max(120);

export const createBoardInput = z.object({
  workspaceId: idSchema,
  title: boardTitleSchema,
  ...withClientMutationId,
});

export const updateBoardInput = z.object({
  boardId: idSchema,
  title: boardTitleSchema.optional(),
  ...withClientMutationId,
});

export const archiveBoardInput = z.object({
  boardId: idSchema,
  archived: z.boolean().default(true),
  ...withClientMutationId,
});

// --------------------------------------------------------------------------
// Phase 2.5C (DEM-52) — board member management (`board.members.*`) and the
// token-based board invitation flow (`board.invitations.*`). These all carry
// `boardId` so they merge cleanly with `boardProcedure`'s `{ boardId }` input
// (except `invitations.{mine,accept,decline}` which run on `protectedProcedure`).
// `emailSchema` trims + lowercases before validating; `boardRoleSchema` is the
// full board role set (`admin|member|viewer`) — board roles have no `owner`.
// --------------------------------------------------------------------------

/** `board.members.list` input. */
export const listBoardMembersInput = z.object({ boardId: idSchema });

/** `board.members.add` input — invite/add an email address to the board with a board role. */
export const addBoardMemberInput = z.object({
  boardId: idSchema,
  email: emailSchema,
  role: boardRoleSchema.default('member'),
  ...withClientMutationId,
});

/** `board.members.updateRole` input. */
export const updateBoardMemberRoleInput = z.object({
  boardId: idSchema,
  userId: idSchema,
  role: boardRoleSchema,
  ...withClientMutationId,
});

/** `board.members.remove` input. */
export const removeBoardMemberInput = z.object({
  boardId: idSchema,
  userId: idSchema,
  ...withClientMutationId,
});

/** `board.invitations.list` input — pending invitations for the board. */
export const listBoardInvitationsInput = z.object({ boardId: idSchema });

/** `board.invitations.revoke` input — cancel a `pending` board invitation. */
export const revokeBoardInvitationInput = z.object({
  boardId: idSchema,
  invitationId: idSchema,
  ...withClientMutationId,
});

/** `board.invitations.accept` input — the caller joins the board with the invited role. */
export const acceptBoardInvitationInput = z.object({
  token: invitationTokenSchema,
  ...withClientMutationId,
});

/** `board.invitations.decline` input. */
export const declineBoardInvitationInput = z.object({
  token: invitationTokenSchema,
  ...withClientMutationId,
});

// --------------------------------------------------------------------------
// DEM-102 — board link access request flow. Requests are board-scoped only:
// the board link is the trigger surface, and approval provisions workspace
// `guest` membership automatically when the requester is not yet in the
// workspace. Admin approval chooses only the board role (`member` / `viewer`).
// --------------------------------------------------------------------------

export const boardAccessRequestMessageSchema = z.string().trim().max(500).optional();
export const approvableBoardAccessRoleSchema = z.enum(['member', 'viewer']);

export const boardAccessContextInput = z.object({ boardId: idSchema });

export const requestBoardAccessInput = z.object({
  boardId: idSchema,
  message: boardAccessRequestMessageSchema,
  ...withClientMutationId,
});

export const listBoardAccessRequestsInput = z.object({ boardId: idSchema });

export const approveBoardAccessRequestInput = z.object({
  boardId: idSchema,
  requestId: idSchema,
  role: approvableBoardAccessRoleSchema.default('member'),
  ...withClientMutationId,
});

export const rejectBoardAccessRequestInput = z.object({
  boardId: idSchema,
  requestId: idSchema,
  ...withClientMutationId,
});

export type CreateBoardInput = z.infer<typeof createBoardInput>;
export type UpdateBoardInput = z.infer<typeof updateBoardInput>;
export type ArchiveBoardInput = z.infer<typeof archiveBoardInput>;
export type ListBoardMembersInput = z.infer<typeof listBoardMembersInput>;
export type AddBoardMemberInput = z.infer<typeof addBoardMemberInput>;
export type UpdateBoardMemberRoleInput = z.infer<typeof updateBoardMemberRoleInput>;
export type RemoveBoardMemberInput = z.infer<typeof removeBoardMemberInput>;
export type ListBoardInvitationsInput = z.infer<typeof listBoardInvitationsInput>;
export type RevokeBoardInvitationInput = z.infer<typeof revokeBoardInvitationInput>;
export type AcceptBoardInvitationInput = z.infer<typeof acceptBoardInvitationInput>;
export type DeclineBoardInvitationInput = z.infer<typeof declineBoardInvitationInput>;
export type BoardAccessContextInput = z.infer<typeof boardAccessContextInput>;
export type RequestBoardAccessInput = z.infer<typeof requestBoardAccessInput>;
export type ListBoardAccessRequestsInput = z.infer<typeof listBoardAccessRequestsInput>;
export type ApproveBoardAccessRequestInput = z.infer<typeof approveBoardAccessRequestInput>;
export type RejectBoardAccessRequestInput = z.infer<typeof rejectBoardAccessRequestInput>;
