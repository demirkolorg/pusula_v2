/**
 * Faz 8F (DEM-283) — Arşivli entity koruyucusu (archive guard).
 *
 * Sorun: arşivli board/list/card mutation reddi 25+ procedure'de elle yapılıyor;
 * mesajlar farklı (`"Arşivli board düzenlenemez."` vs `"Arşivli board'a kart eklenemez."`
 * vs `"Arşivli liste düzenlenemez."`...), bazı yerde kontrol unutulabiliyor. Bu helper
 * tek nokta: çağıran transaction içinden okuduğu `archivedAt`'i bu fonksiyona verir;
 * arşivliyse standart `BAD_REQUEST` fırlatır. Kontrol pattern'i değişmiyor (`tx.select`
 * çağırarak race-safe oku), sadece reddetme + mesaj merkezîleşiyor.
 *
 * Tasarım kararları:
 *  - **Pure helper, DB okuması yok.** Çağıran procedure satırı (en azından `archivedAt`
 *    kolonunu) zaten select etmiş olmalı. Helper'ın kendi DB çağrısı yapması (a) ekstra
 *    round-trip, (b) transaction context'ini taşıma karmaşası, (c) mevcut "tx içinde
 *    tek sefer select et" pattern'inden sapma olurdu. Tüm procedure'ler zaten `archivedAt`
 *    okuyor (board.update, list.archive, card.update vs.) — sadece if check'ini değiştiriyoruz.
 *  - **İçeri "context" param'ı: opsiyonel.** Default mesaj entity'ye göre değişir
 *    ("Arşivli board üzerinde işlem yapılamaz."); çağıran daha spesifik mesaj iletebilir
 *    (örn. liste eklerken "Arşivli board'a liste eklenemez."). Mesaj override mantıklı:
 *    UI'de hata mesajı tam bağlamı yansıtır.
 *  - **BAD_REQUEST**, FORBIDDEN değil. Arşivli entity bir _state_ sorunu, _yetki_ değil.
 *    Kullanıcı yetkili (arşivden çıkarabilir bile); aksiyon mevcut state'de geçersiz.
 *
 * Bkz. `docs/domain/02-yetkilendirme-kurallari.md` "Faz 8F — Permission edge case envanteri"
 * Edge case 3 (Arşiv etkileşimleri matrisi).
 */
import { TRPCError } from '@trpc/server';

/**
 * Arşivli entity mesaj sözlüğü — entity türüne göre default Türkçe mesaj.
 *
 * Default seçimi: 8F öncesinde çoğu mutation `"Arşivli board düzenlenemez."` /
 * `"Arşivli liste düzenlenemez."` mesajını kullanıyordu. Default'ları bu yaygın
 * formla eşitliyoruz — böylece çağıran procedure'lerin büyük çoğunluğu override
 * vermeden temiz kalır. "Eklenemez" (create) gibi context-spesifik durumlarda
 * `message` parametresi geçilir.
 */
const DEFAULT_ARCHIVED_MESSAGES = {
  workspace: 'Arşivli workspace düzenlenemez.',
  board: 'Arşivli board düzenlenemez.',
  list: 'Arşivli liste düzenlenemez.',
  card: 'Arşivli kart düzenlenemez.',
} as const;

type ArchivableEntity = keyof typeof DEFAULT_ARCHIVED_MESSAGES;

interface ArchivableRow {
  /** `null` aktif; `Date` arşivlenme zamanı. */
  archivedAt: Date | null;
}

/**
 * Bir entity'nin arşivli olmadığını assert eder; arşivliyse `BAD_REQUEST` fırlatır.
 *
 * @param entity - Hangi tür (`board`/`list`/`card`) — default mesaj seçimi için.
 * @param row - `archivedAt` taşıyan satır (genelde `tx.select({ archivedAt }).from(...)` sonucu).
 * @param message - Bağlam-spesifik override (örn. "Arşivli board'a liste eklenemez.").
 *   Verilmezse entity'nin default Türkçe mesajı kullanılır.
 *
 * @example
 *   const [board] = await tx.select({ archivedAt: boards.archivedAt })
 *     .from(boards).where(eq(boards.id, ctx.board.id)).limit(1);
 *   if (!board) throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
 *   assertNotArchived('board', board, "Arşivli board'a liste eklenemez.");
 */
export function assertNotArchived(
  entity: ArchivableEntity,
  row: ArchivableRow,
  message?: string,
): void {
  if (row.archivedAt !== null) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: message ?? DEFAULT_ARCHIVED_MESSAGES[entity],
    });
  }
}

/** Default mesajları test/dokümantasyon için ihraç et. */
export const archivedMessages = DEFAULT_ARCHIVED_MESSAGES;
