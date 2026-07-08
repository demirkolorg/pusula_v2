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
  /**
   * İç içe (nested) madde ebeveyni; `null`/eksik = kök madde. İstemci düz listeyi
   * `@pusula/domain` `buildChecklistTree` ile ağaca çevirir (3 seviye). `position`
   * yalnız aynı ebeveyn (kardeşler) arasında anlamlıdır.
   */
  parentItemId?: string | null;
  completed: boolean;
  /** User id who last checked the item (`null` if open or the user was deleted). */
  completedBy?: string | null;
  /** Count of non-deleted comments on this item — drives the thread toggle badge. */
  commentCount: number;
  /** Count of committed attachments on this item — drives the attachment toggle badge. */
  attachmentCount: number;
};

export type ChecklistView = {
  id: string;
  cardId: string;
  title: string;
  position: string;
  /** Checklist arşiv durumu (invariant 23): `null` = aktif, aksi arşivli. */
  archivedAt: Date | string | null;
  items: ChecklistItemView[];
};

export type ChecklistHandlers = {
  onCreateChecklist: (title: string) => void;
  /**
   * JSON ile toplu içe aktarma — kullanıcının yapıştırıp doğrulanan checklist
   * dizisini tek bir `checklist.bulkImport` mutation'ına geçirir. Wiring katmanı
   * `cardId` + `clientMutationId` ekler. Salt-görünüm / viewer için tanımsız
   * bırakılır (buton render edilmez).
   */
  onBulkImport?: (checklists: Array<{ title: string; items: string[] }>) => void;
  onRenameChecklist: (input: { checklistId: string; title: string }) => void;
  onDeleteChecklist: (checklistId: string) => void;
  /** Arşivle (`archived: true`) / arşivden çıkar (`false`) bir checklist. */
  onArchiveChecklist: (input: { checklistId: string; archived: boolean }) => void;
  /**
   * Madde ekle — `parentItemId` verilirse o maddenin altına (iç içe) eklenir,
   * yoksa checklist'in köküne. Sunucu derinlik sınırını (`CHECKLIST_MAX_DEPTH`)
   * doğrular; UI "alt madde ekle"yi yalnız sınır altındaki maddelerde gösterir.
   */
  onAddItem: (input: { checklistId: string; content: string; parentItemId?: string | null }) => void;
  onToggleItem: (input: { checklistId: string; itemId: string; completed: boolean }) => void;
  onEditItem: (input: { checklistId: string; itemId: string; content: string }) => void;
  onDeleteItem: (input: { checklistId: string; itemId: string }) => void;
  /**
   * Reorder a checklist item *within the same checklist* (drag-and-drop). Fires
   * once on drop with the resolved real neighbours, the optimistic
   * `newPosition` (LexoRank-like), and the full post-move `orderedIds` for the
   * optimistic cache patch. The dialog applies the optimistic reorder + rollback.
   */
  onReorderItem: (input: {
    checklistId: string;
    itemId: string;
    beforeItemId: string | undefined;
    afterItemId: string | undefined;
    newPosition: string;
    orderedIds: string[];
  }) => void;
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

/**
 * Per-item attachment context, threaded from the card detail dialog down to each
 * {@link ChecklistItemRow} — the file-attachment mirror of
 * {@link ChecklistCommentContext}. When present, each row shows an attachment
 * toggle; `null`/`undefined` (e.g. the share view) hides it entirely. Unlike the
 * comment context there is no viewer identity/mention payload: the gallery +
 * upload form (`ChecklistItemAttachments`) self-fetch and derive per-row
 * affordances from `canEdit` / `isBoardAdmin` / `viewerUserId` alone. A checklist
 * item attachment can never become the card cover, so no cover context is passed.
 */
export type ChecklistAttachmentContext = {
  cardId: string;
  /** Board `member+` and board active — may upload / delete own attachments. */
  canEdit: boolean;
  /** Whether the viewer is a board `admin` (may delete others' attachments). */
  isBoardAdmin: boolean;
  viewerUserId: string;
};
