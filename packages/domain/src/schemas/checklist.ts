/**
 * Checklist / checklist-item input schemas — Phase 2.5A (DEM-50). Every input
 * carries `cardId` because the procedures run on `cardProcedure`, which reads
 * `cardId` from the raw input. All state-changing mutations carry
 * `clientMutationId`. `item.reorder` takes optional `beforeItemId` / `afterItemId`
 * neighbours (both must live in the same checklist) — the server recomputes the
 * fractional `position` from them (`@pusula/domain/position`).
 *
 * See `docs/architecture/03-backend.md` (Faz 2.5 — checklist / checklist.item
 * procedure'leri) and `docs/domain/02-yetkilendirme-kurallari.md`.
 */
import { z } from 'zod';
import { idSchema, withClientMutationId } from './common';

/** Checklist title — non-empty after trimming. */
export const checklistTitleSchema = z.string().trim().min(1).max(500);
/**
 * Checklist item content — non-empty after trimming. **Format-agnostic string**:
 * a single item created / edited from the web carries Tiptap `getJSON()` serialised
 * to a string (same storage as card description / comments), while legacy rows and
 * bulk-import lines carry plain text — both are parsed back with `parseRichTextValue`
 * at render time, so no migration is needed (2026-07-08 karar kaydı). The `max`
 * matches `commentBodySchema` (JSON overhead over the old 2 000 plain-text cap); the
 * single schema is shared by both the per-item create/update and bulk-import (whose
 * lines stay plain text), so the bulk-import plain-text contract is preserved.
 *
 * NOT: `.min(1)` yalnız *string*'in boş olmadığını garanti eder; anlamsal olarak
 * boş bir Tiptap doc (`{"type":"doc","content":[{"type":"paragraph"}]}`) yine geçer.
 * Boş içerik client tarafında engellenir (web `isRichTextEmpty` / `empty` guard'ları,
 * mobil `resolveChecklistItemRename`) — `commentBodySchema` ile aynı desen.
 */
export const checklistItemContentSchema = z.string().trim().min(1).max(20_000);

export const createChecklistInput = z.object({
  cardId: idSchema,
  title: checklistTitleSchema,
  ...withClientMutationId,
});

export const updateChecklistInput = z.object({
  cardId: idSchema,
  checklistId: idSchema,
  title: checklistTitleSchema,
  ...withClientMutationId,
});

export const deleteChecklistInput = z.object({
  cardId: idSchema,
  checklistId: idSchema,
  ...withClientMutationId,
});

/**
 * Checklist arşivle / geri al (invariant 23). `archived: true` → arşive taşır,
 * `false` → aktif listeye geri getirir. İki yönlü tek mutation (`card.archive`
 * deseni). Silmeden göz önünden kaldırma — arşivli checklist salt-görünümdür.
 */
export const archiveChecklistInput = z.object({
  cardId: idSchema,
  checklistId: idSchema,
  archived: z.boolean(),
  ...withClientMutationId,
});

/**
 * İç içe (nested) madde maksimum derinliği — **3 seviye**. Kök madde `depth 0`,
 * çocuk `depth 1`, torun `depth 2`. `item.create` yeni maddenin derinliğini
 * `parent.depth + 1` ile hesaplar; sonuç `>= CHECKLIST_MAX_DEPTH` (yani torunun
 * altına eklemek) reddedilir. Tek kaynak: hem sunucu doğrulaması hem UI'daki
 * "alt madde ekle" görünürlüğü bu sabiti okur.
 */
export const CHECKLIST_MAX_DEPTH = 3;

export const createChecklistItemInput = z.object({
  cardId: idSchema,
  checklistId: idSchema,
  content: checklistItemContentSchema,
  /**
   * İç içe madde için ebeveyn madde id'si (aynı checklist içinde). `null` / eksik
   * = kök (üst düzey) madde. Sunucu ebeveynin aynı checklist'e ait olduğunu ve
   * derinlik sınırını (`CHECKLIST_MAX_DEPTH`) doğrular.
   */
  parentItemId: idSchema.nullish(),
  ...withClientMutationId,
});

export const toggleChecklistItemInput = z.object({
  cardId: idSchema,
  checklistId: idSchema,
  itemId: idSchema,
  completed: z.boolean(),
  ...withClientMutationId,
});

export const updateChecklistItemInput = z.object({
  cardId: idSchema,
  checklistId: idSchema,
  itemId: idSchema,
  content: checklistItemContentSchema,
  ...withClientMutationId,
});

export const deleteChecklistItemInput = z.object({
  cardId: idSchema,
  checklistId: idSchema,
  itemId: idSchema,
  ...withClientMutationId,
});

export const reorderChecklistItemInput = z.object({
  cardId: idSchema,
  checklistId: idSchema,
  itemId: idSchema,
  beforeItemId: idSchema.nullish(),
  afterItemId: idSchema.nullish(),
  ...withClientMutationId,
});

/**
 * Toplu içe aktarma (bulk import) — kullanıcı JSON yapıştırarak bir karta tek
 * seferde birden fazla checklist + her birinin maddelerini ekler. MVP: yalnız
 * yeni checklist oluşturur (mevcut checklist'e madde ekleme kapsam dışı — bunun
 * için tekli `item.create` var). Şablon:
 *
 *   { "checklists": [ { "title": "Hazırlık", "items": ["Madde 1", "Madde 2"] } ] }
 *
 * Üst sınırlar bir kartın makul checklist hacmini korur + kötü niyetli / kaza
 * eseri devasa payload'a karşı savunur (tek transaction'da toplu insert). İçerik
 * doğrulaması tekli create ile aynı (`checklistTitleSchema` / `checklistItemContentSchema`)
 * — böylece toplu ve tekil yol aynı invariant'ları paylaşır.
 */
export const BULK_IMPORT_MAX_CHECKLISTS = 20;
export const BULK_IMPORT_MAX_ITEMS_PER_CHECKLIST = 200;
export const BULK_IMPORT_MAX_TOTAL_ITEMS = 500;

export const bulkImportChecklistSchema = z.object({
  title: checklistTitleSchema,
  items: z.array(checklistItemContentSchema).max(BULK_IMPORT_MAX_ITEMS_PER_CHECKLIST).default([]),
});

const bulkImportChecklistsShape = {
  checklists: z.array(bulkImportChecklistSchema).min(1).max(BULK_IMPORT_MAX_CHECKLISTS),
};

const totalItemsWithinLimit = (value: { checklists: BulkImportChecklist[] }): boolean =>
  value.checklists.reduce((total, checklist) => total + checklist.items.length, 0) <=
  BULK_IMPORT_MAX_TOTAL_ITEMS;

const totalItemsError = {
  message: `Toplam madde sayısı ${BULK_IMPORT_MAX_TOTAL_ITEMS} sınırını aşamaz.`,
  path: ['checklists'] as string[],
};

/**
 * İstemci-taraf JSON gövdesi (yalnız `checklists`) — web toplu içe aktarma
 * dialog'u yapıştırılan JSON'u bununla `safeParse` eder. `cardId` /
 * `clientMutationId` gövdenin parçası değildir; wiring katmanı ekler.
 * Sunucu `bulkImportChecklistsInput` ile aynı içerik kurallarını + toplam madde
 * sınırını paylaşır (tek kaynak).
 */
export const bulkImportChecklistsBody = z
  .object(bulkImportChecklistsShape)
  .refine(totalItemsWithinLimit, totalItemsError);

export const bulkImportChecklistsInput = z
  .object({
    cardId: idSchema,
    ...bulkImportChecklistsShape,
    ...withClientMutationId,
  })
  .refine(totalItemsWithinLimit, totalItemsError);

export type CreateChecklistInput = z.infer<typeof createChecklistInput>;
export type UpdateChecklistInput = z.infer<typeof updateChecklistInput>;
export type DeleteChecklistInput = z.infer<typeof deleteChecklistInput>;
export type ArchiveChecklistInput = z.infer<typeof archiveChecklistInput>;
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemInput>;
export type ToggleChecklistItemInput = z.infer<typeof toggleChecklistItemInput>;
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemInput>;
export type DeleteChecklistItemInput = z.infer<typeof deleteChecklistItemInput>;
export type ReorderChecklistItemInput = z.infer<typeof reorderChecklistItemInput>;
export type BulkImportChecklistsInput = z.infer<typeof bulkImportChecklistsInput>;
export type BulkImportChecklist = z.infer<typeof bulkImportChecklistSchema>;
