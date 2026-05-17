/**
 * Shared row shapes for the `(app)` landing page (DEM-192). These mirror the
 * tRPC `workspace.list` / `board.list` outputs — the page casts the query data
 * to these once and the home components consume the typed rows.
 */
import type { boardRoleLabels, workspaceRoleLabels } from '@/lib/strings';

export type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  role: keyof typeof workspaceRoleLabels;
  createdAt: Date | string;
  boardCount: number;
  memberCount: number;
  lastActivityAt: Date | string | null;
};

export type BoardMemberRow = {
  userId: string;
  name: string;
  image?: string | null;
  role: string;
};

export type BoardRow = {
  id: string;
  title: string;
  icon?: string | null;
  background?: string | null;
  version?: number;
  archivedAt?: Date | string | null;
  createdAt: Date | string;
  role: keyof typeof boardRoleLabels;
  updatedAt: Date | string;
  openCount: number;
  doneCount: number;
  members: BoardMemberRow[];
  favorited: boolean;
  lastActivityAt: Date | string | null;
};

/** A board is archived when it carries an `archivedAt` timestamp. */
export function isArchivedBoard(board: Pick<BoardRow, 'archivedAt'>): boolean {
  return board.archivedAt != null;
}
