import { z } from 'zod';
import { LIST_COLORS, LIST_ICON_COLORS, LIST_ICONS } from '../constants';
import { idSchema, withClientMutationId } from './common';

export const listTitleSchema = z.string().trim().min(1).max(120);
export const listColorSchema = z.enum(LIST_COLORS);
export const listIconSchema = z.enum(LIST_ICONS);
export const listIconColorSchema = z.enum(LIST_ICON_COLORS);

export const createListInput = z.object({
  boardId: idSchema,
  title: listTitleSchema,
  /** Optional explicit placement; defaults to end of board. */
  beforeListId: idSchema.nullish(),
  afterListId: idSchema.nullish(),
  ...withClientMutationId,
});

export const renameListInput = z.object({
  listId: idSchema,
  title: listTitleSchema,
  ...withClientMutationId,
});

export const updateListInput = z
  .object({
    listId: idSchema,
    title: listTitleSchema.optional(),
    color: listColorSchema.nullable().optional(),
    icon: listIconSchema.nullable().optional(),
    iconColor: listIconColorSchema.nullable().optional(),
    ...withClientMutationId,
  })
  .refine(
    (input) =>
      input.title !== undefined ||
      input.color !== undefined ||
      input.icon !== undefined ||
      input.iconColor !== undefined,
    {
      message: 'At least one list field must be provided',
      path: ['title'],
    },
  );

export const moveListInput = z.object({
  /**
   * Board the list belongs to — carried so `boardProcedure` can resolve the
   * caller's board role from the input (same discipline as `createListInput`).
   */
  boardId: idSchema,
  listId: idSchema,
  beforeListId: idSchema.nullish(),
  afterListId: idSchema.nullish(),
  /** Optional client-computed position; the server validates / recomputes. */
  newPosition: z.string().optional(),
  ...withClientMutationId,
});

/**
 * `list.moveToBoard` input — listeyi tüm kartlarıyla başka panoya taşır
 * (2026-07-14; cross-workspace dahil). Kaynak board `member+` + hedef board
 * `member+` ister; liste hedef panonun sonuna eklenir. Aynı-board sıralama
 * `list.move`'dur. Kurallar: `docs/domain/02-yetkilendirme-kurallari.md`
 * drag-drop/move haritası.
 */
export const moveListToBoardInput = z.object({
  /** Kaynak board — `boardProcedure` rolü bu input'tan çözer (`moveListInput` disiplini). */
  boardId: idSchema,
  listId: idSchema,
  toBoardId: idSchema,
  ...withClientMutationId,
});

/**
 * `list.moveAllCards` input — bir listedeki tüm aktif kartları **aynı board
 * içinde** başka bir listenin sonuna toplu taşır (2026-07-14; Trello "Move all
 * cards in this list"). Kaynak/hedef aynı board `member+` ister; kaynak = hedef
 * veya kaynak boş → no-op. Düşük-sinyal toplu işlem: activity/bildirim üretmez,
 * yalnız `boards.version++` + realtime refetch. Kurallar:
 * `docs/domain/02-yetkilendirme-kurallari.md` drag-drop/move haritası.
 */
export const moveAllCardsInput = z.object({
  boardId: idSchema,
  fromListId: idSchema,
  toListId: idSchema,
  ...withClientMutationId,
});

export const archiveListInput = z.object({
  listId: idSchema,
  archived: z.boolean().default(true),
  ...withClientMutationId,
});

/**
 * Permanently delete a list (Faz 17 — 2026-06-01). Hard delete; cascades remove
 * the list's cards and their dependents (members, labels, checklists, comments,
 * attachments). Server-side gate: only an *empty* list (no cards, active or
 * archived) may be deleted; board admin+ only. Idempotent on `clientMutationId`.
 */
export const deleteListInput = z.object({
  listId: idSchema,
  ...withClientMutationId,
});

export type CreateListInput = z.infer<typeof createListInput>;
export type RenameListInput = z.infer<typeof renameListInput>;
export type UpdateListInput = z.infer<typeof updateListInput>;
export type MoveListInput = z.infer<typeof moveListInput>;
export type MoveListToBoardInput = z.infer<typeof moveListToBoardInput>;
export type MoveAllCardsInput = z.infer<typeof moveAllCardsInput>;
export type ArchiveListInput = z.infer<typeof archiveListInput>;
export type DeleteListInput = z.infer<typeof deleteListInput>;
