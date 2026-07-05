import { z } from 'zod';
import { CARD_COVER_COLORS } from '../constants';
import { cardRoleSchema } from '../roles';
import { idSchema, withClientMutationId } from './common';

export const cardTitleSchema = z.string().trim().min(1).max(500);
// Pratikte sınırsız (~1M karakter); üst tavan yalnızca DoS/bellek koruması
// için — description search index, activity/audit ve realtime payload'a akar.
export const cardDescriptionSchema = z.string().max(1_000_000);

/** A card's cover colour — one of the 12 palette names (`CARD_COVER_COLORS`). */
export const cardCoverColorSchema = z.enum(CARD_COVER_COLORS);

export const createCardInput = z.object({
  listId: idSchema,
  title: cardTitleSchema,
  beforeCardId: idSchema.nullish(),
  afterCardId: idSchema.nullish(),
  ...withClientMutationId,
});

export const updateCardInput = z.object({
  cardId: idSchema,
  title: cardTitleSchema.optional(),
  description: cardDescriptionSchema.optional(),
  dueAt: z.coerce.date().nullable().optional(),
  coverColor: cardCoverColorSchema.nullable().optional(),
  coverImageAttachmentId: idSchema.nullable().optional(),
  ...withClientMutationId,
});

/**
 * Move a card within or across lists. Mirrors the `moveCard` shape in
 * `docs/architecture/05-board-mekanigi.md` §5.1: the client may send
 * `newPosition`, but the server validates the card is still in `fromListId`
 * and recomputes if needed. `card.move` is board-internal (`toListId` must be
 * in the card's board); cross-board moves are `card.moveToList` (Phase 3E).
 */
export const moveCardInput = z.object({
  cardId: idSchema,
  fromListId: idSchema,
  toListId: idSchema,
  beforeCardId: idSchema.nullish(),
  afterCardId: idSchema.nullish(),
  newPosition: z.string().optional(),
  ...withClientMutationId,
});

/**
 * Move a card to any list — the same board or another board (Phase 3E — DEM-69).
 * Unlike `moveCardInput` (Phase 3A, board-internal), `toListId` may belong to a
 * different board; a cross-board move also updates `cards.board_id` and re-checks
 * the caller's permission on the target board. Cross-board moves reset
 * board-scoped relations (`card_labels` are dropped). `card_members` are kept,
 * and `checklists` / `checklist_items` / `comments` / `activity_events` follow
 * the card (they have no `board_id`). Idempotent (`clientMutationId`): a card
 * already at the target list+position is a no-op. See invariant 16.
 */
export const moveCardToListInput = z.object({
  cardId: idSchema,
  toListId: idSchema,
  beforeCardId: idSchema.nullish(),
  afterCardId: idSchema.nullish(),
  newPosition: z.string().optional(),
  ...withClientMutationId,
});

/**
 * Copy a card to any list (Phase 3E — DEM-69). `comments` / `activity_events`
 * are never copied; `title` (defaults to the source title + " (kopya)"),
 * `description`, `due_at`, `cover_color` are always copied; `completed` /
 * `completed_at` / `completed_by` are always reset. `checklists` /
 * `card_members` / `card_labels` are opt-in (members are filtered to those with
 * effective access to the target board; labels are copied only when the target
 * board equals the source board). NOT idempotent — every call creates a new row
 * (`clientMutationId` is carried but there's no dedup, like `card.create`).
 * See invariant 16.
 */
export const copyCardInput = z.object({
  cardId: idSchema,
  toListId: idSchema,
  beforeCardId: idSchema.nullish(),
  afterCardId: idSchema.nullish(),
  title: cardTitleSchema.optional(),
  includeChecklists: z.boolean().default(false),
  includeMembers: z.boolean().default(false),
  includeLabels: z.boolean().default(false),
  ...withClientMutationId,
});

export const archiveCardInput = z.object({
  cardId: idSchema,
  archived: z.boolean().default(true),
  ...withClientMutationId,
});

/**
 * Permanently delete a card (Faz 17 — 2026-06-01). Hard delete; cascades remove
 * card members / labels / checklists / comments / activity / realtime / search
 * docs / share-links. Attachment storage objects (MinIO) are enqueued for async
 * cleanup before the row is dropped. Board admin+ only. Idempotent on
 * `clientMutationId`.
 */
export const deleteCardInput = z.object({
  cardId: idSchema,
  ...withClientMutationId,
});

/** Mark a card complete (Phase 2.7 — DEM-66). Idempotent server-side. */
export const completeCardInput = z.object({ cardId: idSchema, ...withClientMutationId });

/** Clear a card's completion (Phase 2.7 — DEM-66). Idempotent server-side. */
export const uncompleteCardInput = z.object({ cardId: idSchema, ...withClientMutationId });

export type CreateCardInput = z.infer<typeof createCardInput>;
export type UpdateCardInput = z.infer<typeof updateCardInput>;
export type MoveCardInput = z.infer<typeof moveCardInput>;
export type MoveCardToListInput = z.infer<typeof moveCardToListInput>;
export type CopyCardInput = z.infer<typeof copyCardInput>;
export type ArchiveCardInput = z.infer<typeof archiveCardInput>;
export type DeleteCardInput = z.infer<typeof deleteCardInput>;
export type CompleteCardInput = z.infer<typeof completeCardInput>;
export type UncompleteCardInput = z.infer<typeof uncompleteCardInput>;

// --------------------------------------------------------------- card members
// A card member is a board-reachable user (`effectiveBoardRole !== null`) tagged
// `assignee` or `watcher` on the card; the `(cardId, userId, role)` triple is the
// primary key, so a user can hold both roles. See `docs/domain/01-urun-modeli.md`
// invariant 12 and `docs/domain/02-yetkilendirme-kurallari.md`.

export const listCardMembersInput = z.object({ cardId: idSchema });

export const addCardMemberInput = z.object({
  cardId: idSchema,
  userId: idSchema,
  role: cardRoleSchema,
  ...withClientMutationId,
});

export const removeCardMemberInput = z.object({
  cardId: idSchema,
  userId: idSchema,
  role: cardRoleSchema,
  ...withClientMutationId,
});

export type ListCardMembersInput = z.infer<typeof listCardMembersInput>;
export type AddCardMemberInput = z.infer<typeof addCardMemberInput>;
export type RemoveCardMemberInput = z.infer<typeof removeCardMemberInput>;

// ---------------------------------------------------------------- card labels
// A card label links a card to a `labels` row that belongs to the *same* board
// (invariant 13 — labels are board-scoped). `(cardId, labelId)` is the PK.

export const listCardLabelsInput = z.object({ cardId: idSchema });

export const addCardLabelInput = z.object({
  cardId: idSchema,
  labelId: idSchema,
  ...withClientMutationId,
});

export const removeCardLabelInput = z.object({
  cardId: idSchema,
  labelId: idSchema,
  ...withClientMutationId,
});

export type ListCardLabelsInput = z.infer<typeof listCardLabelsInput>;
export type AddCardLabelInput = z.infer<typeof addCardLabelInput>;
export type RemoveCardLabelInput = z.infer<typeof removeCardLabelInput>;
