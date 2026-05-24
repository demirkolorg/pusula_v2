/**
 * Faz 8F (DEM-283) — Permission/davet hata mesajları konsolidasyonu.
 *
 * Sorun: aynı reddetme mesajı (örn. "Davet süresi doldu.") workspace + board
 * invitation router'larında 2'şer yerde elle yazılmış; testler de mesaj
 * string'ini doğrudan match etmek zorunda kalıyor (mesaj değişirse 4 yer +
 * test'ler de güncellenmeli). Bu modül tek nokta.
 *
 * Tasarım kararları:
 *  - **Sadece server-side**, frontend'e ihraç edilmez (tRPC üzerinden mesaj
 *    `TRPCError.message` string'i olarak iletilir; UI o string'i gösterir).
 *    Frontend'in kendi i18n katmanı yok (TR-only ürün) → string yansıtmak yeterli.
 *  - **Permission/state kategorisi**, "yetki yetersiz" gibi UI fallback'leri
 *    burada değil — onlar her procedure'de kendi bağlamına göre yazılır
 *    ("Üye rolünü değiştirme yetkiniz yok." vs "Kart taşıma yetkiniz yok.").
 *  - **Archive mesajları**: ayrı dosya (`archive-guard.ts`) — orada `assertNotArchived`
 *    helper'ı default mesajları yönetir.
 *
 * Bkz. `docs/domain/02-yetkilendirme-kurallari.md` (davet akışı) ve
 *      `docs/architecture/06-bildirim-altyapisi.md` (sweeper).
 */

/** Davet/invitation hata mesajları (workspace + board). */
export const INVITATION_MESSAGES = {
  /** Token DB'de yok. `NOT_FOUND`. */
  notFound: 'Davet bulunamadı.',
  /** `status !== 'pending'` (accepted/declined/revoked/expired). `BAD_REQUEST`. */
  noLongerValid: 'Davet artık geçerli değil.',
  /**
   * `expires_at <= now()`. Workspace + board için tek mesaj. `BAD_REQUEST`.
   * Faz 8F: 30 gün default expiry; gece 03:00 sweeper expired'ları damgalar.
   */
  expired: 'Davet süresi doldu. Davet edenden yeni link isteyin.',
  /** Oturum kullanıcısının e-postası davet e-postasıyla eşleşmiyor. `FORBIDDEN`. */
  wrongEmail: 'Bu davet başka bir e-postaya gönderildi.',
} as const;
