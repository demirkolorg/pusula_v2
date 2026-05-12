import { z } from 'zod';

/** Opaque entity id (nanoid-style). */
export const idSchema = z.string().min(1).max(64);

/**
 * Client-generated id carried by every state-changing mutation so the backend
 * can de-duplicate retries and so the originating client can ignore its own
 * realtime echo. See `docs/PUSULA_TEKNIK_MIMARI.md` §7.
 */
export const clientMutationIdSchema = z.string().min(8).max(64);

/** Mixin: spread into a mutation input schema's `.object({ ... })`. */
export const withClientMutationId = {
  clientMutationId: clientMutationIdSchema,
};

export const paginationInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationInputSchema>;

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
