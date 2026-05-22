import { redirect } from 'next/navigation';

/**
 * Eski `/reset-password` route'u — kalıcı olarak çok modlu `/sign-in` ekranının
 * parola sıfırlama moduna yönlendirir. Parola belirleme artık ayrı bir sayfa
 * değil; tüm auth akışı tek cam kartta toplandı (bkz. `app/sign-in/page.tsx`).
 *
 * KRİTİK — token aktarımı: bu refactor öncesi gönderilmiş e-postalardaki
 * sıfırlama bağlantıları `/reset-password?token=…` biçimindedir ve token ~1 saat
 * geçerlidir. O linkler bozulmasın diye `?token=` query parametresi
 * `/sign-in?mode=reset&token=…`'e taşınır; cam kart reset modunda token'la açılır.
 * Token yoksa sade `?mode=reset` ile gidilir (kart "geçersiz bağlantı" durumunu
 * gösterir).
 *
 * Server-side `redirect()` — sayfa hiç paint etmeden 307 yönlendirme yapar.
 */
export default async function ResetPasswordRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawToken = params.token;
  const token = (Array.isArray(rawToken) ? rawToken[0] : rawToken)?.trim() ?? '';

  redirect(
    token
      ? `/sign-in?mode=reset&token=${encodeURIComponent(token)}`
      : '/sign-in?mode=reset',
  );
}
