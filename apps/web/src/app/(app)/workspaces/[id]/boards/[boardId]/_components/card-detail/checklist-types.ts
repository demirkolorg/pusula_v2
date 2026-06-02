/**
 * Shared view-model + handler types for the card-detail checklist section
 * (split across `card-detail-checklists.tsx`, `checklist-block.tsx`,
 * `checklist-item-row.tsx`, `checklist-add-forms.tsx`). Presentational only —
 * the dialog wires these handlers to tRPC mutations.
 */

export type ChecklistItemView = {
  id: string;
  checklistId: string;
  content: string;
  position: string;
  completed: boolean;
  /** User id who last checked the item (`null` if open or the user was deleted). */
  completedBy?: string | null;
  /** Count of non-deleted comments on this item — drives the thread toggle badge. */
  commentCount: number;
};

export type ChecklistView = {
  id: string;
  cardId: string;
  title: string;
  position: string;
  items: ChecklistItemView[];
};

export type ChecklistHandlers = {
  onCreateChecklist: (title: string) => void;
  onRenameChecklist: (input: { checklistId: string; title: string }) => void;
  onDeleteChecklist: (checklistId: string) => void;
  onAddItem: (input: { checklistId: string; content: string }) => void;
  onToggleItem: (input: { checklistId: string; itemId: string; completed: boolean }) => void;
  onEditItem: (input: { checklistId: string; itemId: string; content: string }) => void;
  onDeleteItem: (input: { checklistId: string; itemId: string }) => void;
};

/** Resolve a user id to a display name (board/card members). */
export type NameResolver = (userId: string) => string | null | undefined;

/** Resolve a user id to an avatar URL (board/card members; `null` when unset). */
export type ImageResolver = (userId: string) => string | null;

/**
 * Per-item comment-thread context, threaded from the card detail dialog down to
 * each {@link ChecklistItemRow}. When present, each row shows a comment-thread
 * toggle; `null`/`undefined` (e.g. the share view) hides it entirely. The
 * `@-mention` source is typed via the UI `MentionSource` (re-imported by the row).
 */
export type ChecklistCommentContext = {
  cardId: string;
  /** Board `member+` and board active — may add / edit / delete own comments. */
  canComment: boolean;
  /** Whether the viewer is a board `admin` (may edit/delete others' comments). */
  isBoardAdmin: boolean;
  viewerUserId: string;
  viewerName: string | null;
  viewerImage?: string | null;
  /** Optional @-mention picker source (board members). Typed at the row. */
  mentions?: import('@pusula/ui').MentionSource;
};
