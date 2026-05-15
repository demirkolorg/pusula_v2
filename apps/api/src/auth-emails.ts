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
 *  - Layout: `renderTransactionalEmail` builds an email-safe HTML document
 *    (table-based, inline styles, no flex/grid, no oklch — Outlook-friendly).
 *    Both verification and reset templates share this layout for visual
 *    consistency and reduced spam classification (proper structure + preheader
 *    + branded header + bulletproof CTA button reduces spam-filter false
 *    positives).
 *  - Dev-only recipient override: in non-production, when `EMAIL_DEV_OVERRIDE`
 *    is set, the email is sent to that address instead of the real recipient (so
 *    a developer can test reset with an arbitrary account even though the Resend
 *    test sender only delivers to the account owner). Ignored in production.
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

/**
 * Resolve the address the email should actually go to. In non-production, when
 * `EMAIL_DEV_OVERRIDE` is set, all transactional auth mail is redirected there
 * (and a notice is logged including the real recipient — fine in dev). In
 * production the override is ignored: always the real `to`.
 *
 * Exported for tests.
 */
export function resolveRecipient(to: string): string {
  if (env.NODE_ENV !== 'production' && env.EMAIL_DEV_OVERRIDE) {
    console.warn(
      `[auth] DEV: e-posta gerçek alıcı yerine override adresine yönlendiriliyor → ${env.EMAIL_DEV_OVERRIDE}; gerçek alıcı: ${to}`,
    );
    return env.EMAIL_DEV_OVERRIDE;
  }
  return to;
}

const RESET_SUBJECT = 'Pusula — Şifre sıfırlama';
const VERIFY_SUBJECT = 'Pusula — E-posta doğrulama';

/** Brand color — email-safe hex of the `--primary` token (`oklch(0.56 0.17 275)`). */
const BRAND_INDIGO = '#5b5bd6';
const BRAND_INDIGO_DARK = '#4a4ab8';
const PAGE_BG = '#f4f4f7';
const CARD_BG = '#ffffff';
const TEXT_PRIMARY = '#111827';
const TEXT_BODY = '#374151';
const TEXT_MUTED = '#6b7280';
const BORDER_SUBTLE = '#e5e7eb';
const CODE_BG = '#f3f4f6';

type RenderEmailParams = {
  /** Inbox snippet preview (hidden in body). */
  preheader: string;
  /** Email document `<title>`; falls back to subject. */
  title: string;
  /** Card-level heading shown above the intro. */
  heading: string;
  /** Lead paragraph(s) under the heading — each entry becomes its own `<p>`. */
  intro: string[];
  /** Primary action — bulletproof button. */
  cta: { label: string; url: string };
  /** Short text shown alongside the fallback URL (e.g. "Buton çalışmazsa…"). */
  fallbackLabel: string;
  /** Smaller muted notes after the CTA — each entry becomes its own `<p>`. */
  notes: string[];
  /** Outer footer line under the card (small, muted). */
  footer: string;
};

/**
 * Render a branded transactional email document (HTML, table-based, inline
 * styles only — Gmail/Outlook/Apple Mail safe). The shared layout reduces spam
 * classification compared to a raw `<p>` + `<a>` body. Light only (no
 * `prefers-color-scheme` overrides — Gmail rewrites those anyway and the
 * resulting render is inconsistent across clients).
 */
export function renderTransactionalEmail(params: RenderEmailParams): string {
  const { preheader, title, heading, intro, cta, fallbackLabel, notes, footer } = params;
  const safeCtaUrl = escapeHtml(cta.url);
  const safeCtaLabel = escapeHtml(cta.label);
  const introHtml = intro
    .map(
      (line) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${TEXT_BODY};">${escapeHtml(
          line,
        )}</p>`,
    )
    .join('');
  const notesHtml = notes
    .map(
      (line) =>
        `<p style="margin:0 0 6px;font-size:13px;line-height:1.55;color:${TEXT_MUTED};">${escapeHtml(
          line,
        )}</p>`,
    )
    .join('');

  return [
    '<!doctype html>',
    '<html lang="tr">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="x-apple-disable-message-reformatting">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    `<title>${escapeHtml(title)}</title>`,
    '</head>',
    `<body style="margin:0;padding:0;background:${PAGE_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT_PRIMARY};-webkit-font-smoothing:antialiased;">`,
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;">${escapeHtml(
      preheader,
    )}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG};">`,
    '<tr><td align="center" style="padding:32px 16px;">',
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${CARD_BG};border-radius:12px;overflow:hidden;border:1px solid ${BORDER_SUBTLE};">`,
    // Brand header band
    '<tr>',
    `<td align="left" style="background:${BRAND_INDIGO};padding:22px 32px;">`,
    `<span style="display:inline-block;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.4px;line-height:1;">Pusula</span>`,
    '</td>',
    '</tr>',
    // Body: heading + intro
    '<tr>',
    '<td style="padding:32px 32px 4px;">',
    `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:${TEXT_PRIMARY};font-weight:600;">${escapeHtml(
      heading,
    )}</h1>`,
    introHtml,
    '</td>',
    '</tr>',
    // CTA: bulletproof button (table + bgcolor + inline style)
    '<tr>',
    '<td align="left" style="padding:6px 32px 20px;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0">',
    '<tr>',
    `<td bgcolor="${BRAND_INDIGO}" style="border-radius:8px;mso-padding-alt:0;">`,
    `<a href="${safeCtaUrl}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;line-height:1.2;border:1px solid ${BRAND_INDIGO_DARK};">${safeCtaLabel}</a>`,
    '</td>',
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    // Fallback URL block
    '<tr>',
    '<td style="padding:0 32px 18px;">',
    `<p style="margin:0 0 8px;font-size:13px;color:${TEXT_MUTED};line-height:1.5;">${escapeHtml(
      fallbackLabel,
    )}</p>`,
    `<div style="margin:0;padding:10px 12px;background:${CODE_BG};border:1px solid ${BORDER_SUBTLE};border-radius:6px;font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-size:12px;color:${TEXT_BODY};word-break:break-all;line-height:1.45;">`,
    `<a href="${safeCtaUrl}" target="_blank" style="color:${TEXT_BODY};text-decoration:none;">${safeCtaUrl}</a>`,
    '</div>',
    '</td>',
    '</tr>',
    // Notes (expiry + ignore)
    '<tr>',
    '<td style="padding:0 32px 28px;">',
    notesHtml,
    '</td>',
    '</tr>',
    '</table>',
    // Outer footer
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">`,
    '<tr>',
    `<td align="center" style="padding:14px 16px 0;">`,
    `<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">${escapeHtml(footer)}</p>`,
    '</td>',
    '</tr>',
    '</table>',
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('');
}

const FOOTER_LINE = `© ${new Date().getFullYear()} Pusula · Çalışma akışın için zarif görev panoları`;

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

/** Branded HTML body for the password-reset email. */
export function resetPasswordEmailHtml(url: string): string {
  return renderTransactionalEmail({
    preheader: 'Pusula parolanı sıfırlamak için aşağıdaki butona tıkla. Bağlantı 1 saat geçerlidir.',
    title: RESET_SUBJECT,
    heading: 'Parolanı sıfırla',
    intro: [
      'Merhaba, Pusula hesabının parolasını sıfırlama isteği aldık.',
      'Aşağıdaki butona tıklayarak yeni parolanı belirleyebilirsin.',
    ],
    cta: { label: 'Parolamı sıfırla', url },
    fallbackLabel: 'Buton çalışmazsa bu bağlantıyı tarayıcına kopyala:',
    notes: [
      'Bu bağlantı yaklaşık 1 saat geçerlidir; sonra yenisini istemen gerekir.',
      'Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin — parolan değişmez.',
    ],
    footer: FOOTER_LINE,
  });
}

/** Plain-text body for the signup email-verification email. */
export function verificationEmailText(url: string): string {
  return [
    'Merhaba,',
    '',
    'Pusula hesabının e-posta adresini doğrulamak için aşağıdaki bağlantıyı aç:',
    url,
    '',
    'Bu bağlantı kısa süre (yaklaşık 1 saat) geçerlidir.',
    'Bu hesabı sen oluşturmadıysan bu e-postayı yok sayabilirsin.',
    '',
    'Pusula',
  ].join('\n');
}

/** Branded HTML body for the signup email-verification email. */
export function verificationEmailHtml(url: string): string {
  return renderTransactionalEmail({
    preheader: 'Pusula hesabını etkinleştirmek için e-postanı doğrula. Bağlantı 1 saat geçerlidir.',
    title: VERIFY_SUBJECT,
    heading: 'E-posta adresini doğrula',
    intro: [
      'Pusula’ya hoş geldin! Hesabını güvende tutmak için e-posta adresinin sana ait olduğunu doğrulamamız gerekiyor.',
      'Aşağıdaki butona tıklayarak doğrulamayı tamamlayabilirsin.',
    ],
    cta: { label: 'E-postamı doğrula', url },
    fallbackLabel: 'Buton çalışmazsa bu bağlantıyı tarayıcına kopyala:',
    notes: [
      'Bu bağlantı yaklaşık 1 saat geçerlidir; sonra yenisini istemen gerekir.',
      'Bu hesabı sen oluşturmadıysan bu e-postayı yok sayabilirsin.',
    ],
    footer: FOOTER_LINE,
  });
}

/**
 * Send the password-reset email. Best-effort: with no Resend key it logs the
 * link and returns; on a Resend error it logs and returns. Never throws.
 */
export async function sendResetPasswordEmail(params: { to: string; url: string }): Promise<void> {
  const { to, url } = params;
  const resend = getResend();

  if (!resend) {
    // The reset `url` carries the one-time token in its query string, so it must
    // never reach production logs (anyone with log access could hijack the
    // account). In dev (no Resend key is the norm there) it's convenient to log
    // it so a developer can follow the link; in production we only note that the
    // email could not be sent — without the token.
    if (env.NODE_ENV === 'production') {
      console.warn(
        '[auth] RESEND_API_KEY tanımlı değil — şifre sıfırlama e-postası gönderilemedi.',
      );
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
      to: resolveRecipient(to),
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

/**
 * Send the signup email-verification email. Best-effort: with no Resend key it
 * logs the link only in non-production; on a Resend error it logs and returns.
 * Never throws, so Better Auth signup and resend endpoints are not broken by a
 * transient email provider failure.
 */
export async function sendVerificationEmail(params: { to: string; url: string }): Promise<void> {
  const { to, url } = params;
  const resend = getResend();

  if (!resend) {
    if (env.NODE_ENV === 'production') {
      console.warn(
        '[auth] RESEND_API_KEY tanımlı değil — e-posta doğrulama e-postası gönderilemedi.',
      );
    } else {
      console.warn(
        '[auth] RESEND_API_KEY tanımlı değil — e-posta doğrulama e-postası gönderilmiyor. Doğrulama bağlantısı (yalnızca dev):',
        url,
      );
    }
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: resolveRecipient(to),
      subject: VERIFY_SUBJECT,
      html: verificationEmailHtml(url),
      text: verificationEmailText(url),
    });
    if (error) {
      console.error('[auth] e-posta doğrulama e-postası gönderilemedi:', error);
    }
  } catch (error) {
    console.error('[auth] e-posta doğrulama e-postası gönderilirken beklenmeyen hata:', error);
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
