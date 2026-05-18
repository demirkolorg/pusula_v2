import { z } from 'zod';
import { idSchema, withClientMutationId } from './common';

/**
 * The body of a Hızlı Not (DEM-203). Trimmed, never empty, capped at 500 chars
 * — same shape discipline as `cardTitleSchema`, just a tighter ceiling (a quick
 * note is a short capture, not a card description).
 */
export const quickNoteContentSchema = z.string().trim().min(1).max(500);

/** `quickNote.create` — `{ content }`; the owner is the session user. */
export const createQuickNoteInput = z.object({
  content: quickNoteContentSchema,
});

/** `quickNote.update` — edit a note's body; ownership is checked server-side. */
export const updateQuickNoteInput = z.object({
  noteId: idSchema,
  content: quickNoteContentSchema,
});

/** `quickNote.delete` — remove a note; idempotent (missing note → silent no-op). */
export const deleteQuickNoteInput = z.object({
  noteId: idSchema,
});

/**
 * `quickNote.convertToCard` — turn a note into a card at the end of `listId`.
 * The note's `content` becomes the card title; the note is deleted in the same
 * transaction. Carries `clientMutationId` like every collaborative mutation
 * (the card-creation step writes activity / realtime / outbox rows).
 */
export const convertQuickNoteToCardInput = z.object({
  noteId: idSchema,
  listId: idSchema,
  ...withClientMutationId,
});

export type CreateQuickNoteInput = z.infer<typeof createQuickNoteInput>;
export type UpdateQuickNoteInput = z.infer<typeof updateQuickNoteInput>;
export type DeleteQuickNoteInput = z.infer<typeof deleteQuickNoteInput>;
export type ConvertQuickNoteToCardInput = z.infer<typeof convertQuickNoteToCardInput>;
