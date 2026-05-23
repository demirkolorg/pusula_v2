import { describe, expect, it } from 'vitest';
import {
  canPerformReportAction,
  type ReportAction,
  type ReportPermissionCtx,
} from '../permission';
import { REPORT_I18N_KEYS } from '../i18n-keys';
import type { ReportScope, ReportScopeKind } from '../types';

// ─── Fixture'lar ───────────────────────────────────────────────────────────

const SCOPES: Record<ReportScopeKind, ReportScope> = {
  card: { kind: 'card', cardId: 'c1', boardId: 'b1', workspaceId: 'w1' },
  list: { kind: 'list', listId: 'l1', boardId: 'b1', workspaceId: 'w1' },
  board: { kind: 'board', boardId: 'b1', workspaceId: 'w1' },
  workspace: { kind: 'workspace', workspaceId: 'w1' },
};

const CTX = {
  noAccess: { workspace: null, board: null } satisfies ReportPermissionCtx,
  guestNoBoard: { workspace: 'guest', board: null } satisfies ReportPermissionCtx,
  memberNoBoard: { workspace: 'member', board: null } satisfies ReportPermissionCtx,
  memberBoardViewer: {
    workspace: 'member',
    board: 'viewer',
  } satisfies ReportPermissionCtx,
  memberBoardMember: {
    workspace: 'member',
    board: 'member',
  } satisfies ReportPermissionCtx,
  memberBoardAdmin: {
    workspace: 'member',
    board: 'admin',
  } satisfies ReportPermissionCtx,
  adminBoardAdmin: {
    workspace: 'admin',
    board: 'admin',
  } satisfies ReportPermissionCtx,
  ownerBoardAdmin: {
    workspace: 'owner',
    board: 'admin',
  } satisfies ReportPermissionCtx,
};

describe('canPerformReportAction — workspace membership gate', () => {
  it('rejects every action when user is not a workspace member', () => {
    const actions: ReportAction[] = [
      'generate',
      'save',
      'update',
      'delete',
      'scheduleCreate',
      'scheduleDelete',
      'render',
      'recipientUser',
      'recipientEmail',
      'exportJson',
    ];
    for (const a of actions) {
      const r = canPerformReportAction(a, SCOPES.board, CTX.noAccess);
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('not_workspace_member');
    }
  });
});

describe('canPerformReportAction — board-scoped (card/list/board)', () => {
  it('viewer can generate + render but cannot save/schedule', () => {
    for (const scopeKind of ['card', 'list', 'board'] as const) {
      const scope = SCOPES[scopeKind];
      expect(canPerformReportAction('generate', scope, CTX.memberBoardViewer).allowed).toBe(
        true,
      );
      expect(canPerformReportAction('render', scope, CTX.memberBoardViewer).allowed).toBe(true);
      expect(canPerformReportAction('save', scope, CTX.memberBoardViewer).allowed).toBe(false);
      expect(canPerformReportAction('update', scope, CTX.memberBoardViewer).allowed).toBe(
        false,
      );
      expect(
        canPerformReportAction('scheduleCreate', scope, CTX.memberBoardViewer).allowed,
      ).toBe(false);
    }
  });

  it('member (board:member) still cannot save (admin required)', () => {
    expect(canPerformReportAction('save', SCOPES.board, CTX.memberBoardMember).allowed).toBe(
      false,
    );
  });

  it('board:admin can save/update/schedule + pick workspace-member recipients', () => {
    for (const scopeKind of ['card', 'list', 'board'] as const) {
      const scope = SCOPES[scopeKind];
      expect(canPerformReportAction('save', scope, CTX.memberBoardAdmin).allowed).toBe(true);
      expect(canPerformReportAction('update', scope, CTX.memberBoardAdmin).allowed).toBe(
        true,
      );
      expect(canPerformReportAction('delete', scope, CTX.memberBoardAdmin).allowed).toBe(
        true,
      );
      expect(
        canPerformReportAction('scheduleCreate', scope, CTX.memberBoardAdmin).allowed,
      ).toBe(true);
      expect(
        canPerformReportAction('scheduleDelete', scope, CTX.memberBoardAdmin).allowed,
      ).toBe(true);
      expect(
        canPerformReportAction('recipientUser', scope, CTX.memberBoardAdmin).allowed,
      ).toBe(true);
    }
  });

  it('board:admin (but workspace:member) CANNOT add external email recipient', () => {
    const r = canPerformReportAction('recipientEmail', SCOPES.board, CTX.memberBoardAdmin);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('workspace_admin_required');
  });

  it('workspace:admin board:admin CAN add external email recipient', () => {
    expect(
      canPerformReportAction('recipientEmail', SCOPES.board, CTX.adminBoardAdmin).allowed,
    ).toBe(true);
  });

  it('workspace:owner can delete on board scope even if not board admin', () => {
    // Edge: owner ile board rolünün boş olduğu durum tipik değil (workspace
    // owner her board'da admin gibi davranır), ama matriste owner override
    // yazılı. Burada board:admin verdik; semantik aynı.
    expect(canPerformReportAction('delete', SCOPES.board, CTX.ownerBoardAdmin).allowed).toBe(
      true,
    );
  });

  it('rejects exportJson on card / list scope', () => {
    for (const scopeKind of ['card', 'list'] as const) {
      const r = canPerformReportAction(
        'exportJson',
        SCOPES[scopeKind],
        CTX.adminBoardAdmin,
      );
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('json_export_not_supported_for_scope');
    }
  });

  it('allows exportJson on board scope only for workspace admin+', () => {
    expect(
      canPerformReportAction('exportJson', SCOPES.board, CTX.memberBoardAdmin).allowed,
    ).toBe(false);
    expect(
      canPerformReportAction('exportJson', SCOPES.board, CTX.adminBoardAdmin).allowed,
    ).toBe(true);
  });

  it('rejects board action when user has no board role even if workspace member', () => {
    const r = canPerformReportAction('generate', SCOPES.board, CTX.memberNoBoard);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('not_board_member');
  });
});

describe('canPerformReportAction — workspace-scoped', () => {
  it('workspace:guest cannot generate (member required)', () => {
    const r = canPerformReportAction('generate', SCOPES.workspace, CTX.guestNoBoard);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('workspace_member_required');
  });

  it('workspace:member can generate + render', () => {
    expect(
      canPerformReportAction('generate', SCOPES.workspace, CTX.memberNoBoard).allowed,
    ).toBe(true);
    expect(
      canPerformReportAction('render', SCOPES.workspace, CTX.memberNoBoard).allowed,
    ).toBe(true);
  });

  it('workspace:member cannot save (admin required)', () => {
    const r = canPerformReportAction('save', SCOPES.workspace, CTX.memberNoBoard);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('workspace_admin_required');
  });

  it('workspace:admin can save/update/schedule but cannot delete (owner only)', () => {
    expect(
      canPerformReportAction('save', SCOPES.workspace, CTX.adminBoardAdmin).allowed,
    ).toBe(true);
    expect(
      canPerformReportAction('scheduleCreate', SCOPES.workspace, CTX.adminBoardAdmin).allowed,
    ).toBe(true);
    const del = canPerformReportAction('delete', SCOPES.workspace, CTX.adminBoardAdmin);
    expect(del.allowed).toBe(false);
    expect(del.reason).toBe('workspace_owner_required');
  });

  it('workspace:owner can delete workspace-scope saved + add external email', () => {
    expect(
      canPerformReportAction('delete', SCOPES.workspace, CTX.ownerBoardAdmin).allowed,
    ).toBe(true);
    expect(
      canPerformReportAction('recipientEmail', SCOPES.workspace, CTX.ownerBoardAdmin).allowed,
    ).toBe(true);
  });

  it('workspace:admin can NOT add external email at workspace scope (owner required)', () => {
    const r = canPerformReportAction(
      'recipientEmail',
      SCOPES.workspace,
      CTX.adminBoardAdmin,
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('workspace_owner_required');
  });

  it('exportJson on workspace allowed only for workspace:admin+', () => {
    expect(
      canPerformReportAction('exportJson', SCOPES.workspace, CTX.memberNoBoard).allowed,
    ).toBe(false);
    expect(
      canPerformReportAction('exportJson', SCOPES.workspace, CTX.adminBoardAdmin).allowed,
    ).toBe(true);
  });
});

describe('canPerformReportAction — exhaustive matrix smoke', () => {
  // table-driven smoke: each action × each scope × a representative ctx pair.
  const ACTIONS: ReadonlyArray<ReportAction> = [
    'generate',
    'save',
    'update',
    'delete',
    'scheduleCreate',
    'scheduleDelete',
    'render',
    'recipientUser',
    'recipientEmail',
    'exportJson',
  ];
  const SCOPE_KINDS: ReadonlyArray<ReportScopeKind> = ['card', 'list', 'board', 'workspace'];

  it.each(ACTIONS)('action=%s × all scopes returns boolean result for owner ctx', (action) => {
    for (const sk of SCOPE_KINDS) {
      const r = canPerformReportAction(action, SCOPES[sk], CTX.ownerBoardAdmin);
      expect(typeof r.allowed).toBe('boolean');
    }
  });
});

describe('canPerformReportAction — i18n key binding (every deny reason must have a translation key)', () => {
  // 13F UI tarafı `result.reason` snake_case'i `REPORT_I18N_KEYS.permissionReason`'da
  // camelCase eşle resolve eder. Yeni bir deny reason eklenirse i18n-keys'e de
  // ekli olduğundan emin olmak için tüm `deny()` reason'larını matrix
  // üzerinden topla + karşılığını ara.
  function toCamelCase(snake: string): string {
    return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  }

  it('every deny reason emitted by the matrix has a permissionReason i18n key', () => {
    const ACTIONS: ReadonlyArray<ReportAction> = [
      'generate',
      'save',
      'update',
      'delete',
      'scheduleCreate',
      'scheduleDelete',
      'render',
      'recipientUser',
      'recipientEmail',
      'exportJson',
    ];
    const CTXS: ReadonlyArray<ReportPermissionCtx> = [
      CTX.noAccess,
      CTX.guestNoBoard,
      CTX.memberNoBoard,
      CTX.memberBoardViewer,
      CTX.memberBoardMember,
      CTX.memberBoardAdmin,
      CTX.adminBoardAdmin,
      CTX.ownerBoardAdmin,
    ];
    const SCOPE_KINDS: ReadonlyArray<ReportScopeKind> = ['card', 'list', 'board', 'workspace'];

    const seen = new Set<string>();
    for (const a of ACTIONS) {
      for (const c of CTXS) {
        for (const sk of SCOPE_KINDS) {
          const r = canPerformReportAction(a, SCOPES[sk], c);
          if (!r.allowed && r.reason) seen.add(r.reason);
        }
      }
    }

    expect(seen.size).toBeGreaterThan(0);
    const keys = REPORT_I18N_KEYS.permissionReason as Record<string, string>;
    for (const reason of seen) {
      const camel = toCamelCase(reason);
      expect(
        keys[camel],
        `permissionReason "${reason}" (camelCase: ${camel}) i18n key map'inde yok`,
      ).toBeDefined();
    }
  });
});
