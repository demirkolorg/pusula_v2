/**
 * Pure permission helpers — no DB, no I/O. The API layer resolves a user's
 * effective roles (workspace + board, and optionally card relationships) and
 * passes them here. Authorization is ALWAYS checked server-side; the client
 * may use these helpers only to hide UI affordances.
 *
 * See `docs/PUSULA_TEKNIK_MIMARI.md` §10.
 */
import { boardRoleAtLeast, workspaceRoleAtLeast } from './roles';
import type { BoardRole, WorkspaceRole } from './constants';

export interface AccessContext {
  /** Workspace role, or `null` if the user is not a member of the workspace. */
  workspaceRole: WorkspaceRole | null;
  /** Board role, or `null` if the user has no board membership (may still inherit). */
  boardRole: BoardRole | null;
}

/**
 * Effective board role: an explicit board membership wins; otherwise a workspace
 * admin/owner is treated as a board admin, and a workspace member as a board
 * member. Guests get nothing implicitly.
 */
export function effectiveBoardRole(ctx: AccessContext): BoardRole | null {
  if (ctx.boardRole) return ctx.boardRole;
  switch (ctx.workspaceRole) {
    case 'owner':
    case 'admin':
      return 'admin';
    case 'member':
      return 'member';
    default:
      return null;
  }
}

export function canAccessWorkspace(ctx: AccessContext): boolean {
  return ctx.workspaceRole !== null;
}

export function canManageWorkspace(ctx: AccessContext): boolean {
  return ctx.workspaceRole !== null && workspaceRoleAtLeast(ctx.workspaceRole, 'admin');
}

export function canViewBoard(ctx: AccessContext): boolean {
  return effectiveBoardRole(ctx) !== null;
}

export function canEditBoardContent(ctx: AccessContext): boolean {
  const role = effectiveBoardRole(ctx);
  return role !== null && boardRoleAtLeast(role, 'member');
}

export function canManageBoard(ctx: AccessContext): boolean {
  const role = effectiveBoardRole(ctx);
  return role !== null && boardRoleAtLeast(role, 'admin');
}
