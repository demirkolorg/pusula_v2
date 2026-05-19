/**
 * Push payload → cache tazeleme kapsamı (DEM-219).
 *
 * Mobil realtime kararı sabittir: Socket.IO yok. Foreground'da gelen bir push
 * bildirimi banner gösterir ama açık board/kart ekranını ve sekme rozetini
 * tazelemez. `use-foreground-notification-refresh` bu boşluğu mevcut push
 * teslimini cache invalidate'e bağlayarak kapatır.
 *
 * Bu modül worker'ın push `data` payload'ından (`{ type, cardId?, boardId? }`)
 * hangi board/kart sorgularının tazeleneceğini deterministik türetir.
 *
 * Saf modül — RN/Expo importu yok; `notification-refresh.test.ts` ile birim
 * test edilir (`notification-target.ts` ile aynı üslup).
 */

/** Boş olmayan, kırpılmış bir string ise onu döndürür; aksi halde `null`. */
function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Bildirim payload'ını güvenli bir `Record`'a indirger. */
function asRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}

/**
 * Push `data` payload'ından tazelenecek board/kart kapsamını çıkarır.
 *
 * Worker push bildirimine `data: { type, cardId?, boardId? }` koyar. Bu fonksiyon
 * yalnız `boardId`/`cardId` kimliklerini ayrıştırır — boş, eksik veya geçersiz
 * (string olmayan) değerler `null` döner. Çağıran, dönen kimliklere göre ilgili
 * tRPC sorgularını invalidate eder; kimlik `null` ise o kapsam atlanır.
 */
export function notificationRefreshScope(
  payload: unknown,
): { boardId: string | null; cardId: string | null } {
  const raw = asRecord(payload);
  return {
    boardId: stringValue(raw.boardId),
    cardId: stringValue(raw.cardId),
  };
}
