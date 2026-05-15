import { eq } from '@pusula/db';
import { attachments } from '@pusula/db';
import {
  canEditBoardContent,
  getAttachmentDownloadUrlInput,
  createAttachmentUploadInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { toCoverImage } from '../lib/object-storage';
import type { ObjectStorage } from '../lib/object-storage';
import { accessFromBoardRole } from '../middleware/board';
import { resolveBoardAccess } from '../middleware/board-access';
import { cardProcedure } from '../middleware/card';
import { protectedProcedure, router } from '../trpc';

function requireObjectStorage(ctx: { objectStorage?: ObjectStorage }): ObjectStorage {
  if (!ctx.objectStorage) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Dosya depolama servisi yapilandirilmamis.',
    });
  }
  return ctx.objectStorage;
}

function safeStorageFileName(fileName: string): string {
  const safe = fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return safe.length > 0 ? safe : 'cover-image';
}

export const attachmentRouter = router({
  createUpload: cardProcedure
    .input(createAttachmentUploadInput)
    .mutation(async ({ ctx, input }) => {
      if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Dosya yukleme yetkiniz yok.' });
      }
      if (ctx.card.boardArchivedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Arsivli board icin dosya yuklenemez.',
        });
      }

      const objectStorage = requireObjectStorage(ctx);
      const storageKey = `boards/${ctx.card.boardId}/cards/${ctx.card.id}/${crypto.randomUUID()}-${safeStorageFileName(
        input.fileName,
      )}`;

      const [attachment] = await ctx.db
        .insert(attachments)
        .values({
          cardId: ctx.card.id,
          boardId: ctx.card.boardId,
          uploaderId: ctx.session.user.id,
          storageKey,
          fileName: input.fileName,
          mimeType: input.mimeType,
          size: input.size,
        })
        .returning();
      if (!attachment) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const upload = await objectStorage.createPresignedPutUrl({
        key: storageKey,
        contentType: input.mimeType,
        contentLength: input.size,
      });

      return {
        attachment: toCoverImage(attachment),
        upload,
      };
    }),

  getDownloadUrl: protectedProcedure
    .input(getAttachmentDownloadUrlInput)
    .query(async ({ ctx, input }) => {
      const [attachment] = await ctx.db
        .select()
        .from(attachments)
        .where(eq(attachments.id, input.attachmentId))
        .limit(1);
      if (!attachment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dosya bulunamadi.' });
      }

      await resolveBoardAccess(ctx.db, attachment.boardId, ctx.session.user.id);
      const objectStorage = requireObjectStorage(ctx);
      const url = await objectStorage.createPresignedGetUrl({ key: attachment.storageKey });
      return { url };
    }),
});
