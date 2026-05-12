/**
 * Checklist / checklist-item input schemas — Phase 2.5A (DEM-50). Every input
 * carries `cardId` because the procedures run on `cardProcedure`, which reads
 * `cardId` from the raw input. All state-changing mutations carry
 * `clientMutationId`. `item.reorder` takes optional `beforeItemId` / `afterItemId`
 * neighbours (both must live in the same checklist) — the server recomputes the
 * fractional `position` from them (`@pusula/domain/position`).
 *
 * See `docs/architecture/03-backend.md` (Faz 2.5 — checklist / checklist.item
 * procedure'leri) and `docs/domain/02-yetkilendirme-kurallari.md`.
 */
import { z } from 'zod';
import { idSchema, withClientMutationId } from './common';

/** Checklist title — non-empty after trimming. */
export const checklistTitleSchema = z.string().trim().min(1).max(500);
/** Checklist item content — non-empty after trimming. */
export const checklistItemContentSchema = z.string().trim().min(1).max(2_000);

export const createChecklistInput = z.object({
  cardId: idSchema,
  title: checklistTitleSchema,
  ...withClientMutationId,
});

export const updateChecklistInput = z.object({
  cardId: idSchema,
  checklistId: idSchema,
  title: checklistTitleSchema,
  ...withClientMutationId,
});

export const deleteChecklistInput = z.object({
  cardId: idSchema,
  checklistId: idSchema,
  ...withClientMutationId,
});

export const createChecklistItemInput = z.object({
  cardId: idSchema,
  checklistId: idSchema,
  content: checklistItemContentSchema,
  ...withClientMutationId,
});

export const toggleChecklistItemInput = z.object({
  cardId: idSchema,
  checklistId: idSchema,
  itemId: idSchema,
  completed: z.boolean(),
  ...withClientMutationId,
});

export const updateChecklistItemInput = z.object({
  cardId: idSchema,
  checklistId: idSchema,
  itemId: idSchema,
  content: checklistItemContentSchema,
  ...withClientMutationId,
});

export const deleteChecklistItemInput = z.object({
  cardId: idSchema,
  checklistId: idSchema,
  itemId: idSchema,
  ...withClientMutationId,
});

export const reorderChecklistItemInput = z.object({
  cardId: idSchema,
  checklistId: idSchema,
  itemId: idSchema,
  beforeItemId: idSchema.nullish(),
  afterItemId: idSchema.nullish(),
  ...withClientMutationId,
});

export type CreateChecklistInput = z.infer<typeof createChecklistInput>;
export type UpdateChecklistInput = z.infer<typeof updateChecklistInput>;
export type DeleteChecklistInput = z.infer<typeof deleteChecklistInput>;
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemInput>;
export type ToggleChecklistItemInput = z.infer<typeof toggleChecklistItemInput>;
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemInput>;
export type DeleteChecklistItemInput = z.infer<typeof deleteChecklistItemInput>;
export type ReorderChecklistItemInput = z.infer<typeof reorderChecklistItemInput>;
