import { z } from 'zod';
import { idSchema, withClientMutationId } from './common';

export const cardTitleSchema = z.string().trim().min(1).max(500);
export const cardDescriptionSchema = z.string().max(20_000);

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
  ...withClientMutationId,
});

/**
 * Move a card within or across lists. Mirrors the `moveCard` shape in
 * `docs/PUSULA_TEKNIK_MIMARI.md` §6: the client may send `newPosition`, but the
 * server validates the card is still in `fromListId` and recomputes if needed.
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

export const archiveCardInput = z.object({
  cardId: idSchema,
  archived: z.boolean().default(true),
  ...withClientMutationId,
});

export type CreateCardInput = z.infer<typeof createCardInput>;
export type UpdateCardInput = z.infer<typeof updateCardInput>;
export type MoveCardInput = z.infer<typeof moveCardInput>;
export type ArchiveCardInput = z.infer<typeof archiveCardInput>;
