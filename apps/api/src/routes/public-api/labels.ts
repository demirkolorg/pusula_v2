/**
 * Public API + Bot Erişimi (Task 5) — etiket (label) uçları.
 *
 *   GET    /labels            → label.list
 *   POST   /labels            → label.create
 *   PATCH  /labels/:labelId   → label.update
 *   DELETE /labels/:labelId   → label.delete
 *
 * `label.*` procedure'leri `boardProcedure` üzerindedir → input `boardId` taşır;
 * hepsinde `boardId = key.boardId` verilir (key tek panoya kilitli, ayrı scope
 * doğrulaması gerekmez — etiketler board-scoped). Tüm mutasyonlar
 * `Idempotency-Key` ister.
 */
import { Hono } from 'hono';
import type { ApiKeyAuthEnv } from '../../middleware/api-key-auth';
import { withClientMutationId } from '../../public-api/caller';
import { keyBoardId, pickPresent, readBody, requireIdempotencyKey, respond } from './shared';

export const labelsPublicRoute = new Hono<ApiKeyAuthEnv>();

// GET /labels — the board's labels. Board viewer+.
labelsPublicRoute.get('/', (c) =>
  respond(c, (caller) => caller.label.list({ boardId: keyBoardId(c) })),
);

// POST /labels — create a label. Board member+.
labelsPublicRoute.post('/', async (c) => {
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    { boardId: keyBoardId(c), ...pickPresent(body, ['color', 'name']) },
    idem.key,
  );
  return respond(c, (caller) => caller.label.create(input as never), 201);
});

// PATCH /labels/:labelId — update colour / name. Board member+.
labelsPublicRoute.patch('/:labelId', async (c) => {
  const labelId = c.req.param('labelId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    { boardId: keyBoardId(c), labelId, ...pickPresent(body, ['color', 'name']) },
    idem.key,
  );
  return respond(c, (caller) => caller.label.update(input as never));
});

// DELETE /labels/:labelId — delete a label. Board member+.
labelsPublicRoute.delete('/:labelId', async (c) => {
  const labelId = c.req.param('labelId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const input = withClientMutationId({ boardId: keyBoardId(c), labelId }, idem.key);
  return respond(c, (caller) => caller.label.delete(input as never));
});
