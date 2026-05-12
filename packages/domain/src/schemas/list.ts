import { z } from 'zod';
import { idSchema, withClientMutationId } from './common';

export const listTitleSchema = z.string().trim().min(1).max(120);

export const createListInput = z.object({
  boardId: idSchema,
  title: listTitleSchema,
  /** Optional explicit placement; defaults to end of board. */
  beforeListId: idSchema.nullish(),
  afterListId: idSchema.nullish(),
  ...withClientMutationId,
});

export const renameListInput = z.object({
  listId: idSchema,
  title: listTitleSchema,
  ...withClientMutationId,
});

export const moveListInput = z.object({
  /**
   * Board the list belongs to — carried so `boardProcedure` can resolve the
   * caller's board role from the input (same discipline as `createListInput`).
   */
  boardId: idSchema,
  listId: idSchema,
  beforeListId: idSchema.nullish(),
  afterListId: idSchema.nullish(),
  /** Optional client-computed position; the server validates / recomputes. */
  newPosition: z.string().optional(),
  ...withClientMutationId,
});

export const archiveListInput = z.object({
  listId: idSchema,
  archived: z.boolean().default(true),
  ...withClientMutationId,
});

export type CreateListInput = z.infer<typeof createListInput>;
export type RenameListInput = z.infer<typeof renameListInput>;
export type MoveListInput = z.infer<typeof moveListInput>;
export type ArchiveListInput = z.infer<typeof archiveListInput>;
