/**
 * Public API + Bot Erişimi (Task 5) — kart üyesi + kart etiketi uçları.
 *
 *   GET    /cards/:cardId/members            → card.members.list
 *   POST   /cards/:cardId/members            → card.members.add
 *   DELETE /cards/:cardId/members/:userId    → card.members.remove
 *   POST   /cards/:cardId/labels             → card.labels.add
 *   DELETE /cards/:cardId/labels/:labelId    → card.labels.remove
 *
 * Hepsi `cardProcedure` üzerindedir → input `cardId` taşır; her istekte kartın
 * board'u `key.boardId` ile doğrulanır (`requireCardInBoard`). `card.members.add`
 * self-add'i reddeder (DEM-298 — procedure `FORBIDDEN` → 403; bot kendini
 * ekleyemez). `card.members.remove` `role`'ü path'te değil gövdede bekler
 * (`assignee`/`watcher`); `card.labels.remove` `labelId`'yi path'ten alır. Tüm
 * mutasyonlar `Idempotency-Key` ister.
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
} from './shared';

export const cardMembersPublicRoute = new Hono<ApiKeyAuthEnv>();

// GET /cards/:cardId/members — the card's assignees / watchers.
cardMembersPublicRoute.get('/:cardId/members', async (c) => {
  const cardId = c.req.param('cardId');
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  return respond(c, (caller) => caller.card.members.list({ cardId }));
});

// POST /cards/:cardId/members — add a member ({ userId, role }). Board member+.
cardMembersPublicRoute.post('/:cardId/members', async (c) => {
  const cardId = c.req.param('cardId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    { cardId, ...pickPresent(body, ['userId', 'role']) },
    idem.key,
  );
  return respond(c, (caller) => caller.card.members.add(input as never), 201);
});

// DELETE /cards/:cardId/members/:userId — remove a member ({ role } in body). Board member+.
cardMembersPublicRoute.delete('/:cardId/members/:userId', async (c) => {
  const cardId = c.req.param('cardId');
  const userId = c.req.param('userId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    { cardId, userId, ...pickPresent(body, ['role']) },
    idem.key,
  );
  return respond(c, (caller) => caller.card.members.remove(input as never));
});

// POST /cards/:cardId/labels — attach a label ({ labelId }). Board member+.
cardMembersPublicRoute.post('/:cardId/labels', async (c) => {
  const cardId = c.req.param('cardId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId({ cardId, ...pickPresent(body, ['labelId']) }, idem.key);
  return respond(c, (caller) => caller.card.labels.add(input as never), 201);
});

// DELETE /cards/:cardId/labels/:labelId — detach a label. Board member+.
cardMembersPublicRoute.delete('/:cardId/labels/:labelId', async (c) => {
  const cardId = c.req.param('cardId');
  const labelId = c.req.param('labelId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const input = withClientMutationId({ cardId, labelId }, idem.key);
  return respond(c, (caller) => caller.card.labels.remove(input as never));
});
