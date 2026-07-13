/**
 * Public API + Bot Erişimi (Task 5) — checklist + checklist-item uçları.
 *
 *   GET    /cards/:cardId/checklists                          → checklist.list
 *   POST   /cards/:cardId/checklists                          → checklist.create
 *   POST   /cards/:cardId/checklists/bulk-import              → checklist.bulkImport
 *   PATCH  /cards/:cardId/checklists/:checklistId             → checklist.update
 *   POST   /cards/:cardId/checklists/:checklistId/archive     → checklist.archive
 *   DELETE /cards/:cardId/checklists/:checklistId             → checklist.delete
 *   POST   /cards/:cardId/checklists/:checklistId/items       → checklist.item.create
 *   PATCH  …/items/:itemId                                    → checklist.item.update
 *   POST   …/items/:itemId/toggle                             → checklist.item.toggle
 *   POST   …/items/:itemId/reorder                            → checklist.item.reorder
 *   DELETE …/items/:itemId                                    → checklist.item.delete
 *
 * `checklist.*` procedure'leri `cardProcedure` üzerindedir → input `cardId`
 * taşır; her istekte kartın board'u `key.boardId` ile doğrulanır
 * (`requireCardInBoard`; yoksa 404, eşleşmezse 403). Checklist başlığı düz metin,
 * ama **madde içeriği** (`content`) rich-text string kolonudur
 * (`checklistItemContentSchema = z.string()`; ya legacy düz metin ya
 * `JSON.stringify(tiptapDoc)`) → `richTextInputToString` ile normalize edilir
 * (bot düz string ya da Tiptap JSON obje gönderebilir). Toplu içe aktarma
 * (`bulk-import`) satırları düz metin sözleşmesini korur (dönüşüm yok — web
 * bulk-import ile simetrik). Tüm mutasyonlar `Idempotency-Key` ister.
 */
import { Hono } from 'hono';
import type { ApiKeyAuthEnv } from '../../middleware/api-key-auth';
import { withClientMutationId } from '../../public-api/caller';
import {
  pickPresent,
  readBody,
  requireCardInBoard,
  requireIdempotencyKey,
  respond,
  richTextInputToString,
} from './shared';

export const checklistsPublicRoute = new Hono<ApiKeyAuthEnv>();

// GET /cards/:cardId/checklists — a card's checklists, each with its items.
checklistsPublicRoute.get('/:cardId/checklists', async (c) => {
  const cardId = c.req.param('cardId');
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  return respond(c, (caller) => caller.checklist.list({ cardId }));
});

// POST /cards/:cardId/checklists — append a checklist to the card. Board member+.
checklistsPublicRoute.post('/:cardId/checklists', async (c) => {
  const cardId = c.req.param('cardId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId({ cardId, title: body.title }, idem.key);
  return respond(c, (caller) => caller.checklist.create(input as never), 201);
});

// POST /cards/:cardId/checklists/bulk-import — import N checklists + items.
checklistsPublicRoute.post('/:cardId/checklists/bulk-import', async (c) => {
  const cardId = c.req.param('cardId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  // `checklists` array passes through verbatim (plain-text lines contract);
  // the procedure's Zod validates shape + limits.
  const input = withClientMutationId(
    { cardId, ...pickPresent(body, ['checklists']) },
    idem.key,
  );
  return respond(c, (caller) => caller.checklist.bulkImport(input as never), 201);
});

// PATCH /cards/:cardId/checklists/:checklistId — rename a checklist. Board member+.
checklistsPublicRoute.patch('/:cardId/checklists/:checklistId', async (c) => {
  const cardId = c.req.param('cardId');
  const checklistId = c.req.param('checklistId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    { cardId, checklistId, ...pickPresent(body, ['title']) },
    idem.key,
  );
  return respond(c, (caller) => caller.checklist.update(input as never));
});

// POST /cards/:cardId/checklists/:checklistId/archive — archive / restore ({ archived:false }).
checklistsPublicRoute.post('/:cardId/checklists/:checklistId/archive', async (c) => {
  const cardId = c.req.param('cardId');
  const checklistId = c.req.param('checklistId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    { cardId, checklistId, ...pickPresent(body, ['archived']) },
    idem.key,
  );
  return respond(c, (caller) => caller.checklist.archive(input as never));
});

// DELETE /cards/:cardId/checklists/:checklistId — delete a checklist (items cascade).
checklistsPublicRoute.delete('/:cardId/checklists/:checklistId', async (c) => {
  const cardId = c.req.param('cardId');
  const checklistId = c.req.param('checklistId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const input = withClientMutationId({ cardId, checklistId }, idem.key);
  return respond(c, (caller) => caller.checklist.delete(input as never));
});

// POST /cards/:cardId/checklists/:checklistId/items — append an item. Board member+.
checklistsPublicRoute.post('/:cardId/checklists/:checklistId/items', async (c) => {
  const cardId = c.req.param('cardId');
  const checklistId = c.req.param('checklistId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    {
      cardId,
      checklistId,
      content: richTextInputToString(body.content),
      ...pickPresent(body, ['parentItemId']),
    },
    idem.key,
  );
  return respond(c, (caller) => caller.checklist.item.create(input as never), 201);
});

// PATCH …/items/:itemId — edit item content. Board member+.
checklistsPublicRoute.patch('/:cardId/checklists/:checklistId/items/:itemId', async (c) => {
  const cardId = c.req.param('cardId');
  const checklistId = c.req.param('checklistId');
  const itemId = c.req.param('itemId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    { cardId, checklistId, itemId, content: richTextInputToString(body.content) },
    idem.key,
  );
  return respond(c, (caller) => caller.checklist.item.update(input as never));
});

// POST …/items/:itemId/toggle — check / uncheck. Board member+.
checklistsPublicRoute.post('/:cardId/checklists/:checklistId/items/:itemId/toggle', async (c) => {
  const cardId = c.req.param('cardId');
  const checklistId = c.req.param('checklistId');
  const itemId = c.req.param('itemId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    { cardId, checklistId, itemId, ...pickPresent(body, ['completed']) },
    idem.key,
  );
  return respond(c, (caller) => caller.checklist.item.toggle(input as never));
});

// POST …/items/:itemId/reorder — move within its checklist. Board member+.
checklistsPublicRoute.post('/:cardId/checklists/:checklistId/items/:itemId/reorder', async (c) => {
  const cardId = c.req.param('cardId');
  const checklistId = c.req.param('checklistId');
  const itemId = c.req.param('itemId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    { cardId, checklistId, itemId, ...pickPresent(body, ['beforeItemId', 'afterItemId']) },
    idem.key,
  );
  return respond(c, (caller) => caller.checklist.item.reorder(input as never));
});

// DELETE …/items/:itemId — delete an item (subtree cascades). Board member+.
checklistsPublicRoute.delete('/:cardId/checklists/:checklistId/items/:itemId', async (c) => {
  const cardId = c.req.param('cardId');
  const checklistId = c.req.param('checklistId');
  const itemId = c.req.param('itemId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const input = withClientMutationId({ cardId, checklistId, itemId }, idem.key);
  return respond(c, (caller) => caller.checklist.item.delete(input as never));
});
