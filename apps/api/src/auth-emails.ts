import { Resend } from 'resend';
import { env } from './env';

/**
 * Transactional auth emails (Resend), kept separate from the Faz 6 notification
 * outbox/worker: password-reset (and later signup verification) links are sent
 * on the request path by Better Auth itself, not queued. See
 * `docs/architecture/07-auth.md` (Şifre sıfırlama akışı) and the karar kaydı
 * 2026-05-12 in `docs/architecture/02-teknoloji-kararlari.md`.
 *
 * Design notes:
 *  - The Resend client is created lazily and only when `RESEND_API_KEY` is set;
 *    with no key (typical in local dev) the helpers degrade to best-effort —
 *    they log a warning and return without throwing. In dev that warning also
 *    includes the reset link so a developer can follow it; in production it does
 *    NOT (the link carries the one-time token in its query string, which must
 *    never land in production logs).
 *  - `sendResetPasswordEmail` never throws: a transient Resend failure must not
 *    break Better Auth's `requestPasswordReset` flow (the user always sees the
 *    same "if that address has an account, a link is on its way" response — we
 *    don't leak whether the email exists, and we don't leak send failures
 *    either). Same best-effort discipline as the signup bootstrap hook
 *    (`apps/api/src/bootstrap.ts`).
 *  - The email body is a small, self-contained HTML + plain-text template with
 *    Turkish copy. Hard-coded strings are fine here — this is a server-side
 *    email template, not a UI component (the web app uses `strings.auth.*`).
 */

/** Lazily-built Resend client; `null` when `RESEND_API_KEY` is not configured. */
let resendClient: Resend | null = null;
let resendResolved = false;

function getResend(): Resend | null {
  if (!resendResolved) {
    resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
    resendResolved = true;
  }
  return resendClient;
}

/** Test-only: drop the memoized client so a test can swap `env.RESEND_API_KEY`. */
export function __resetResendClientForTests(): void {
  resendClient = null;
  resendResolved = false;
}

const RESET_SUBJECT = 'Pusula — Şifre sıfırlama';

/** Plain-text body for the password-reset email. */
export function resetPasswordEmailText(url: string): string {
  return [
    'Merhaba,',
    '',
    'Pusula hesabının parolasını sıfırlamak için aşağıdaki bağlantıyı aç:',
    url,
    '',
    'Bu bağlantı kısa süre (yaklaşık 1 saat) geçerlidir.',
    'Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; parolan değişmez.',
    '',
    'Pusula',
  ].join('\n');
}

/** Minimal HTML body for the password-reset email (no color tokens, sade). */
export function resetPasswordEmailHtml(url: string): string {
  // `url` comes from Better Auth (a same-origin link it just built), but escape
  // it anyway before interpolating into HTML attributes/text — defense in depth.
  const safeUrl = escapeHtml(url);
  return [
    '<!doctype html>',
    '<html lang="tr">',
    '<body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #1f2937;">',
    '<p>Merhaba,</p>',
    '<p>Pusula hesabının parolasını sıfırlamak için aşağıdaki bağlantıya tıkla:</p>',
    `<p><a href="${safeUrl}">Parolamı sıfırla</a></p>`,
    '<p>Buton çalışmazsa şu bağlantıyı tarayıcına kopyala:</p>',
    `<p>${safeUrl}</p>`,
    '<p>Bu bağlantı kısa süre (yaklaşık 1 saat) geçerlidir.</p>',
    '<p>Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; parolan değişmez.</p>',
    '<p>Pusula</p>',
    '</body>',
    '</html>',
  ].join('\n');
}

/**
 * Send the password-reset email. Best-effort: with no Resend key it logs the
 * link and returns; on a Resend error it logs and returns. Never throws.
 */
export async function sendResetPasswordEmail(params: {
  to: string;
  url: string;
}): Promise<void> {
  const { to, url } = params;
  const resend = getResend();

  if (!resend) {
    // The reset `url` carries the one-time token in its query string, so it must
    // never reach production logs (anyone with log access could hijack the
    // account). In dev (no Resend key is the norm there) it's convenient to log
    // it so a developer can follow the link; in production we only note that the
    // email could not be sent — without the token.
    if (env.NODE_ENV === 'production') {
      console.warn('[auth] RESEND_API_KEY tanımlı değil — şifre sıfırlama e-postası gönderilemedi.');
    } else {
      console.warn(
        '[auth] RESEND_API_KEY tanımlı değil — şifre sıfırlama e-postası gönderilmiyor. Sıfırlama bağlantısı (yalnızca dev):',
        url,
      );
    }
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: RESET_SUBJECT,
      html: resetPasswordEmailHtml(url),
      text: resetPasswordEmailText(url),
    });
    // The Resend SDK returns `{ data, error }` rather than throwing on a 4xx/5xx.
    if (error) {
      console.error('[auth] şifre sıfırlama e-postası gönderilemedi:', error);
    }
  } catch (error) {
    console.error('[auth] şifre sıfırlama e-postası gönderilirken beklenmeyen hata:', error);
  }
}

/** Tiny HTML-attribute/text escaper — enough for interpolating a URL safely. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
