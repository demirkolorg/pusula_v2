import { redirect } from 'next/navigation';

/**
 * Eski `/sign-up` route'u — kalıcı olarak çok modlu `/sign-in` ekranının kayıt
 * moduna yönlendirir. Kayıt artık ayrı bir sayfa değil; tüm auth akışı tek cam
 * kartta toplandı (bkz. `app/sign-in/page.tsx`). Eskiden paylaşılmış linkler ve
 * yer imleri için ince bir redirect kabuğu olarak korunur.
 *
 * Server-side `redirect()` — sayfa hiç paint etmeden 307 ile `/sign-in?mode=sign-up`'a
 * gider.
 */
export default function SignUpRedirectPage() {
  redirect('/sign-in?mode=sign-up');
}
