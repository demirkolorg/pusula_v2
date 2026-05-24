/**
 * Faz 13J ([DEM-266](https://linear.app/demirkol/issue/DEM-266)) — scheduled
 * report email render + send.
 *
 * Pattern: `notification-email.ts` (Faz 6B) ile uyumlu — plain HTML+text
 * template (`RenderedEmail`), `EmailMailer` interface inject. Pusula React
 * Email kullanmıyor, mevcut `notification-templates.ts` pattern'i izle.
 *
 * 13I worker tarafından çağrılır: render completed olduğunda + `triggerKind
 * === 'scheduled'` + `scheduleId` set ise, completion handler bu modülün
 * `sendScheduledReportEmail` fonksiyonunu çağırır.
 *
 * Email içeriği:
 *  - From: `EMAIL_FROM` env
 *  - Subject: `[Pusula] Raporunuz hazır: {title}`
 *  - Body: signed link (attachment YOK — Resend boyut limiti + spec §16.8)
 *  - Per-recipient: BCC YOK (her alıcının kendi kişiselleştirilmiş emaili)
 */
import { and, eq, inArray } from '@pusula/db';
import type { Database } from '@pusula/db';
import {
  reportRenders,
  reportRenderAssets,
  reportSchedules,
  savedReports,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import type { EmailMailer } from './notification-email';
import type { RenderedEmail } from './notification-templates';

export interface SendScheduledEmailDeps {
  db: Database;
  mailer: EmailMailer;
  config: { from: string; appUrl: string };
  /**
   * Asset için signed GET URL üretici. 13I worker tarafında S3 client
   * mevcut; bu callback ile inject edilir (test'te mock). 24sa TTL.
   */
  createSignedUrl: (input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }) => Promise<string>;
}

export interface SendScheduledEmailInput {
  renderId: string;
}

export interface SendScheduledEmailOutcome {
  kind: 'sent' | 'skipped';
  reason?: 'missing-render' | 'missing-saved' | 'missing-schedule' | 'missing-asset' | 'no-recipients';
  recipientsSent?: number;
  recipientsFailed?: number;
}

export async function sendScheduledReportEmail(
  deps: SendScheduledEmailDeps,
  input: SendScheduledEmailInput,
): Promise<SendScheduledEmailOutcome> {
  // 1. Render + saved + schedule + workspace row'larını çek.
  const [renderRow] = await deps.db
    .select({
      render: reportRenders,
      saved: savedReports,
      schedule: reportSchedules,
      workspace: workspaces,
    })
    .from(reportRenders)
    .innerJoin(savedReports, eq(reportRenders.savedReportId, savedReports.id))
    .innerJoin(reportSchedules, eq(reportRenders.scheduleId, reportSchedules.id))
    .innerJoin(workspaces, eq(savedReports.workspaceId, workspaces.id))
    .where(eq(reportRenders.id, input.renderId))
    .limit(1);

  if (!renderRow) {
    return { kind: 'skipped', reason: 'missing-render' };
  }

  // 2. PDF asset'i (V1: format='pdf' sabit).
  const [asset] = await deps.db
    .select()
    .from(reportRenderAssets)
    .where(
      and(
        eq(reportRenderAssets.renderId, input.renderId),
        eq(reportRenderAssets.format, 'pdf'),
      ),
    )
    .limit(1);
  if (!asset) {
    return { kind: 'skipped', reason: 'missing-asset' };
  }

  // 3. Recipient'ları çöz: user.id → email + name, + harici email'ler.
  // C1 (security review) — workspace member JOIN ile defense-in-depth:
  // schedule.create/update permission check'ten sonra recipient demote
  // race (kullanıcı workspace'ten çıktı ama schedule güncellenmedi) için
  // worker tarafında recheck.
  const recipients = await resolveScheduleRecipients(
    deps.db,
    renderRow.schedule,
    renderRow.workspace.id,
  );
  if (recipients.length === 0) {
    return { kind: 'skipped', reason: 'no-recipients' };
  }

  // 4. Signed URL üret. Security review H2: TTL 24sa → 6sa (gece üretim
  // + sabah açılış için yeterli; email forward + inbox compromise sızıntı
  // penceresi 4x azalır). Daha kısa TTL UX trade-off; 6sa pragmatik.
  const expiresInSeconds = 6 * 60 * 60;
  const signedUrl = await deps.createSignedUrl({
    bucket: asset.s3Bucket,
    key: asset.s3Key,
    expiresInSeconds,
  });
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  // 5. Per-recipient render + send. Bir alıcı fail ederse diğerleri devam
  // eder (try/catch içeride); BCC değil çünkü her alıcının kendi "Bu raporu
  // artık alma" linki olabilir (V2 unsubscribe).
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    const rendered = renderScheduledReportEmail({
      recipientName: recipient.name,
      reportTitle: renderRow.saved.title,
      workspaceName: renderRow.workspace.name,
      workspaceId: renderRow.workspace.id,
      scopeKind: renderRow.render.scopeKind,
      completedAt: renderRow.render.completedAt ?? new Date(),
      signedUrl,
      expiresAt,
      appUrl: deps.config.appUrl,
    });
    try {
      await deps.mailer.send({
        from: deps.config.from,
        to: recipient.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      // Security review M1: PII email mask (`a***@example.com`). GDPR/KVKK
      // log stream'inde recipient'ın account adresi clear-text durmasın.
      console.warn(
        `[worker:report-scheduled-email] failed to send to ${maskEmail(recipient.email)}` +
          ` (userId=${recipient.userId ?? 'external'}):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { kind: 'sent', recipientsSent: sent, recipientsFailed: failed };
}

// ─── Recipient resolver ─────────────────────────────────────────────────────

export interface ScheduledEmailRecipient {
  email: string;
  name?: string | null;
  userId?: string | null;
}

/**
 * Schedule'ın `recipientUserIds` + `recipientEmails` setlerini birleştir.
 * User'ı silinmiş kullanıcıyı atla (DB FK `users` `ON DELETE SET NULL`
 * değil; recipientUserIds text[] olduğu için orphan kalabilir).
 *
 * Security C1 (review): `workspaceId` verildiğinde users tablosu
 * `workspace_members` ile INNER JOIN yapılır — recipient demote race
 * (schedule oluşturulduktan sonra user'ın workspace erişimi kalktı)
 * worker tarafında re-validate edilir. workspaceId omit edilirse (test
 * için) skip — production'da daima geçilmeli.
 *
 * Code-review H1: case-insensitive duplicate set (Set<string> lowercase)
 * — `users.email` lowercase normalize değilse iki user kaydı + aynı email
 * için tek mail. External + user email aynı için de tek mail.
 */
export async function resolveScheduleRecipients(
  db: Database,
  schedule: { recipientUserIds: string[]; recipientEmails: string[] },
  workspaceId?: string,
): Promise<ScheduledEmailRecipient[]> {
  const userRows =
    schedule.recipientUserIds.length > 0
      ? workspaceId
        ? await db
            .select({ id: users.id, email: users.email, name: users.name })
            .from(users)
            .innerJoin(
              workspaceMembers,
              and(
                eq(workspaceMembers.userId, users.id),
                eq(workspaceMembers.workspaceId, workspaceId),
              ),
            )
            .where(inArray(users.id, schedule.recipientUserIds))
        : await db
            .select({ id: users.id, email: users.email, name: users.name })
            .from(users)
            .where(inArray(users.id, schedule.recipientUserIds))
      : [];

  // Set<string> lowercase — case-insensitive uniqueness (`users.email`
  // citext değil; iki user kaydı varsa duplicate engellenmiş olur).
  const seen = new Set<string>();
  const out: ScheduledEmailRecipient[] = [];
  for (const u of userRows) {
    const key = u.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ email: u.email, name: u.name, userId: u.id });
  }
  for (const e of schedule.recipientEmails) {
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ email: e });
  }
  return out;
}

// ─── Email template (plain HTML+text — Pusula konvansiyonu) ────────────────

export interface ScheduledReportEmailInput {
  recipientName?: string | null;
  reportTitle: string;
  workspaceName: string;
  workspaceId: string;
  scopeKind: 'card' | 'list' | 'board' | 'workspace';
  completedAt: Date;
  signedUrl: string;
  expiresAt: Date;
  appUrl: string;
}

/**
 * Plain HTML + text render. Pusula `notification-templates.ts` pattern'i:
 *  - HTML: `<!DOCTYPE html>` + minimal CSS inline (Resend MIME boyutu küçük)
 *  - Text: html-ekvivalentin plain ASCII versiyonu
 *  - i18n: TR sabit (V1); 13Q i18n provider gelirse template params'a t() ekle
 */
export function renderScheduledReportEmail(
  input: ScheduledReportEmailInput,
): RenderedEmail {
  // Security review H1: CRLF / newline sanitize. `saved_reports.title`
  // schema'sı (`savedReportTitleSchema`) `\r\n` filter yapmıyor; defansif
  // olarak header injection / SMTP smuggling pencerelerini kapat.
  const safeTitle = sanitizeHeaderText(input.reportTitle);
  const safeWorkspaceName = sanitizeHeaderText(input.workspaceName);
  const subject = `[Pusula] Raporunuz hazır: ${safeTitle}`;
  const salutation = input.recipientName
    ? `Merhaba ${escapeHtml(input.recipientName)}`
    : 'Merhaba';
  const generatedAt = formatTrDateTime(input.completedAt);
  const expiresAt = formatTrDateTime(input.expiresAt);
  const scopeLabel = SCOPE_LABEL_TR[input.scopeKind];
  const manageUrl = `${input.appUrl.replace(/\/+$/, '')}/workspaces/${encodeURIComponent(input.workspaceId)}/reports?tab=scheduled`;

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 16px 32px;">
              <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:600;color:#0f172a;">Raporunuz hazır</h1>
              <p style="margin:0;font-size:14px;color:#475569;">${salutation},</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 16px 32px;">
              <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#0f172a;">
                <strong>${escapeHtml(safeWorkspaceName)}</strong> çalışma alanında planladığınız
                <strong>${escapeHtml(safeTitle)}</strong> raporu üretildi.
              </p>
              <p style="margin:0 0 4px 0;font-size:13px;color:#64748b;">Kapsam: ${escapeHtml(scopeLabel)}</p>
              <p style="margin:0;font-size:13px;color:#64748b;">Üretim: ${escapeHtml(generatedAt)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px 32px;">
              <a href="${escapeAttr(input.signedUrl)}"
                 style="display:inline-block;padding:10px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
                PDF'i indir
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px 32px;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                İndirme linki <strong>${escapeHtml(expiresAt)}</strong> tarihine kadar geçerli.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px 32px;border-top:1px solid #e2e8f0;padding-top:16px;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                Bu raporu artık almak istemiyor musunuz?
                <a href="${escapeAttr(manageUrl)}" style="color:#475569;text-decoration:underline;">Zamanlamayı yönet</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${salutation},`,
    '',
    `${safeWorkspaceName} çalışma alanında planladığınız "${safeTitle}" raporu üretildi.`,
    '',
    `Kapsam: ${scopeLabel}`,
    `Üretim: ${generatedAt}`,
    '',
    `PDF'i indir: ${input.signedUrl}`,
    '',
    `İndirme linki ${expiresAt} tarihine kadar geçerli.`,
    '',
    `Zamanlamayı yönetmek için: ${manageUrl}`,
  ].join('\n');

  return { subject, html, text };
}

const SCOPE_LABEL_TR: Record<ScheduledReportEmailInput['scopeKind'], string> = {
  card: 'Kart',
  list: 'Liste',
  board: 'Pano',
  workspace: 'Çalışma Alanı',
};

function formatTrDateTime(date: Date): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Europe/Istanbul',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/**
 * Security review H1: email header (subject) için CRLF / newline filtre.
 * Header injection (SMTP smuggling, BCC injection) engelleyici. HTML body
 * için ayrı `escapeHtml` yeterli (newline display sorunu değil).
 */
function sanitizeHeaderText(s: string): string {
  return s.replace(/[\r\n\t\0]+/g, ' ').trim();
}

/**
 * Security review M1: PII log mask. `asya@example.com` → `a***@example.com`.
 * GDPR/KVKK kapsamında log stream'inde recipient adresi clear-text durmasın.
 */
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 1) return email; // tek-harfli local-part: maske anlamsız
  return `${email[0]}***${email.slice(at)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
