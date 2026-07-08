'use client';

import { strings } from '@/lib/strings';
import { CardAttachmentAddForm } from './card-attachment-add-form';
import { CardDetailAttachments } from './card-detail-attachments';

type ChecklistItemAttachmentsProps = {
  cardId: string;
  checklistItemId: string;
  /** Board `member+` and board active — may upload / delete own attachments. */
  canEdit: boolean;
  /** Whether the viewer is a board `admin` (may delete others' attachments). */
  isBoardAdmin: boolean;
  viewerUserId: string;
};

/**
 * Inline attachment gallery for a single checklist item — the file-attachment
 * mirror of {@link ChecklistItemThread}. Self-fetching client component mounted
 * under {@link ChecklistItemRow} when its attachment toggle is open.
 *
 * Re-uses the card's {@link CardDetailAttachments} gallery (scoped to one
 * `checklistItemId`, cover hidden — a checklist item attachment can never become
 * the card cover) plus the {@link CardAttachmentAddForm} uploader. Both children
 * self-manage their tRPC wiring (query + optimistic delete / upload); this shell
 * only supplies scope + the visual thread bond (left border + indent) and gates
 * uploading behind `canEdit`.
 *
 * Read-only viewers (`canEdit=false`) may still open + browse the gallery; the
 * uploader is hidden. Delete/cover affordances inside the gallery derive from
 * `canEdit` / `isBoardAdmin` / `viewerUserId` per attachment.
 */
export function ChecklistItemAttachments({
  cardId,
  checklistItemId,
  canEdit,
  isBoardAdmin,
  viewerUserId,
}: ChecklistItemAttachmentsProps) {
  const copy = strings.card.checklist;

  return (
    <div
      // Sol kenar çizgisi + hafif girinti — thread ile aynı görsel bağ: ek
      // galerisinin bu maddeye ait olduğunu gösterir.
      className="border-border/60 ml-1.5 mt-2 space-y-2.5 border-l-2 pl-3"
      aria-label={copy.itemAttachmentsGalleryLabel}
    >
      <CardDetailAttachments
        cardId={cardId}
        checklistItemId={checklistItemId}
        hideCover
        canEdit={canEdit}
        isBoardAdmin={isBoardAdmin}
        viewerUserId={viewerUserId}
      />

      {canEdit && (
        <CardAttachmentAddForm cardId={cardId} checklistItemId={checklistItemId} canEdit />
      )}
    </div>
  );
}
