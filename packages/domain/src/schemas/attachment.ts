import { z } from 'zod';
import {
  ATTACHMENT_DESCRIPTION_MAX_LEN,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_TYPES,
  CARD_COVER_IMAGE_MAX_BYTES,
  CARD_COVER_IMAGE_MIME_TYPES,
} from '../constants';
import { idSchema, withClientMutationId } from './common';

/** MIME type accepted for card cover image uploads (DEM-110 narrow path). */
export const coverImageMimeTypeSchema = z.enum(CARD_COVER_IMAGE_MIME_TYPES);

/**
 * MIME type accepted for a general Faz 11 attachment upload — strict
 * superset of `coverImageMimeTypeSchema`. Validated client + server;
 * the DB has no CHECK constraint (consistent with `labels.color`).
 */
export const attachmentMimeTypeSchema = z.enum(ATTACHMENT_MIME_TYPES);

/**
 * Optional caption stored verbatim in `attachments.description`. `undefined`
 * = column stays `NULL`; an explicit `""` is normalized to `undefined`
 * (trim-first so whitespace-only captions don't survive). Plain text only —
 * Tiptap JSON is reserved for the card description and comment bodies.
 */
export const attachmentDescriptionSchema = z
  .string()
  .trim()
  .max(ATTACHMENT_DESCRIPTION_MAX_LEN)
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

/** Legacy DEM-110 cover-image presign input — kept as-is for the narrow cover path. */
export const createAttachmentUploadInput = z.object({
  cardId: idSchema,
  fileName: z.string().trim().min(1).max(255),
  mimeType: coverImageMimeTypeSchema,
  size: z.number().int().positive().max(CARD_COVER_IMAGE_MAX_BYTES),
});

/** Legacy DEM-110 download URL input — kept as-is. */
export const getAttachmentDownloadUrlInput = z.object({
  attachmentId: idSchema,
});

/**
 * Faz 11 (DEM-147) — first half of the two-phase attachment commit. Inserts
 * a draft row (`committed_at IS NULL`) and returns the presigned PUT URL;
 * does *not* write activity / realtime / notification events.
 */
export const attachmentInitiateInput = z.object({
  cardId: idSchema,
  fileName: z.string().trim().min(1).max(255),
  mimeType: attachmentMimeTypeSchema,
  size: z.number().int().positive().max(ATTACHMENT_MAX_BYTES),
  description: attachmentDescriptionSchema,
  ...withClientMutationId,
});

/**
 * Faz 11 (DEM-147) — second half of the two-phase commit. Stamps
 * `committed_at = NOW()` and writes activity / realtime / notification
 * outbox in the same transaction.
 */
export const attachmentCommitInput = z.object({
  attachmentId: idSchema,
  ...withClientMutationId,
});

/** List committed attachments for a card (`committed_at IS NOT NULL`). */
export const attachmentListInput = z.object({
  cardId: idSchema,
});

/** Edit the optional description after commit. */
export const attachmentUpdateInput = z.object({
  attachmentId: idSchema,
  description: attachmentDescriptionSchema,
  ...withClientMutationId,
});

/** Delete an attachment (uploader or board admin); cleanup is queued post-commit. */
export const attachmentDeleteInput = z.object({
  attachmentId: idSchema,
  ...withClientMutationId,
});

export type CreateAttachmentUploadInput = z.infer<typeof createAttachmentUploadInput>;
export type GetAttachmentDownloadUrlInput = z.infer<typeof getAttachmentDownloadUrlInput>;
export type AttachmentInitiateInput = z.infer<typeof attachmentInitiateInput>;
export type AttachmentCommitInput = z.infer<typeof attachmentCommitInput>;
export type AttachmentListInput = z.infer<typeof attachmentListInput>;
export type AttachmentUpdateInput = z.infer<typeof attachmentUpdateInput>;
export type AttachmentDeleteInput = z.infer<typeof attachmentDeleteInput>;
