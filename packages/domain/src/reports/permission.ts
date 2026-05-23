/**
 * Faz 13C — Raporlama yetki matrisi helper'ı (DEM-259). Spec:
 * `docs/domain/09-raporlama-kurallari.md` §9.5.
 *
 * Saf TypeScript — DB/IO YOK. Çağıran taraf (tRPC procedure) session
 * user'ın effective workspace + board rolünü çözer, bu helper'a verir;
 * helper "izin verilir mi?" + reason döner. Yetkilendirme her zaman
 * server-side; istemci yalnız UI affordance gizleme için kullanır.
 */
import { boardRoleAtLeast, workspaceRoleAtLeast } from '../roles';
import type { BoardRole, WorkspaceRole } from '../constants';
import type { ReportScope, ReportScopeKind } from './types';

/**
 * Domain'in tanıdığı raporlama eylemleri (§9.5 matris satırları).
 *
 *   - `generate`        : ad-hoc/preview üretim (PDF değil; panel render)
 *   - `save`            : saved report oluştur
 *   - `update`          : saved report güncelle (filtre/micro-report/comparison)
 *   - `delete`          : saved report sil
 *   - `scheduleCreate`  : saved'a schedule ekle
 *   - `scheduleDelete`  : schedule sil
 *   - `render`          : mevcut saved'i render et (PDF/Excel/PNG)
 *   - `recipientUser`   : schedule recipient olarak workspace üyesi seç
 *   - `recipientEmail`  : schedule recipient olarak workspace dışı email seç
 *   - `exportJson`      : ham JSON dataset indir (sadece board/workspace)
 */
export type ReportAction =
  | 'generate'
  | 'save'
  | 'update'
  | 'delete'
  | 'scheduleCreate'
  | 'scheduleDelete'
  | 'render'
  | 'recipientUser'
  | 'recipientEmail'
  | 'exportJson';

export interface ReportPermissionCtx {
  /** Workspace rolü (null = workspace üyesi değil). */
  workspace: WorkspaceRole | null;
  /**
   * Effective board rolü (null = board erişimi yok). Card/list/board scope'lu
   * eylemler için zorunlu; workspace scope'lu eylemlerde ignored.
   * Çağıran taraf `@pusula/domain/permissions::effectiveBoardRole` ile
   * resolve eder.
   */
  board: BoardRole | null;
}

export interface ReportPermissionResult {
  allowed: boolean;
  /** İzin verilmediyse Türkçe makine-okunabilir reason key'i. */
  reason?: string;
}

const ALLOW: ReportPermissionResult = { allowed: true };

function deny(reason: string): ReportPermissionResult {
  return { allowed: false, reason };
}

/** Workspace üyeliği yoksa hiçbir rapor eylemi yapılamaz. */
function requireWorkspaceAccess(ctx: ReportPermissionCtx): ReportPermissionResult | null {
  if (!ctx.workspace) return deny('not_workspace_member');
  return null;
}

/** Board üyeliği (effective) yoksa card/list/board scope eylemi reddedilir. */
function requireBoardAccess(ctx: ReportPermissionCtx): ReportPermissionResult | null {
  if (!ctx.board) return deny('not_board_member');
  return null;
}

/**
 * §9.5 matrisini tek bir saf fonksiyonda uygula.
 *
 * - **Workspace** scope: `workspace:member` (generate/render) veya
 *   `workspace:admin` (save/update/scheduleCreate/recipient/exportJson)
 *   gerekli; `delete` ve `recipientEmail` `workspace:owner`.
 * - **Card/List/Board** scope: `board:viewer` (generate/render) veya
 *   `board:admin` (save/update/delete/scheduleCreate/recipientUser);
 *   `recipientEmail` workspace admin, `delete` board admin **veya**
 *   workspace owner, `exportJson` workspace admin.
 *
 * Helper hem allow hem reason döner — tRPC procedure'leri `FORBIDDEN`
 * fırlatırken reason'ı log/audit'e geçirebilir.
 */
export function canPerformReportAction(
  action: ReportAction,
  scope: ReportScope | { kind: ReportScopeKind },
  ctx: ReportPermissionCtx,
): ReportPermissionResult {
  const wsGate = requireWorkspaceAccess(ctx);
  if (wsGate) return wsGate;

  const isWorkspaceScope = scope.kind === 'workspace';

  // Board/Card/List eylemleri effective board rolü gerektirir; ama
  // workspace owner/admin her zaman board admin'i ima eder
  // (`effectiveBoardRole` çağıran tarafta zaten çözüldü).
  if (!isWorkspaceScope) {
    const boardGate = requireBoardAccess(ctx);
    if (boardGate) return boardGate;
  }

  switch (action) {
    // ─── Generate (ad-hoc) ──────────────────────────────────────────────
    case 'generate':
      return isWorkspaceScope
        ? workspaceRoleAtLeast(ctx.workspace as WorkspaceRole, 'member')
          ? ALLOW
          : deny('workspace_member_required')
        : ALLOW; // board:viewer yukarıda garanti.

    // ─── Render (saved) ─────────────────────────────────────────────────
    case 'render':
      return isWorkspaceScope
        ? workspaceRoleAtLeast(ctx.workspace as WorkspaceRole, 'member')
          ? ALLOW
          : deny('workspace_member_required')
        : ALLOW; // board:viewer yukarıda garanti.

    // ─── Save / Update / Schedule create (admin tier) ──────────────────
    case 'save':
    case 'update':
    case 'scheduleCreate':
    case 'scheduleDelete':
    case 'recipientUser':
      return isWorkspaceScope
        ? workspaceRoleAtLeast(ctx.workspace as WorkspaceRole, 'admin')
          ? ALLOW
          : deny('workspace_admin_required')
        : boardRoleAtLeast(ctx.board as BoardRole, 'admin')
          ? ALLOW
          : deny('board_admin_required');

    // ─── Delete saved (workspace owner OR board admin) ──────────────────
    case 'delete':
      if (isWorkspaceScope) {
        return workspaceRoleAtLeast(ctx.workspace as WorkspaceRole, 'owner')
          ? ALLOW
          : deny('workspace_owner_required');
      }
      // Board admin kendi scope'unda silebilir; workspace owner her yerde.
      if (
        boardRoleAtLeast(ctx.board as BoardRole, 'admin') ||
        workspaceRoleAtLeast(ctx.workspace as WorkspaceRole, 'owner')
      ) {
        return ALLOW;
      }
      return deny('board_admin_or_workspace_owner_required');

    // ─── Recipient: workspace dışı email (sıkı tier) ────────────────────
    case 'recipientEmail':
      if (isWorkspaceScope) {
        return workspaceRoleAtLeast(ctx.workspace as WorkspaceRole, 'owner')
          ? ALLOW
          : deny('workspace_owner_required');
      }
      return workspaceRoleAtLeast(ctx.workspace as WorkspaceRole, 'admin')
        ? ALLOW
        : deny('workspace_admin_required');

    // ─── Ham JSON dataset (sadece board/workspace, workspace admin+) ────
    case 'exportJson':
      if (scope.kind === 'card' || scope.kind === 'list') {
        return deny('json_export_not_supported_for_scope');
      }
      return workspaceRoleAtLeast(ctx.workspace as WorkspaceRole, 'admin')
        ? ALLOW
        : deny('workspace_admin_required');
  }
}
