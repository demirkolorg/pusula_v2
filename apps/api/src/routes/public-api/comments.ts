/**
 * Public API + Bot Erişimi (Task 5) — yorum uçları.
 *
 *   GET    /cards/:cardId/comments               → comment.list
 *   POST   /cards/:cardId/comments               → comment.create
 *   PATCH  /cards/:cardId/comments/:commentId    → comment.update (yalnız kendi yorumu)
 *   DELETE /cards/:cardId/comments/:commentId    → comment.delete (yalnız kendi yorumu)
 *
 * `comment.*` procedure'leri `cardProcedure` üzerindedir → input `cardId` taşır;
 * her istekte kartın board'u `key.boardId` ile doğrulanır (`requireCardInBoard`).
 * Yorum gövdesi (`body`) rich-text string kolonudur (`commentBodySchema =
 * z.string()`) → `richTextInputToString` ile normalize edilir (bot düz string ya
 * da Tiptap JSON obje gönderebilir). `create` / `update` / `list` yanıtlarına ham
 * `body` yanında bir `previewText` alanı eklenir (`richTextPreview` — mevcut
 * plaintext indirgeme). `comment.update`/`delete` başkasının yorumunda procedure
 * `FORBIDDEN` fırlatır → 403. Tüm mutasyonlar `Idempotency-Key` ister.
 */
import { Hono } from 'hono';
import { richTextPreview } from '@pusula/api/lib/rich-text-preview';
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

export const commentsPublicRoute = new Hono<ApiKeyAuthEnv>();

/** Attach a `previewText` (plain-text reduction of the raw `body`) to a comment. */
function withPreviewText<T extends { body?: unknown }>(comment: T): T & { previewText: string } {
  return { ...comment, previewText: richTextPreview(comment.body) };
}

// GET /cards/:cardId/comments — card- or checklist-item-scoped comment thread.
commentsPublicRoute.get('/:cardId/comments', async (c) => {
  const cardId = c.req.param('cardId');
  const checklistItemId = c.req.query('checklistItemId');
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  return respond(c, async (caller) => {
    const comments = await caller.comment.list({
      cardId,
      ...(checklistItemId !== undefined ? { checklistItemId } : {}),
    });
    return comments.map((comment) => withPreviewText(comment));
  });
});

// POST /cards/:cardId/comments — add a comment. Board member+.
commentsPublicRoute.post('/:cardId/comments', async (c) => {
  const cardId = c.req.param('cardId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    {
      cardId,
      body: richTextInputToString(body.body),
      ...pickPresent(body, ['checklistItemId']),
    },
    idem.key,
  );
  return respond(
    c,
    async (caller) => withPreviewText(await caller.comment.create(input as never)),
    201,
  );
});

// PATCH /cards/:cardId/comments/:commentId — edit own comment. Board member+.
commentsPublicRoute.patch('/:cardId/comments/:commentId', async (c) => {
  const cardId = c.req.param('cardId');
  const commentId = c.req.param('commentId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    { cardId, commentId, body: richTextInputToString(body.body) },
    idem.key,
  );
  return respond(c, async (caller) => withPreviewText(await caller.comment.update(input as never)));
});

// DELETE /cards/:cardId/comments/:commentId — soft-delete own comment. Board member+.
commentsPublicRoute.delete('/:cardId/comments/:commentId', async (c) => {
  const cardId = c.req.param('cardId');
  const commentId = c.req.param('commentId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const input = withClientMutationId({ cardId, commentId }, idem.key);
  return respond(c, (caller) => caller.comment.delete(input as never));
});
