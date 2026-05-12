import { z } from 'zod';
import { LABEL_COLORS } from '../constants';
import { idSchema, withClientMutationId } from './common';

/** A label's colour — one of the fixed Trello-style palette tokens. */
export const labelColorSchema = z.enum(LABEL_COLORS);

/**
 * A label's display name. Optional / may be empty (a colour-only label is
 * valid); trimmed and capped. The `(boardId, color, name)` uniqueness lives at
 * the DB level — two same-colour labels need distinct names.
 */
export const labelNameSchema = z.string().trim().max(50);

/** `label.list` — board-scoped: the caller can view the board. */
export const listLabelsInput = z.object({ boardId: idSchema });

export const createLabelInput = z.object({
  boardId: idSchema,
  color: labelColorSchema,
  name: labelNameSchema.optional(),
  ...withClientMutationId,
});

export const updateLabelInput = z.object({
  boardId: idSchema,
  labelId: idSchema,
  color: labelColorSchema.optional(),
  name: labelNameSchema.optional(),
  ...withClientMutationId,
});

export const deleteLabelInput = z.object({
  boardId: idSchema,
  labelId: idSchema,
  ...withClientMutationId,
});

export type ListLabelsInput = z.infer<typeof listLabelsInput>;
export type CreateLabelInput = z.infer<typeof createLabelInput>;
export type UpdateLabelInput = z.infer<typeof updateLabelInput>;
export type DeleteLabelInput = z.infer<typeof deleteLabelInput>;
