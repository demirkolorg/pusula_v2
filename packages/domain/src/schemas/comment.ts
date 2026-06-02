/**
 * Comment input schemas — Phase 2.5A (DEM-50). `comment.list` is a query (no
 * `clientMutationId`); `create` / `update` / `delete` are collaborative
 * mutations and carry `clientMutationId`. Every input carries `cardId` because
 * the procedures run on `cardProcedure`, which reads `cardId` from the raw
 * input. Mention parsing is Phase 6 — the body is plain text for now.
 *
 * See `docs/architecture/03-backend.md` (Faz 2.5 — comment procedure'leri) and
 * `docs/domain/02-yetkilendirme-kurallari.md` (Board / Card içerik procedure
 * haritası — Faz 2.5).
 */
import { z } from 'zod';
import { idSchema, withClientMutationId } from './common';

/** Comment body — non-empty after trimming, generous upper bound. */
export const commentBodySchema = z.string().trim().min(1).max(20_000);

export const listCommentsInput = z.object({
  cardId: idSchema,
  /**
   * Belirtilirse yalnız o checklist (yapılacaklar) maddesine ait thread
   * döner; verilmezse kart-seviyesi yorumlar (`checklist_item_id IS NULL`)
   * döner. Madde her durumda `cardId`'nin bir checklist'ine ait olmalı —
   * aksi halde `NOT_FOUND`.
   */
  checklistItemId: idSchema.optional(),
});

export const createCommentInput = z.object({
  cardId: idSchema,
  body: commentBodySchema,
  /**
   * Verilirse yorum bu checklist maddesine bağlanır (madde thread'i); aksi
   * halde klasik kart yorumu olur. `cardId` her iki durumda da zorunludur.
   */
  checklistItemId: idSchema.optional(),
  ...withClientMutationId,
});

export const updateCommentInput = z.object({
  cardId: idSchema,
  commentId: idSchema,
  body: commentBodySchema,
  ...withClientMutationId,
});

export const deleteCommentInput = z.object({
  cardId: idSchema,
  commentId: idSchema,
  ...withClientMutationId,
});

export type ListCommentsInput = z.infer<typeof listCommentsInput>;
export type CreateCommentInput = z.infer<typeof createCommentInput>;
export type UpdateCommentInput = z.infer<typeof updateCommentInput>;
export type DeleteCommentInput = z.infer<typeof deleteCommentInput>;
