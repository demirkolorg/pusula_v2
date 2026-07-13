/**
 * Public API + Bot Erişimi (Task 6) — ek (attachment) presigned akışı.
 *
 *   POST   /cards/:cardId/attachments/initiate                → attachment.initiate
 *   POST   /cards/:cardId/attachments/commit                  → attachment.commit
 *   GET    /cards/:cardId/attachments                         → attachment.list
 *   PATCH  /cards/:cardId/attachments/:attachmentId           → attachment.update
 *   DELETE /cards/:cardId/attachments/:attachmentId           → attachment.delete
 *   GET    …/attachments/:attachmentId/download-url           → attachment.getDownloadUrl
 *
 * İki fazlı commit: `initiate` (cardProcedure, member+) taslak satır + presigned
 * PUT URL üretir; bot doğrudan MinIO/S3'e yükler; `commit` (protectedProcedure)
 * `committed_at`'i damgalar. `commit`/`update`/`delete`/`getDownloadUrl`
 * `attachmentId` alır (cardId path yalnız yönlendirme); scope iki katman:
 *  - `requireCardInBoard` — path kartı `key.boardId` içinde mi,
 *  - `requireAttachmentInBoard` — ekin board'u `key.boardId` mi (yoksa 404/403).
 * `attachment.commit` `uploaderId === session.user.id` invariant'ını uygular:
 * initiate + commit aynı bot session'ıyla çağrıldığından tutarlı; farklı key'in
 * initiate ettiği eki commit'lemek procedure `FORBIDDEN`'ına takılır → 403.
 * Mutasyonlar (`getDownloadUrl` bir query — GET, idempotency yok) `Idempotency-Key`
 * ister.
 */
import { Hono } from 'hono';
import type { ApiKeyAuthEnv } from '../../middleware/api-key-auth';
import { withClientMutationId } from '../../public-api/caller';
import {
  pickPresent,
  readBody,
  requireAttachmentInBoard,
  requireCardInBoard,
  requireIdempotencyKey,
  respond,
} from './shared';

export const attachmentsPublicRoute = new Hono<ApiKeyAuthEnv>();

// POST /cards/:cardId/attachments/initiate — reserve a draft + presigned PUT. Board member+.
attachmentsPublicRoute.post('/:cardId/attachments/initiate', async (c) => {
  const cardId = c.req.param('cardId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    {
      cardId,
      ...pickPresent(body, ['checklistItemId', 'fileName', 'mimeType', 'size', 'description']),
    },
    idem.key,
  );
  return respond(c, (caller) => caller.attachment.initiate(input as never), 201);
});

// POST /cards/:cardId/attachments/commit — stamp committed_at ({ attachmentId } in body). Board member+.
attachmentsPublicRoute.post('/:cardId/attachments/commit', async (c) => {
  const cardId = c.req.param('cardId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const body = await readBody(c);
  if (typeof body.attachmentId === 'string') {
    const target = await requireAttachmentInBoard(c, body.attachmentId);
    if (!target.ok) return target.res;
  }
  const input = withClientMutationId({ ...pickPresent(body, ['attachmentId']) }, idem.key);
  return respond(c, (caller) => caller.attachment.commit(input as never));
});

// GET /cards/:cardId/attachments — committed attachments for the card / item.
attachmentsPublicRoute.get('/:cardId/attachments', async (c) => {
  const cardId = c.req.param('cardId');
  const checklistItemId = c.req.query('checklistItemId');
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  return respond(c, (caller) =>
    caller.attachment.list({
      cardId,
      ...(checklistItemId !== undefined ? { checklistItemId } : {}),
    }),
  );
});

// PATCH /cards/:cardId/attachments/:attachmentId — edit description. Uploader / board admin.
attachmentsPublicRoute.patch('/:cardId/attachments/:attachmentId', async (c) => {
  const cardId = c.req.param('cardId');
  const attachmentId = c.req.param('attachmentId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const target = await requireAttachmentInBoard(c, attachmentId);
  if (!target.ok) return target.res;
  const body = await readBody(c);
  const input = withClientMutationId(
    { attachmentId, ...pickPresent(body, ['description']) },
    idem.key,
  );
  return respond(c, (caller) => caller.attachment.update(input as never));
});

// DELETE /cards/:cardId/attachments/:attachmentId — delete an attachment. Uploader / board admin.
attachmentsPublicRoute.delete('/:cardId/attachments/:attachmentId', async (c) => {
  const cardId = c.req.param('cardId');
  const attachmentId = c.req.param('attachmentId');
  const idem = requireIdempotencyKey(c);
  if (!idem.ok) return idem.res;
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const target = await requireAttachmentInBoard(c, attachmentId);
  if (!target.ok) return target.res;
  const input = withClientMutationId({ attachmentId }, idem.key);
  return respond(c, (caller) => caller.attachment.delete(input as never));
});

// GET …/attachments/:attachmentId/download-url — presigned GET URL (viewer+).
attachmentsPublicRoute.get('/:cardId/attachments/:attachmentId/download-url', async (c) => {
  const cardId = c.req.param('cardId');
  const attachmentId = c.req.param('attachmentId');
  const scope = await requireCardInBoard(c, cardId);
  if (!scope.ok) return scope.res;
  const target = await requireAttachmentInBoard(c, attachmentId);
  if (!target.ok) return target.res;
  return respond(c, (caller) => caller.attachment.getDownloadUrl({ attachmentId }));
});
