/**
 * Public API + Bot Erişimi (Task 4) — kart uçları.
 *
 *   POST   /cards                     → card.create   (scope: listId ∈ key board)
 *   GET    /cards/archived            → card.listArchived
 *   GET    /cards/:cardId             → card.get
 *   PATCH  /cards/:cardId             → card.update
 *   POST   /cards/:cardId/move        → card.move        (+ hedef liste scope)
 *   POST   /cards/:cardId/move-to-list→ card.moveToList  (+ hedef liste scope)
 *   POST   /cards/:cardId/copy        → card.copy        (+ hedef liste scope)
 *   POST   /cards/:cardId/archive     → card.archive     (restore: { archived:false })
 *   POST   /cards/:cardId/complete    → card.complete
 *   POST   /cards/:cardId/uncomplete  → card.uncomplete
 *   GET    /cards/:cardId/activity    → card.activity.list
 *
 * `:cardId` uçlarında kartın board'u `key.boardId` ile doğrulanır (yoksa 404,
 * eşleşmezse 403). `move` / `move-to-list` / `copy` hedef listesi de `key.boardId`
 * şartına bağlanır (çapraz board sızıntısı → 403). Kart açıklaması (`description`)
 * web'de Tiptap JSON string ya da legacy düz metin olarak render edilir; API düz
 * metni Tiptap'a çevirir (`richTextInputToString`, comment/checklist ile
 * simetrik). Yalnız gönderilen alanlar taşınır (`'field' in input` presence
 * semantiği). Tüm mutasyonlar `Idempotency-Key` ister.
 */
import { Hono } from 'hono';
import type { ApiKeyAuthEnv } from '../../middleware/api-key-auth';
import { withClientMutationId } from '../../public-api/caller';
import {
  keyBoardId,
  pickPresent,
  readBody,
  requireCardInBoard,
  requireIdempotencyKey,
  requireListInBoard,
  respond,
  richTextInputToString,
} from './shared';

export const cardsPublicRoute = new Hono<ApiKeyAuthEnv>();

// POST /cards — create a card at the end of a list. Board member+.
cardsPublicRoute.post('/', async (c) => {
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const body = await readBody(c);
  // Scope the target list to this key's board when a listId is supplied; a
  // non-string listId falls through to the procedure's Zod (BAD_REQUEST).
  if (typeof body.listId === 'string') {
    const scope = await requireListInBoard(c, body.listId);
    if (!scope.ok) return scope.res;
  }
  const input = withClientMutationId(
    {
      title: body.title,
      ...pickPresent(body, ['listId', 'beforeCardId', 'afterCardId']),
    },
    idem.key,
  );
  return respond(c, (caller) => caller.card.create(input as never), 201);
});

// GET /cards/archived — archived cards for the board, newest archive first.
cardsPublicRoute.get('/archived', (c) =>
  respond(c, (caller) => caller.card.listArchived({ boardId: keyBoardId(c) })),
);

// GET /cards/:cardId — a single card + the caller's relationships.
cardsPublicRoute.get('/:cardId', async (c) => {
  const cardId = c.req.param('cardId');
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  return respond(c, (caller) => caller.card.get({ cardId }));
});

// GET /cards/:cardId/activity — the card's activity feed (newest first, ≤ 50).
cardsPublicRoute.get('/:cardId/activity', async (c) => {
  const cardId = c.req.param('cardId');
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  return respond(c, (caller) => caller.card.activity.list({ cardId }));
});

// PATCH /cards/:cardId — update title / description / dueAt / cover. Board member+.
cardsPublicRoute.patch('/:cardId', async (c) => {
  const cardId = c.req.param('cardId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    {
      cardId,
      ...pickPresent(body, ['title', 'dueAt', 'coverColor', 'coverImageAttachmentId']),
      // `description` is a rich-text string column (Tiptap JSON string or legacy
      // plain text — the exact shape the web editor persists). Normalize like
      // comment body / checklist item content: a plain string → a minimal Tiptap
      // doc string; a Tiptap JSON object → serialized as-is. Only forwarded when
      // the client actually sent it (`'field' in input` presence semantics).
      ...('description' in body ? { description: richTextInputToString(body.description) } : {}),
    },
    idem.key,
  );
  return respond(c, (caller) => caller.card.update(input as never));
});

// POST /cards/:cardId/move — reorder / re-parent within the same board.
cardsPublicRoute.post('/:cardId/move', async (c) => {
  const cardId = c.req.param('cardId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  if (typeof body.toListId === 'string') {
    const target = await requireListInBoard(c, body.toListId, 'Hedef liste bulunamadı.');
    if (!target.ok) return target.res;
  }
  const input = withClientMutationId(
    {
      cardId,
      ...pickPresent(body, ['fromListId', 'toListId', 'beforeCardId', 'afterCardId', 'newPosition']),
    },
    idem.key,
  );
  return respond(c, (caller) => caller.card.move(input as never));
});

// POST /cards/:cardId/move-to-list — move to any list in THIS board (cross-board → 403).
cardsPublicRoute.post('/:cardId/move-to-list', async (c) => {
  const cardId = c.req.param('cardId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  if (typeof body.toListId === 'string') {
    const target = await requireListInBoard(c, body.toListId, 'Hedef liste bulunamadı.');
    if (!target.ok) return target.res;
  }
  const input = withClientMutationId(
    {
      cardId,
      ...pickPresent(body, ['toListId', 'beforeCardId', 'afterCardId', 'newPosition']),
    },
    idem.key,
  );
  return respond(c, (caller) => caller.card.moveToList(input as never));
});

// POST /cards/:cardId/copy — copy to any list in THIS board (cross-board → 403).
cardsPublicRoute.post('/:cardId/copy', async (c) => {
  const cardId = c.req.param('cardId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  if (typeof body.toListId === 'string') {
    const target = await requireListInBoard(c, body.toListId, 'Hedef liste bulunamadı.');
    if (!target.ok) return target.res;
  }
  const input = withClientMutationId(
    {
      cardId,
      ...pickPresent(body, [
        'toListId',
        'beforeCardId',
        'afterCardId',
        'title',
        'includeChecklists',
        'includeMembers',
        'includeLabels',
      ]),
    },
    idem.key,
  );
  return respond(c, (caller) => caller.card.copy(input as never), 201);
});

// POST /cards/:cardId/archive — archive or restore ({ archived: false }). Board member+.
cardsPublicRoute.post('/:cardId/archive', async (c) => {
  const cardId = c.req.param('cardId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    { cardId, ...pickPresent(body, ['archived']) },
    idem.key,
  );
  return respond(c, (caller) => caller.card.archive(input as never));
});

// POST /cards/:cardId/complete — mark complete. Board member+.
cardsPublicRoute.post('/:cardId/complete', async (c) => {
  const cardId = c.req.param('cardId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const input = withClientMutationId({ cardId }, idem.key);
  return respond(c, (caller) => caller.card.complete(input as never));
});

// POST /cards/:cardId/uncomplete — clear completion. Board member+.
cardsPublicRoute.post('/:cardId/uncomplete', async (c) => {
  const cardId = c.req.param('cardId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const input = withClientMutationId({ cardId }, idem.key);
  return respond(c, (caller) => caller.card.uncomplete(input as never));
});
