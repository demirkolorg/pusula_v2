import { z } from 'zod';
import { idSchema, withClientMutationId } from './common';

export const boardTitleSchema = z.string().trim().min(1).max(120);

export const createBoardInput = z.object({
  workspaceId: idSchema,
  title: boardTitleSchema,
  ...withClientMutationId,
});

export const updateBoardInput = z.object({
  boardId: idSchema,
  title: boardTitleSchema.optional(),
  ...withClientMutationId,
});

export const archiveBoardInput = z.object({
  boardId: idSchema,
  archived: z.boolean().default(true),
  ...withClientMutationId,
});

export type CreateBoardInput = z.infer<typeof createBoardInput>;
export type UpdateBoardInput = z.infer<typeof updateBoardInput>;
export type ArchiveBoardInput = z.infer<typeof archiveBoardInput>;
