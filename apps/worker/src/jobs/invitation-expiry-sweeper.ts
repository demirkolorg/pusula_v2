/**
 * Faz 8F (DEM-283) — Davet süresi (expiry) sweeper.
 *
 * Workspace + board davet'leri `expires_at` taşır (NOT NULL, default
 * `created_at + INTERVAL '30 days'` — Faz 1.3 / Faz 2.5C). Accept akışı
 * mutation çağrısında expiry'i lazy olarak kontrol edip `status='expired'`
 * damgalar (`workspace.invitations.accept` + `board.invitations.accept`).
 *
 * Sorun: davet linkine **hiç tıklanmazsa** satır `status='pending'` +
 * `expires_at < NOW()` durumunda kalır:
 *  - `workspace.invitations.list` / `board.invitations.list` (admin yönetim
 *    ekranı) `gt(expiresAt, NOW())` filtrelemez, dolayısıyla expired davetler
 *    "Bekliyor" görünür → yöneticiyi yanıltır (kullanıcı kabul edebilir
 *    sanır; gerçekte tıklasa BAD_REQUEST).
 *  - `mine` query `gt(expiresAt, NOW())` filter koyar → davet edilen kullanıcı
 *    "Davetlerim" listesinde görmez. Tutarsızlık.
 *
 * Bu sweeper günlük (03:00 UTC) tarama yapar; expired + pending satırları
 * `status='expired'` damgalar. UI iki tarafta da "Süresi dolmuş" gösterir.
 *
 * Pattern: `report-retention.ts` / `attachment-cleanup-sweeper.ts` ile aynı
 * disiplin. Bağımsız iki UPDATE (workspace + board) tek tx içinde toparlanır;
 * batch limiti gereksiz (UPDATE seti expiry indeksiyle taranır, ölçek küçük).
 *
 * Bkz. `docs/architecture/06-bildirim-altyapisi.md` (davet expiry sweeper) ve
 *      `docs/domain/02-yetkilendirme-kurallari.md` Faz 8F edge case 2.
 */
import { and, eq, lt, sql } from '@pusula/db';
import { boardInvitations, workspaceInvitations } from '@pusula/db';
import type { Database } from '@pusula/db';

/** Repeatable job name registered against `pusula-invitation-expiry-sweeper`. */
export const INVITATION_EXPIRY_SWEEPER_JOB_NAME = 'invitation-expiry-sweeper';

/**
 * Cron pattern — daily at 03:00 UTC. Aynı `report-retention` zamanı; düşük
 * trafik penceresi (gece). BullMQ pattern (5-field cron).
 */
export const INVITATION_EXPIRY_SWEEPER_CRON = '0 3 * * *';

/** Tek tick sonucu — log + test için. */
export interface InvitationExpirySweepResult {
  workspaceExpired: number;
  boardExpired: number;
}

/**
 * Tek sweeper tick. `pending` + `expires_at < NOW()` satırları
 * `status='expired'` damgalar. İdempotent (zaten expired olanlar WHERE'i
 * geçmez). Hata olursa BullMQ tick'i tekrar dener; rare durumda kaçırılan
 * tick zaten 24 saat sonra aynı satırları rekapture eder (`expires_at` geriye
 * gitmez).
 */
export async function sweepExpiredInvitations(db: Database): Promise<InvitationExpirySweepResult> {
  // Workspace + board iki ayrı UPDATE. Tek tx içinde olmak zorunda değil
  // (bağımsız tablolar); ayrı tutmak retry'da hangi tarafın bittiğini bilmeyi
  // kolaylaştırır (ikincide DB hatası → ilk yine geçerli kalır).
  const workspaceUpdated = await db
    .update(workspaceInvitations)
    .set({ status: 'expired' })
    .where(
      and(
        eq(workspaceInvitations.status, 'pending'),
        lt(workspaceInvitations.expiresAt, sql`NOW()`),
      ),
    )
    .returning({ id: workspaceInvitations.id });

  const boardUpdated = await db
    .update(boardInvitations)
    .set({ status: 'expired' })
    .where(
      and(eq(boardInvitations.status, 'pending'), lt(boardInvitations.expiresAt, sql`NOW()`)),
    )
    .returning({ id: boardInvitations.id });

  return {
    workspaceExpired: workspaceUpdated.length,
    boardExpired: boardUpdated.length,
  };
}
