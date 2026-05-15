import { z } from 'zod';
import { CARD_COVER_IMAGE_MAX_BYTES, CARD_COVER_IMAGE_MIME_TYPES } from '../constants';
import { idSchema } from './common';

/** MIME type accepted for card cover image uploads. */
export const coverImageMimeTypeSchema = z.enum(CARD_COVER_IMAGE_MIME_TYPES);

export const createAttachmentUploadInput = z.object({
  cardId: idSchema,
  fileName: z.string().trim().min(1).max(255),
  mimeType: coverImageMimeTypeSchema,
  size: z.number().int().positive().max(CARD_COVER_IMAGE_MAX_BYTES),
});

export const getAttachmentDownloadUrlInput = z.object({
  attachmentId: idSchema,
});

export type CreateAttachmentUploadInput = z.infer<typeof createAttachmentUploadInput>;
export type GetAttachmentDownloadUrlInput = z.infer<typeof getAttachmentDownloadUrlInput>;
