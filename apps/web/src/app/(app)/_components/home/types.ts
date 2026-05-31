/**
 * Shared row shapes for the `(app)` landing page (4-sütun "Gezgin", §13.11).
 * `WorkspaceRow` + `BoardRow` mirror the tRPC `workspace.list` / `board.list`
 * outputs; `ListRow` + `CardRow` are projected from `board.get` (Sütun 3 + 4
 * share that payload — `08-web-ve-mobil.md` §8.1.3).
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

/**
 * One list row inside Sütun 3 — projected from `board.get` payload's `lists[]`.
 * Only the fields the column actually renders are surfaced (id/title/icon/color
 * for the row, archivedAt for the "Arşivli" badge, position for sort stability).
 */
export type ListRow = {
  id: string;
  title: string;
  color: string | null;
  icon: string | null;
  iconColor: string | null;
  position: string;
  archivedAt: Date | string | null;
};

/**
 * One card row inside Sütun 4 — projected from `board.get` payload's `cards[]`,
 * filtered by `listId`. The home column intentionally renders a minimal atom
 * (checkbox + title + optional due chip); etiket/üye/checklist are reserved
 * for the board modal (§13.11).
 */
export type CardRow = {
  id: string;
  listId: string;
  title: string;
  completed: boolean;
  completedAt: Date | string | null;
  dueAt: Date | string | null;
  archivedAt: Date | string | null;
  position: string;
};

/** A list/card is archived when it carries an `archivedAt` timestamp. */
export function isArchivedList(list: Pick<ListRow, 'archivedAt'>): boolean {
  return list.archivedAt != null;
}

export function isArchivedCard(card: Pick<CardRow, 'archivedAt'>): boolean {
  return card.archivedAt != null;
}
