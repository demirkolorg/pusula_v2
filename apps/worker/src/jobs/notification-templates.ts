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
 * The taxonomy is `@pusula/domain`'s `NOTIFICATION_TYPES` — not the activity
 * event types. The notification rule layer
 * (`packages/api/src/lib/notification-rules.ts`) coarsens activities to these
 * buckets; templates fan back out per bucket. DEM-152 split the old
 * `watched_activity` catch-all into seven granular card-activity types
 * (`card_moved`, `card_archived`, `card_completed`, `card_due_changed`,
 * `card_cover_changed`, `card_member_removed`, `attachment_added`); each
 * carries `payload.activityType` so a renderer can still pick a precise verb
 * ("X kartı arşivlendi") where two activity types share one bucket.
 * `watched_activity` stays as a no-producer fallback value.
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
    // DEM-152 — `watched_activity` + granular kart-aktivite tipleri. Bu tipler
    // için rule engine `email` kanal satırı yazmaz (`pickChannels` `emailByType`
    // false) → e-posta hattı pratikte hiç render etmez; switch yine de `never`
    // exhaustiveness için case ister. `renderWatchedActivity` `activityType`
    // payload alanından doğru fiili çözer, dolayısıyla güvenli ortak renderer.
    case 'watched_activity':
    case 'card_moved':
    case 'card_archived':
    case 'card_completed':
    case 'card_due_changed':
    case 'card_cover_changed':
    case 'card_member_removed':
    case 'attachment_added':
      return renderWatchedActivity(ctx);
    case 'checklist_item_completed':
      return renderChecklistCompleted(ctx);
    case 'member_removed':
      return renderMemberRemoved(ctx);
    case 'member_role_changed':
      return renderMemberRoleChanged(ctx);
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
    // DEM-152 — granular kart-aktivite tipleri. Yalnız `attachment_added` ve
    // `card_due_changed` push opt-in fire eder; geri kalanı in-app only —
    // case'ler `never` exhaustiveness için yine de tam.
    case 'card_moved':
      return {
        title: 'Kart taşındı',
        body: `${actor}, takip ettiğin "${subject}" kartını taşıdı.`,
        data,
      };
    case 'card_archived':
      return {
        title: 'Kart arşivlendi',
        body: `${actor}, takip ettiğin "${subject}" kartını arşivledi.`,
        data,
      };
    case 'card_completed': {
      const uncompleted = stringOr(ctx.payload, 'activityType', '') === 'card.uncompleted';
      return {
        title: uncompleted ? 'Kart yeniden açıldı' : 'Kart tamamlandı',
        body: uncompleted
          ? `${actor}, takip ettiğin "${subject}" kartının tamamlandı işaretini kaldırdı.`
          : `${actor}, takip ettiğin "${subject}" kartını tamamlandı işaretledi.`,
        data,
      };
    }
    case 'card_due_changed': {
      const cleared = stringOr(ctx.payload, 'activityType', '') === 'card.due_cleared';
      return {
        title: 'Teslim tarihi değişti',
        body: cleared
          ? `${actor}, takip ettiğin "${subject}" kartının teslim tarihini kaldırdı.`
          : `${actor}, takip ettiğin "${subject}" kartı için teslim tarihi belirledi.`,
        data,
      };
    }
    case 'card_cover_changed':
      return {
        title: 'Kart kapağı değişti',
        body: `${actor}, takip ettiğin "${subject}" kartının kapağını değiştirdi.`,
        data,
      };
    case 'card_member_removed':
      return {
        title: 'Karttan çıkarıldın',
        body: `${actor}, seni "${subject}" kartından çıkardı.`,
        data,
      };
    case 'attachment_added': {
      const fileName = stringOr(ctx.payload, 'fileName', '');
      return {
        title: 'Yeni dosya',
        body: fileName
          ? `${actor}, takip ettiğin "${subject}" kartına "${fileName}" dosyasını ekledi.`
          : `${actor}, takip ettiğin "${subject}" kartına bir dosya ekledi.`,
        data,
      };
    }
    case 'checklist_item_completed':
      return {
        title: 'Liste güncellemesi',
        body: `${actor}, takip ettiğin "${subject}" kartındaki bir maddeyi tamamladı.`,
        data,
      };
    case 'member_removed': {
      // Faz 10A (DEM-135) — scope (board / workspace / card) `activityType`
      // alanından çözülür; başlık + gövde mantığı `renderMemberRemoved` ile
      // hizalı kalır (kullanıcı hem email hem push aynı mesajı görsün).
      const scope = memberRemovedScope(ctx.payload);
      const target = pickMemberScopeTitle(ctx.payload, scope) || subject;
      return {
        title: scope === 'card' ? 'Karttan çıkarıldın' : scope === 'workspace' ? 'Çalışma alanından çıkarıldın' : 'Panodan çıkarıldın',
        body:
          scope === 'card'
            ? `${actor}, seni "${target}" kartından çıkardı.`
            : scope === 'workspace'
              ? `${actor}, seni "${target}" çalışma alanından çıkardı.`
              : `${actor}, seni "${target}" panosundan çıkardı.`,
        data,
      };
    }
    case 'member_role_changed': {
      const scope = memberRoleChangedScope(ctx.payload);
      const target = pickMemberScopeTitle(ctx.payload, scope) || subject;
      const newRole = stringOr(ctx.payload, 'toRole', '');
      const roleLabel = newRole ? roleLabelTr(newRole) : null;
      return {
        title: scope === 'workspace' ? 'Çalışma alanı rolün değişti' : 'Pano rolün değişti',
        body: roleLabel
          ? scope === 'workspace'
            ? `${actor}, "${target}" çalışma alanındaki rolünü "${roleLabel}" yaptı.`
            : `${actor}, "${target}" panosundaki rolünü "${roleLabel}" yaptı.`
          : scope === 'workspace'
            ? `${actor}, "${target}" çalışma alanındaki rolünü değiştirdi.`
            : `${actor}, "${target}" panosundaki rolünü değiştirdi.`,
        data,
      };
    }
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
      `${actor}, takip ettiğin "${cardTitle}" kartındaki bir yapılacaklar maddesini tamamladı.`,
      '',
      'Karta gitmek için:',
      link,
    ]),
    html: htmlShell(ctx.recipient.name, [
      `<p>${esc(actor)}, takip ettiğin <strong>${esc(cardTitle)}</strong> kartındaki bir yapılacaklar maddesini tamamladı.</p>`,
      cardLinkBlock(link),
    ]),
  };
}

/**
 * Faz 10A (DEM-135) — "seni X'ten çıkardı" e-postası. Board / workspace
 * scope `activityType` üzerinden çözülür; card scope mevcut kanal seti'nde
 * email *üretmez* (rule engine `member_removed` için workspace/board scope
 * email seçer, card scope yalnız in-app — `card.member_removed` →
 * `watched_activity` bucket'ı). Bu nedenle email renderer card branch'i
 * kapsamaz (fallback ile generic veya neutral metne düşer).
 */
function renderMemberRemoved(ctx: TemplateContext): RenderedEmail {
  const actor = pickActorName(ctx.payload);
  const scope = memberRemovedScope(ctx.payload);
  const target = pickMemberScopeTitle(ctx.payload, scope) || pickSubject(ctx.payload);
  // Çıkarılan kullanıcı artık board/workspace'e erişemez — kart linkine
  // değil, ana sayfaya yönlendir.
  const link = ctx.appUrl;
  const scopeLabel = scope === 'workspace' ? 'çalışma alanından' : 'panosundan';
  const subject =
    scope === 'workspace'
      ? `${actor}, seni "${target}" çalışma alanından çıkardı`
      : `${actor}, seni "${target}" panosundan çıkardı`;
  const body =
    scope === 'workspace'
      ? `${actor}, seni "${target}" çalışma alanından çıkardı.`
      : `${actor}, seni "${target}" panosundan çıkardı.`;
  return {
    subject,
    text: textShell(ctx.recipient.name, [
      body,
      '',
      `Bu ${scopeLabel} artık ulaşamıyorsun. Diğer çalışmalarına ana sayfadan dönebilirsin:`,
      link,
    ]),
    html: htmlShell(ctx.recipient.name, [
      `<p>${esc(actor)}, seni <strong>${esc(target)}</strong> ${esc(scopeLabel)} çıkardı.</p>`,
      `<p style="color: #6b7280;">Bu ${esc(scopeLabel)} artık ulaşamıyorsun. Diğer çalışmalarına ana sayfadan dönebilirsin.</p>`,
      `<p><a href="${esc(link)}" style="display: inline-block; padding: 8px 16px; background: #1f2937; color: #ffffff; text-decoration: none; border-radius: 6px;">Pusula'ya git</a></p>`,
    ]),
  };
}

/**
 * Faz 10A (DEM-135) — "rolünü değiştirdi" e-postası. Rule engine
 * `member_role_changed` için email kanalını seçmez (yalnız in-app); bu
 * renderer simetri için bulunuyor (digest / quiet-hours sonraki fazlarda
 * email kanalını açabilir).
 */
function renderMemberRoleChanged(ctx: TemplateContext): RenderedEmail {
  const actor = pickActorName(ctx.payload);
  const scope = memberRoleChangedScope(ctx.payload);
  const target = pickMemberScopeTitle(ctx.payload, scope) || pickSubject(ctx.payload);
  const newRole = stringOr(ctx.payload, 'toRole', '');
  const roleLabel = newRole ? roleLabelTr(newRole) : null;
  const link = scope === 'workspace' ? ctx.appUrl : boardDeepLink(ctx);
  const scopeLabel = scope === 'workspace' ? 'çalışma alanındaki' : 'panosundaki';
  const subject = roleLabel
    ? `${actor}, "${target}" ${scopeLabel} rolünü "${roleLabel}" yaptı`
    : `${actor}, "${target}" ${scopeLabel} rolünü değiştirdi`;
  const body = roleLabel
    ? `${actor}, "${target}" ${scopeLabel} rolünü "${roleLabel}" olarak ayarladı.`
    : `${actor}, "${target}" ${scopeLabel} rolünü değiştirdi.`;
  return {
    subject,
    text: textShell(ctx.recipient.name, [body, '', `Detay için:`, link]),
    html: htmlShell(ctx.recipient.name, [
      `<p>${esc(actor)}, <strong>${esc(target)}</strong> ${esc(scopeLabel)} rolünü ${roleLabel ? `<strong>${esc(roleLabel)}</strong> olarak` : ''} ayarladı.</p>`,
      `<p><a href="${esc(link)}" style="display: inline-block; padding: 8px 16px; background: #1f2937; color: #ffffff; text-decoration: none; border-radius: 6px;">Detayı gör</a></p>`,
    ]),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Digest email (Faz 10G — DEM-141)
// ───────────────────────────────────────────────────────────────────────────

/** One outbox row's view inside a digest. */
export interface DigestItem {
  type: NotificationType;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface DigestContext {
  recipient: { name: string; email: string };
  /** `'hourly'` ya da `'daily'` — başlık ve metin tonunu belirler. */
  cadence: 'hourly' | 'daily';
  /** Recipient için toplanmış outbox satırları (kronolojik olmaz; render gruplar). */
  items: ReadonlyArray<DigestItem>;
  appUrl: string;
}

/** Digest içinde tek grubun render bilgisi. */
interface DigestGroup {
  type: NotificationType;
  heading: string;
  lines: string[];
}

/** Bir grupta en fazla kaç satır gösterilir; üstü "ve X daha" ile özetlenir. */
const DIGEST_MAX_LINES_PER_GROUP = 5;

/**
 * Recipient'in `digest_queued` outbox satırlarını tek özet maile dönüştürür.
 *
 * Davranış:
 *  - `items` boşsa fallback `renderGeneric` ile minimal mesaj döner (sebep:
 *    worker çağırmadan önce empty kontrolü yapsa da, render fonksiyonu
 *    bağımsız olarak tutarlı olmalı — testler de bunu doğrular).
 *  - Tipe göre `Map<NotificationType, DigestItem[]>` ile gruplama; her grup
 *    için kısa Türkçe başlık + ilk `DIGEST_MAX_LINES_PER_GROUP` satır.
 *  - HTML versiyon `htmlShell` + ul/li satırları; plain text karşılığı text
 *    shell'e enjekte edilir.
 *  - Subject: "Pusula — {N} yeni bildirim ({cadence})". `cadence` Türkçe:
 *    saatlik özet / günlük özet.
 *  - Footer: `appUrl/account?tab=notifications` linki ("Tercihlerini
 *    değiştir").
 */
export function renderDigestEmail(ctx: DigestContext): RenderedEmail {
  const cadenceLabel = ctx.cadence === 'hourly' ? 'saatlik özet' : 'günlük özet';
  const totalCount = ctx.items.length;
  const preferencesLink = `${ctx.appUrl}/account?tab=notifications`;

  if (totalCount === 0) {
    // Defensive — caller bunu çağırmamalı. Boş özet mailini yine de tutarlı
    // şekilde döndürelim (testler "no-op safety" senaryosu çalıştırır).
    return {
      subject: `Pusula — ${cadenceLabel}`,
      text: textShell(ctx.recipient.name, [
        `Şu an gönderecek yeni bir bildirim yok.`,
        '',
        `Tercihler: ${preferencesLink}`,
      ]),
      html: htmlShell(ctx.recipient.name, [
        '<p>Şu an gönderecek yeni bir bildirim yok.</p>',
        digestFooterBlock(preferencesLink),
      ]),
    };
  }

  // Gruplama: tip → satırlar. Tipte ilk geliş sırası korunur (`Map` insertion
  // order'ı garantiler); böylece "atamalar, sonra yorumlar..." sırası
  // recipient'ın olaylarına göre doğal akar.
  const groups = new Map<NotificationType, DigestItem[]>();
  for (const item of ctx.items) {
    const bucket = groups.get(item.type);
    if (bucket) bucket.push(item);
    else groups.set(item.type, [item]);
  }

  const rendered: DigestGroup[] = [];
  for (const [type, bucketItems] of groups) {
    const heading = digestGroupHeading(type, bucketItems.length);
    const visible = bucketItems.slice(0, DIGEST_MAX_LINES_PER_GROUP);
    const extra = bucketItems.length - visible.length;
    const lines = visible.map((item) =>
      digestLineFor(type, item, ctx.appUrl),
    );
    if (extra > 0) lines.push(`ve ${extra} daha`);
    rendered.push({ type, heading, lines });
  }

  const subject = `Pusula — ${totalCount} yeni bildirim (${cadenceLabel})`;

  const text = textShell(ctx.recipient.name, [
    `Son ${cadenceLabel} sırasında ${totalCount} yeni bildirim biriktirildi.`,
    '',
    ...rendered.flatMap((g) => [g.heading, ...g.lines.map((l) => `  • ${l}`), '']),
    `Tercihler: ${preferencesLink}`,
  ]);

  const html = htmlShell(ctx.recipient.name, [
    `<p>Son ${esc(cadenceLabel)} sırasında <strong>${totalCount} yeni bildirim</strong> biriktirildi.</p>`,
    ...rendered.map(
      (g) =>
        `<section style="margin: 16px 0;">
          <h3 style="font-size: 14px; margin: 0 0 6px 0; color: #111827;">${esc(g.heading)}</h3>
          <ul style="margin: 0; padding-left: 18px; color: #1f2937;">
            ${g.lines.map((l) => `<li style="margin: 2px 0;">${esc(l)}</li>`).join('\n            ')}
          </ul>
        </section>`,
    ),
    digestFooterBlock(preferencesLink),
  ]);

  return { subject, html, text };
}

/** Bir tip için bölüm başlığı (TR). */
function digestGroupHeading(type: NotificationType, count: number): string {
  const base = digestGroupBaseTitle(type);
  return count > 1 ? `${base} (${count})` : base;
}

function digestGroupBaseTitle(type: NotificationType): string {
  switch (type) {
    case 'card_assigned':
      return 'Atamalar';
    case 'mention':
      return 'Sözedilmeler';
    case 'comment_reply':
      return 'Yorumlar';
    case 'due_approaching':
      return 'Yaklaşan teslimler';
    case 'due_overdue':
      return 'Gecikenler';
    case 'board_invitation':
      return 'Pano davetleri';
    case 'workspace_invitation':
      return 'Çalışma alanı davetleri';
    case 'watched_activity':
      return 'Takip ettiğin kartlar';
    // DEM-152 — granular kart-aktivite tipleri. E-posta kanalı bu tipler için
    // satır yazmaz → digest pratikte hiç toplamaz; case'ler `never`
    // exhaustiveness için tam tutulur.
    case 'card_moved':
      return 'Taşınan kartlar';
    case 'card_archived':
      return 'Arşivlenen kartlar';
    case 'card_completed':
      return 'Tamamlanan kartlar';
    case 'card_due_changed':
      return 'Teslim tarihi değişiklikleri';
    case 'card_cover_changed':
      return 'Kapak değişiklikleri';
    case 'card_member_removed':
      return 'Karttan çıkarılma';
    case 'attachment_added':
      return 'Eklenen dosyalar';
    case 'checklist_item_completed':
      return 'Yapılacaklar güncellemeleri';
    case 'member_removed':
      return 'Üyelik değişiklikleri';
    case 'member_role_changed':
      return 'Rol değişiklikleri';
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return 'Bildirimler';
    }
  }
}

/** Tek bir satır metni — actor + kart başlığı + kısa fiil. */
function digestLineFor(type: NotificationType, item: DigestItem, _appUrl: string): string {
  void _appUrl;
  const actor = pickActorName(item.payload);
  const subject = pickSubject(item.payload);
  switch (type) {
    case 'card_assigned':
      return `${actor} → "${subject}" kartına seni atadı`;
    case 'mention':
      return `${actor} bir yorumda senden bahsetti — "${subject}"`;
    case 'comment_reply':
      return `${actor} → "${subject}" kartında yeni yorum`;
    case 'due_approaching':
      return `"${subject}" — teslim tarihi yaklaşıyor`;
    case 'due_overdue':
      return `"${subject}" — teslim tarihi geçti`;
    case 'board_invitation':
      return `${actor} → "${subject}" panosuna davet`;
    case 'workspace_invitation':
      return `${actor} → "${subject}" çalışma alanına davet`;
    case 'watched_activity': {
      const verb = activityVerb(stringOr(item.payload, 'activityType', ''));
      return `${actor} → "${subject}" kartını ${verb}`;
    }
    // DEM-152 — granular kart-aktivite tipleri (digest e-posta için pratikte
    // hiç çağrılmaz; `never` exhaustiveness için tam).
    case 'card_moved':
      return `${actor} → "${subject}" kartını taşıdı`;
    case 'card_archived':
      return `${actor} → "${subject}" kartını arşivledi`;
    case 'card_completed':
      return `${actor} → "${subject}" kartını ${
        stringOr(item.payload, 'activityType', '') === 'card.uncompleted'
          ? 'yeniden açtı'
          : 'tamamladı'
      }`;
    case 'card_due_changed':
      return `${actor} → "${subject}" kartının teslim tarihini ${
        stringOr(item.payload, 'activityType', '') === 'card.due_cleared'
          ? 'kaldırdı'
          : 'değiştirdi'
      }`;
    case 'card_cover_changed':
      return `${actor} → "${subject}" kartının kapağını değiştirdi`;
    case 'card_member_removed':
      return `${actor} seni "${subject}" kartından çıkardı`;
    case 'attachment_added':
      return `${actor} → "${subject}" kartına dosya ekledi`;
    case 'checklist_item_completed':
      return `${actor} → "${subject}" kartında yapılacaklar maddesi tamamlandı`;
    case 'member_removed':
      return `${actor} seni "${subject}" üyeliğinden çıkardı`;
    case 'member_role_changed':
      return `${actor} → "${subject}" rolünü değiştirdi`;
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return `${actor} → "${subject}"`;
    }
  }
}

function digestFooterBlock(prefsLink: string): string {
  return [
    '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />',
    '<p style="color: #6b7280; font-size: 13px;">Sözedilmeler (@) ve davetler her zaman anlık gönderilir.</p>',
    `<p style="color: #6b7280; font-size: 13px;">E-posta sıklığını <a href="${esc(prefsLink)}" style="color: #1f2937;">tercihlerinden</a> değiştirebilirsin.</p>`,
  ].join('\n');
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
  // Misafir (anonim) yorum payload'ı `shareLinkId` taşır + `actor_id` NULL.
  // Faz 9C (DEM-129) — sabit "Misafir" etiketi
  // (`docs/domain/08-paylasim-linki-kurallari.md`).
  if (typeof payload.shareLinkId === 'string' && payload.shareLinkId.length > 0) {
    return 'Misafir';
  }
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

function boardDeepLink(ctx: TemplateContext): string {
  const boardId = stringOr(ctx.payload, 'boardId', '');
  const workspaceId = stringOr(ctx.payload, 'workspaceId', '');
  if (workspaceId && boardId) {
    return `${ctx.appUrl}/workspaces/${encodeURIComponent(workspaceId)}/boards/${encodeURIComponent(boardId)}`;
  }
  return ctx.appUrl;
}

/**
 * Faz 10A (DEM-135) — `member_removed` bildiriminin scope'u: card / board /
 * workspace. `activityType` payload alanından çıkarılır. Bilinmeyen / boş
 * gelirse en olası fallback `board` (en yaygın senaryo).
 */
function memberRemovedScope(payload: Record<string, unknown>): 'card' | 'board' | 'workspace' {
  const activityType = stringOr(payload, 'activityType', '');
  if (activityType === 'card.member_removed') return 'card';
  if (activityType === 'workspace.member_removed') return 'workspace';
  return 'board';
}

function memberRoleChangedScope(payload: Record<string, unknown>): 'board' | 'workspace' {
  const activityType = stringOr(payload, 'activityType', '');
  if (activityType === 'workspace.member_role_changed') return 'workspace';
  return 'board';
}

function pickMemberScopeTitle(
  payload: Record<string, unknown>,
  scope: 'card' | 'board' | 'workspace',
): string {
  if (scope === 'card') return stringOr(payload, 'cardTitle', '');
  if (scope === 'workspace') return stringOr(payload, 'workspaceName', '');
  return stringOr(payload, 'boardName', '');
}

/** Faz 10A — board / workspace rollerinin TR etiketleri (mesajda görünür). */
function roleLabelTr(role: string): string {
  switch (role) {
    case 'owner':
      return 'sahip';
    case 'admin':
      return 'yönetici';
    case 'member':
      return 'üye';
    case 'viewer':
      return 'görüntüleyici';
    case 'guest':
      return 'misafir';
    default:
      return role;
  }
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
