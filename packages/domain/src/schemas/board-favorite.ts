import { z } from 'zod';
import { idSchema, withClientMutationId } from './common';

/**
 * DEM-192 — `board.setFavorite` input. A favorite is per-user state stored in
 * the `board_favorites` junction table; `favorited` toggles membership of that
 * table for the calling user. `boardId` merges cleanly with `boardProcedure`'s
 * `{ boardId }` input (board view permission is enough — viewers/guests may
 * favorite their own boards).
 */
export const setBoardFavoriteInput = z.object({
  boardId: idSchema,
  favorited: z.boolean(),
  ...withClientMutationId,
});

export type SetBoardFavoriteInput = z.infer<typeof setBoardFavoriteInput>;
