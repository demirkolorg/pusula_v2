/**
 * Kontrol listesi maddesi satır-içi yeniden adlandırma kararı (DEM-221).
 *
 * Metne dokununca açılan satır-içi düzenlemede, kaydetme anında taslak metnin
 * sunucuya gönderilip gönderilmeyeceğine — ve gönderilecekse hangi değerle —
 * burada karar verilir. Saf fonksiyon; UI'dan ayrı birim test edilir.
 */

/**
 * Taslak içeriği değerlendirip kaydedilecek değeri döndürür.
 *
 * - `null` → mutation **atma**: kırpılınca boş içerik (düzenleme iptal sayılır,
 *   madde silinmez) ya da değişmemiş metin (gereksiz mutation).
 * - Aksi halde kırpılmış yeni içerik döner.
 *
 * Backend `checklistItemContentSchema` (min 1 / max 20 000) içeriği yine
 * doğrular; bu helper yalnızca anlamsız/gereksiz mutation'ı eler. Mobil düz metin
 * yazar (rich editör sonraki tur); web'in yazdığı Tiptap JSON, düzenleme sheet'ine
 * `tiptapToPlainText` ile düz metne indirilmiş olarak gelir.
 */
export function resolveChecklistItemRename(original: string, draft: string): string | null {
  const trimmed = draft.trim();
  if (trimmed.length === 0) return null;
  if (trimmed === original) return null;
  return trimmed;
}
