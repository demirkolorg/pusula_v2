/**
 * Notification email templates (Faz 6B — DEM-91).
 *
 * Pure rendering: given a notification type, a payload, and a deep-link base
 * URL, return `{ subject, html, text }`. No I/O, no Resend, no state — that
 * keeps the email processor itself testable with deterministic snapshots and
 * lets the template module be reused by any future digest job (`packages/email`
 * would be the right destination if/when it exists; for now this file lives
 * next to the consumer).
 *
 * Style follows the DEM-68 password-reset template: sade HTML, Türkçe metin,
 * inline styles only (so the email renders without a CSS pipeline). We escape
 * every payload string before interpolation — payloads come from user input
 * (card titles, comment bodies, board names) and an attacker who can title a
 * card `<script>` shouldn't be able to inject markup into another user's
 * inbox.
 *
 * The taxonomy is `@pusula/domain`'s `NOTIFICATION_TYPES` (Faz 6A) — not the
 * activity event types. The notification rule layer
 * (`packages/api/src/lib/notification-rules.ts`) coarsens activities to these
 * nine buckets; templates fan back out per bucket. `watched_activity` is the
 * catch-all (kart üzerinde her hareket: due_set, completed, archived, moved)
 * — its subject + body use `payload.activityType` for the i18n key so the
 * recipient sees a precise message ("X kartı arşivlendi") even though the
 * notification *type* is generic.
 */
import type { NotificationType } from '@pusula/domain';

/** Inputs every template renderer gets. */
export interface TemplateContext {
  /** Notification taxonomy bucket — `NOTIFICATION_TYPES`. */
  type: NotificationType;
  /** Recipient — used for the salutation. */
  recipient: { name: string; email: string };
  /**
   * Worker-shaped payload. The activity payload the rule engine baked in
   * (`packages/api/src/lib/notification-rules.ts buildPayload`) — see field
   * usage below. Loose typing because every notification type has its own
   * shape; this layer narrows them inline rather than via a tagged union (the
   * rule engine already typed the producer side).
   */
  payload: Record<string, unknown>;
  /** Base URL for deep links (env.APP_URL). No trailing slash assumed. */
  appUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Public entrypoint — pick a template + render it. */
export function renderNotificationEmail(ctx: TemplateContext): RenderedEmail {
  switch (ctx.type) {
    case 'card_assigned':
      return renderCardAssigned(ctx);
    case 'mention':
      return renderMention(ctx);
    case 'comment_reply':
      return renderCommentReply(ctx);
    case 'due_approaching':
    case 'due_overdue':
      return renderDueReminder(ctx);
    case 'board_invitation':
    case 'workspace_invitation':
      return renderInvitation(ctx);
    case 'watched_activity':
      return renderWatchedActivity(ctx);
    case 'checklist_item_completed':
      return renderChecklistCompleted(ctx);
    default: {
      // Exhaustiveness check — every new NotificationType must be wired here.
      const _exhaustive: never = ctx.type;
      void _exhaustive;
      return renderGeneric(ctx);
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Push fan-out — the push processor reuses the same payload shape; let it
// pull title + body without re-implementing the salutation logic.
// ───────────────────────────────────────────────────────────────────────────

export interface RenderedPush {
  title: string;
  body: string;
  /** Routed onto the push payload's `data` field for the mobile app. */
  data: Record<string, string>;
}

export function renderNotificationPush(ctx: TemplateContext): RenderedPush {
  const actor = pickActorName(ctx.payload);
  const subject = pickSubject(ctx.payload);
  const data: Record<string, string> = {
    type: ctx.type,
    activityType: stringOr(ctx.payload, 'activityType', ''),
  };
  const cardId = stringOr(ctx.payload, 'cardId', '');
  const boardId = stringOr(ctx.payload, 'boardId', '');
  if (cardId) data.cardId = cardId;
  if (boardId) data.boardId = boardId;

  switch (ctx.type) {
    case 'card_assigned':
      return { title: 'Yeni atama', body: `${actor}, "${subject}" kartına seni atadı.`, data };
    case 'mention':
      return { title: 'Sözedildin', body: `${actor} bir yorumda senden bahsetti.`, data };
    case 'comment_reply':
      return { title: 'Yeni yorum', body: `${actor}, "${subject}" kartına yorum yazdı.`, data };
    case 'due_approaching':
      return {
        title: 'Yaklaşan teslim',
        body: `"${subject}" kartının teslim tarihi yaklaşıyor.`,
        data,
      };
    case 'due_overdue':
      return { title: 'Geciken kart', body: `"${subject}" kartının teslim tarihi geçti.`, data };
    case 'board_invitation':
      return {
        title: 'Pano daveti',
        body: `${actor}, seni "${subject}" panosuna davet etti.`,
        data,
      };
    case 'workspace_invitation':
      return {
        title: 'Çalışma alanı daveti',
        body: `${actor}, seni "${subject}" çalışma alanına davet etti.`,
        data,
      };
    case 'watched_activity':
      return {
        title: 'Kart aktivitesi',
        body: `${actor}, takip ettiğin "${subject}" kartında değişiklik yaptı.`,
        data,
      };
    case 'checklist_item_completed':
      return {
        title: 'Liste güncellemesi',
        body: `${actor}, takip ettiğin "${subject}" kartındaki bir maddeyi tamamladı.`,
        data,
      };
    default: {
      const _exhaustive: never = ctx.type;
      void _exhaustive;
      return { title: 'Bildirim', body: "Pusula'da yeni bir bildirim.", data };
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// HTML email renderers
// ───────────────────────────────────────────────────────────────────────────

function renderCardAssigned(ctx: TemplateContext): RenderedEmail {
  const actor = pickActorName(ctx.payload);
  const cardTitle = pickSubject(ctx.payload);
  const link = cardDeepLink(ctx);
  const subject = `${actor}, "${cardTitle}" kartına seni atadı`;
  return {
    subject,
    text: textShell(ctx.recipient.name, [
      `${actor}, "${cardTitle}" kartına seni atadı.`,
      '',
      'Kartı görüntülemek için:',
      link,
    ]),
    html: htmlShell(ctx.recipient.name, [
      `<p>${esc(actor)}, <strong>${esc(cardTitle)}</strong> kartına seni atadı.</p>`,
      cardLinkBlock(link),
    ]),
  };
}

function renderMention(ctx: TemplateContext): RenderedEmail {
  const actor = pickActorName(ctx.payload);
  const cardTitle = pickSubject(ctx.payload);
  const link = cardDeepLink(ctx);
  // Mention preview body — keep it short so an inbox preview shows the gist.
  const preview = trimToPreview(stringOr(ctx.payload, 'commentPreview', ''));
  const subject = `${actor} bir yorumda senden bahsetti`;
  return {
    subject,
    text: textShell(ctx.recipient.name, [
      `${actor}, "${cardTitle}" kartındaki bir yorumda senden bahsetti.`,
      ...(preview ? ['', `"${preview}"`] : []),
      '',
      'Yoruma gitmek için:',
      link,
    ]),
    html: htmlShell(ctx.recipient.name, [
      `<p>${esc(actor)}, <strong>${esc(cardTitle)}</strong> kartındaki bir yorumda senden bahsetti.</p>`,
      ...(preview
        ? [
            `<blockquote style="margin: 8px 0; padding: 8px 12px; border-left: 3px solid #d1d5db; color: #4b5563;">${esc(preview)}</blockquote>`,
          ]
        : []),
      cardLinkBlock(link),
    ]),
  };
}

function renderCommentReply(ctx: TemplateContext): RenderedEmail {
  const actor = pickActorName(ctx.payload);
  const cardTitle = pickSubject(ctx.payload);
  const link = cardDeepLink(ctx);
  const preview = trimToPreview(stringOr(ctx.payload, 'commentPreview', ''));
  const subject = `${actor} "${cardTitle}" kartına yorum yazdı`;
  return {
    subject,
    text: textShell(ctx.recipient.name, [
      `${actor}, takip ettiğin "${cardTitle}" kartına yorum yazdı.`,
      ...(preview ? ['', `"${preview}"`] : []),
      '',
      'Karta gitmek için:',
      link,
    ]),
    html: htmlShell(ctx.recipient.name, [
      `<p>${esc(actor)}, takip ettiğin <strong>${esc(cardTitle)}</strong> kartına yorum yazdı.</p>`,
      ...(preview
        ? [
            `<blockquote style="margin: 8px 0; padding: 8px 12px; border-left: 3px solid #d1d5db; color: #4b5563;">${esc(preview)}</blockquote>`,
          ]
        : []),
      cardLinkBlock(link),
    ]),
  };
}

function renderDueReminder(ctx: TemplateContext): RenderedEmail {
  const cardTitle = pickSubject(ctx.payload);
  const link = cardDeepLink(ctx);
  const overdue = ctx.type === 'due_overdue';
  const subject = overdue
    ? `"${cardTitle}" kartının teslim tarihi geçti`
    : `"${cardTitle}" kartının teslim tarihi yaklaşıyor`;
  const body = overdue
    ? `"${cardTitle}" kartının teslim tarihi geçti. Lütfen kontrol et.`
    : `"${cardTitle}" kartının teslim tarihi yaklaşıyor.`;
  return {
    subject,
    text: textShell(ctx.recipient.name, [body, '', 'Karta gitmek için:', link]),
    html: htmlShell(ctx.recipient.name, [`<p>${esc(body)}</p>`, cardLinkBlock(link)]),
  };
}

function renderInvitation(ctx: TemplateContext): RenderedEmail {
  const actor = pickActorName(ctx.payload);
  const scopeLabel = ctx.type === 'workspace_invitation' ? 'çalışma alanına' : 'panosuna';
  const targetTitle = pickSubject(ctx.payload);
  // Invitation deep links carry a one-time token — payload propagates it from
  // the activity event. Fall back to APP_URL if the token isn't on the row
  // (older invitations); the recipient can still navigate manually.
  const inviteToken = stringOr(ctx.payload, 'inviteToken', '');
  const link = inviteToken
    ? `${ctx.appUrl}/invitations/${encodeURIComponent(inviteToken)}`
    : ctx.appUrl;
  const subject = `${actor} seni "${targetTitle}" ${scopeLabel} davet etti`;
  return {
    subject,
    text: textShell(ctx.recipient.name, [
      `${actor}, seni "${targetTitle}" ${scopeLabel} davet etti.`,
      '',
      'Daveti incelemek için:',
      link,
    ]),
    html: htmlShell(ctx.recipient.name, [
      `<p>${esc(actor)}, seni <strong>${esc(targetTitle)}</strong> ${esc(scopeLabel)} davet etti.</p>`,
      `<p><a href="${esc(link)}" style="display: inline-block; padding: 8px 16px; background: #1f2937; color: #ffffff; text-decoration: none; border-radius: 6px;">Daveti incele</a></p>`,
      `<p style="color: #6b7280; font-size: 13px;">Buton çalışmazsa şu bağlantıyı tarayıcına kopyala:<br /><span style="color: #1f2937;">${esc(link)}</span></p>`,
    ]),
  };
}

function renderWatchedActivity(ctx: TemplateContext): RenderedEmail {
  const actor = pickActorName(ctx.payload);
  const cardTitle = pickSubject(ctx.payload);
  const activityType = stringOr(ctx.payload, 'activityType', '');
  const verb = activityVerb(activityType);
  const link = cardDeepLink(ctx);
  const subject = `${actor}, "${cardTitle}" kartında değişiklik yaptı`;
  return {
    subject,
    text: textShell(ctx.recipient.name, [
      `${actor}, takip ettiğin "${cardTitle}" kartını ${verb}.`,
      '',
      'Karta gitmek için:',
      link,
    ]),
    html: htmlShell(ctx.recipient.name, [
      `<p>${esc(actor)}, takip ettiğin <strong>${esc(cardTitle)}</strong> kartını ${esc(verb)}.</p>`,
      cardLinkBlock(link),
    ]),
  };
}

function renderChecklistCompleted(ctx: TemplateContext): RenderedEmail {
  const actor = pickActorName(ctx.payload);
  const cardTitle = pickSubject(ctx.payload);
  const link = cardDeepLink(ctx);
  const subject = `${actor}, "${cardTitle}" kartındaki bir maddeyi tamamladı`;
  return {
    subject,
    text: textShell(ctx.recipient.name, [
      `${actor}, takip ettiğin "${cardTitle}" kartındaki bir checklist maddesini tamamladı.`,
      '',
      'Karta gitmek için:',
      link,
    ]),
    html: htmlShell(ctx.recipient.name, [
      `<p>${esc(actor)}, takip ettiğin <strong>${esc(cardTitle)}</strong> kartındaki bir checklist maddesini tamamladı.</p>`,
      cardLinkBlock(link),
    ]),
  };
}

function renderGeneric(ctx: TemplateContext): RenderedEmail {
  const link = cardDeepLink(ctx);
  return {
    subject: "Pusula'da yeni bir bildirim",
    text: textShell(ctx.recipient.name, ["Pusula'da yeni bir bildirim var.", '', link]),
    html: htmlShell(ctx.recipient.name, [
      "<p>Pusula'da yeni bir bildirim var.</p>",
      cardLinkBlock(link),
    ]),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function pickActorName(payload: Record<string, unknown>): string {
  return stringOr(payload, 'actorName', 'Birisi');
}

function pickSubject(payload: Record<string, unknown>): string {
  return (
    stringOr(payload, 'cardTitle', '') ||
    stringOr(payload, 'boardName', '') ||
    stringOr(payload, 'workspaceName', '') ||
    'Pusula'
  );
}

function stringOr(payload: Record<string, unknown>, key: string, fallback: string): string {
  const v = payload[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function cardDeepLink(ctx: TemplateContext): string {
  const cardId = stringOr(ctx.payload, 'cardId', '');
  const boardId = stringOr(ctx.payload, 'boardId', '');
  const workspaceId = stringOr(ctx.payload, 'workspaceId', '');
  if (workspaceId && boardId && cardId) {
    return `${ctx.appUrl}/workspaces/${encodeURIComponent(workspaceId)}/boards/${encodeURIComponent(boardId)}?card=${encodeURIComponent(cardId)}`;
  }
  if (workspaceId && boardId) {
    return `${ctx.appUrl}/workspaces/${encodeURIComponent(workspaceId)}/boards/${encodeURIComponent(boardId)}`;
  }
  return ctx.appUrl;
}

/** Map an activity event type to a Turkish past-tense verb for `watched_activity`. */
function activityVerb(activityType: string): string {
  switch (activityType) {
    case 'card.archived':
      return 'arşivledi';
    case 'card.completed':
      return 'tamamlandı olarak işaretledi';
    case 'card.uncompleted':
      return 'tamamlandı işaretini kaldırdı';
    case 'card.due_set':
      return 'için teslim tarihi belirledi';
    case 'card.due_cleared':
      return 'için teslim tarihini kaldırdı';
    case 'card.moved':
      return 'taşıdı';
    default:
      return 'güncelledi';
  }
}

function trimToPreview(value: string, max = 280): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textShell(recipientName: string, lines: string[]): string {
  return [`Merhaba ${recipientName || 'Pusula kullanıcısı'},`, '', ...lines, '', '— Pusula'].join(
    '\n',
  );
}

function htmlShell(recipientName: string, lines: string[]): string {
  return [
    '<!doctype html>',
    '<html lang="tr">',
    '<body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #1f2937;">',
    `<p>Merhaba ${esc(recipientName || 'Pusula kullanıcısı')},</p>`,
    ...lines,
    '<p style="color: #6b7280; font-size: 13px;">— Pusula</p>',
    '</body>',
    '</html>',
  ].join('\n');
}

function cardLinkBlock(link: string): string {
  return [
    `<p><a href="${esc(link)}" style="display: inline-block; padding: 8px 16px; background: #1f2937; color: #ffffff; text-decoration: none; border-radius: 6px;">Karta git</a></p>`,
    `<p style="color: #6b7280; font-size: 13px;">Buton çalışmazsa: <span style="color: #1f2937;">${esc(link)}</span></p>`,
  ].join('\n');
}
