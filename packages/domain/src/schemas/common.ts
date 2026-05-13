import { z } from 'zod';

/** Opaque entity id (nanoid-style). */
export const idSchema = z.string().min(1).max(64);

/**
 * Client-generated id carried by every collaborative mutation so the backend
 * can (eventually) de-duplicate retries and the originating client can ignore
 * its own realtime echo. Phase 4 client emits one with `crypto.randomUUID()`
 * (UUID v4); the schema accepts any UUID format. Optional on the wire — see
 * `withClientMutationId` and the karar kaydı 2026-05-13 in
 * `docs/architecture/02-teknoloji-kararlari.md` (Faz 4 "önce belge"). Server
 * idempotency is only logged in Phase 4 (DEM-78); real short-window dedupe
 * lands in Phase 5 (DEM-28) together with the outbox + realtime echo filter.
 */
export const clientMutationIdSchema = z.string().uuid();

/**
 * Mixin: spread into a collaborative mutation input schema's `.object({ ... })`.
 * The field is OPTIONAL — clients may omit it (back-compat + simpler tests /
 * server-to-server callers); Phase 4C UI always emits one.
 */
export const withClientMutationId = {
  clientMutationId: clientMutationIdSchema.optional(),
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
