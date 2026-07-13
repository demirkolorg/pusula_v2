/**
 * Public API + Bot Erişimi (Task 4) — liste uçları.
 *
 *   POST  /lists                 → list.create
 *   PATCH /lists/:listId         → list.update
 *   POST  /lists/:listId/move    → list.move
 *   POST  /lists/:listId/archive → list.archive (restore: { archived: false })
 *
 * `list.*` procedure'leri `boardProcedure` üzerindedir → input `boardId` taşımak
 * zorundadır; hepsinde `boardId = key.boardId` verilir. `:listId` uçlarında ek
 * olarak listenin board'u `key.boardId` ile doğrulanır (çapraz board → 403).
 * Tüm mutasyonlar `Idempotency-Key` ister.
 */
import { Hono } from 'hono';
import type { ApiKeyAuthEnv } from '../../middleware/api-key-auth';
import { withClientMutationId } from '../../public-api/caller';
import {
  keyBoardId,
  pickPresent,
  readBody,
  requireIdempotencyKey,
  requireListInBoard,
  respond,
} from './shared';

export const listsPublicRoute = new Hono<ApiKeyAuthEnv>();

// POST /lists — create a list at the end of the board. Board member+.
listsPublicRoute.post('/', async (c) => {
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    {
      boardId: keyBoardId(c),
      title: body.title,
      ...pickPresent(body, ['beforeListId', 'afterListId']),
    },
    idem.key,
  );
  return respond(c, (caller) => caller.list.create(input as never), 201);
});

// PATCH /lists/:listId — update title / color / icon / iconColor. Board member+.
listsPublicRoute.patch('/:listId', async (c) => {
  const listId = c.req.param('listId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireListInBoard(c, listId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    {
      boardId: keyBoardId(c),
      listId,
      ...pickPresent(body, ['title', 'color', 'icon', 'iconColor']),
    },
    idem.key,
  );
  return respond(c, (caller) => caller.list.update(input as never));
});

// POST /lists/:listId/move — reorder a list within its board. Board member+.
listsPublicRoute.post('/:listId/move', async (c) => {
  const listId = c.req.param('listId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireListInBoard(c, listId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    {
      boardId: keyBoardId(c),
      listId,
      ...pickPresent(body, ['beforeListId', 'afterListId', 'newPosition']),
    },
    idem.key,
  );
  return respond(c, (caller) => caller.list.move(input as never));
});

// POST /lists/:listId/archive — archive or restore ({ archived: false }). Board member+.
listsPublicRoute.post('/:listId/archive', async (c) => {
  const listId = c.req.param('listId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireListInBoard(c, listId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    {
      boardId: keyBoardId(c),
      listId,
      ...pickPresent(body, ['archived']),
    },
    idem.key,
  );
  return respond(c, (caller) => caller.list.archive(input as never));
});
