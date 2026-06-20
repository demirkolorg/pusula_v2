/**
 * `truncateForAudit` — activity_events before/after audit payload'larında
 * taşınan serbest metin alanlarını (kart açıklaması, yorum body, Tiptap JSON
 * string'i) güvenli bir üst sınıra kırpar.
 *
 * Saf TypeScript: Drizzle, tRPC, framework bağımlılığı YOK (`@pusula/domain`
 * sözleşmesi). Detay → `docs/architecture/06-bildirim-altyapisi.md` "Bildirim
 * detay / audit ekranı" + `docs/domain/04-bildirim-kurallari.md` "Bildirim
 * detay ekranı".
 *
 * Neden: Bildirim detay ekranının before/after diff'i bu alanları payload'a
 * gömer. Sınırsız metin (uzun açıklama / dev Tiptap JSON) `activity_events` ve
 * `notification_outbox` satırlarını şişirir; ≤2KB sınırı satır boyutunu sabit
 * tutar. Aşan değer kırpılır ve `truncated: true` ile işaretlenir; UI "…"
 * gösterip "Karta git" ile tam veriye köprüler.
 */

/** Audit metin alanı için varsayılan üst sınır (UTF-16 kod birimi / char). */
export const AUDIT_TEXT_MAX = 2048;

/**
 * Audit payload'ına gömülecek metin alanının kırpılmış hali.
 *
 * - `value` her zaman ≤ `max` uzunluktadır.
 * - `truncated` yalnızca girdi `max`'ı aştığında `true` olur; aksi halde alan
 *   payload'a hiç eklenmez (append-only / opsiyonel disiplin — eski okuyucular
 *   bayrağın yokluğunu "kırpılmadı" sayar).
 */
export interface TruncatedAuditText {
  value: string;
  truncated?: true;
}

/**
 * Bir metni audit payload'ı için güvenli uzunluğa kırpar.
 *
 * Tiptap JSON body'leri için: ham JSON string'i (parse edilmeden) geçirin —
 * yalnızca uzunluk sınırı + `truncated` bayrağı uygulanır, yapı bozulmaz.
 * Kırpılmış JSON tekrar parse edilemeyebilir; detay ekranı bunu ham metin /
 * "kırpıldı" rozetiyle gösterir, render için "Karta git" tam veriyi yükler.
 *
 * @param text  Kırpılacak ham metin. `null`/`undefined` → `null` döner
 *              (alan payload'a "değer yok" olarak gömülür).
 * @param max   Üst sınır (varsayılan {@link AUDIT_TEXT_MAX}).
 * @returns     `null` (girdi boş/yok) veya `{ value, truncated? }`.
 */
export function truncateForAudit(
  text: string | null | undefined,
  max: number = AUDIT_TEXT_MAX,
): TruncatedAuditText | null {
  if (text == null) return null;
  if (text.length <= max) return { value: text };
  return { value: text.slice(0, max), truncated: true };
}
