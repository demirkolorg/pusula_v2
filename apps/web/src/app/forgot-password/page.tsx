import { redirect } from 'next/navigation';

/**
 * Eski `/forgot-password` route'u — kalıcı olarak çok modlu `/sign-in` ekranının
 * "şifremi unuttum" moduna yönlendirir. Parola sıfırlama isteği artık ayrı bir
 * sayfa değil; tüm auth akışı tek cam kartta toplandı (bkz. `app/sign-in/page.tsx`).
 *
 * Server-side `redirect()` — sayfa hiç paint etmeden 307 ile `/sign-in?mode=forgot`'a
 * gider.
 */
export default function ForgotPasswordRedirectPage() {
  redirect('/sign-in?mode=forgot');
}
