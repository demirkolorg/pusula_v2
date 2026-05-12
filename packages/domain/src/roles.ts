import { z } from 'zod';
import {
  BOARD_ROLES,
  CARD_ROLES,
  WORKSPACE_ROLES,
  type BoardRole,
  type CardRole,
  type WorkspaceRole,
} from './constants';

export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);
export const boardRoleSchema = z.enum(BOARD_ROLES);
export const cardRoleSchema = z.enum(CARD_ROLES);

/** Rank of a workspace role; higher number = more privileged. */
const WORKSPACE_RANK: Record<WorkspaceRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
  guest: 0,
};

/** Rank of a board role; higher number = more privileged. */
const BOARD_RANK: Record<BoardRole, number> = {
  admin: 2,
  member: 1,
  viewer: 0,
};

export function workspaceRoleAtLeast(role: WorkspaceRole, min: WorkspaceRole): boolean {
  return WORKSPACE_RANK[role] >= WORKSPACE_RANK[min];
}

export function boardRoleAtLeast(role: BoardRole, min: BoardRole): boolean {
  return BOARD_RANK[role] >= BOARD_RANK[min];
}

// Role literal arrays and types live in `./constants`; re-export the types here
// for ergonomic imports from `@pusula/domain/roles` without colliding with the
// barrel in `./index`.
export type { BoardRole, CardRole, WorkspaceRole };
