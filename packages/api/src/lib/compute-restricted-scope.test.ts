/**
 * Faz 13O (DEM-271) — `computeRestrictedScope` saf fonksiyon testleri.
 * Mock `PermissionsCtx` — DB gerektirmez.
 *
 * §9.4 "bilgi sızıntısı yok" disiplini: dışlanan entity'lerin id/name'i
 * envelope'a girmemeli; yalnız sayım + kind görünür.
 */
import { describe, expect, it } from 'vitest';
import type {
  PermissionsCtx,
  QueryCtx,
  ReportScope,
} from '@pusula/domain/reports';
import { computeRestrictedScope } from './compute-restricted-scope';

const NOW = new Date('2026-05-24T00:00:00.000Z');

interface PermissionsCtxOverrides {
  accessibleBoardsInWorkspace?: PermissionsCtx['accessibleBoardsInWorkspace'];
  accessibleListsInBoard?: PermissionsCtx['accessibleListsInBoard'];
  hasBoardAccess?: PermissionsCtx['hasBoardAccess'];
  hasWorkspaceAccess?: PermissionsCtx['hasWorkspaceAccess'];
  totalBoardsInWorkspace?: PermissionsCtx['totalBoardsInWorkspace'];
  totalListsInBoard?: PermissionsCtx['totalListsInBoard'];
}

function makeCtx(perms: PermissionsCtxOverrides): QueryCtx {
  const defaults: PermissionsCtx = {
    accessibleBoardsInWorkspace: async () => [],
    accessibleListsInBoard: async () => [],
    hasBoardAccess: async () => false,
    hasWorkspaceAccess: async () => false,
    totalBoardsInWorkspace: async () => 0,
    totalListsInBoard: async () => 0,
  };
  return {
    db: {},
    permissions: { ...defaults, ...perms },
    userId: 'u-1',
    now: () => NOW,
  };
}

const WS_SCOPE: ReportScope = { kind: 'workspace', workspaceId: 'w-1' };
const BOARD_SCOPE: ReportScope = {
  kind: 'board',
  boardId: 'b-1',
  workspaceId: 'w-1',
};
const LIST_SCOPE: ReportScope = {
  kind: 'list',
  listId: 'l-1',
  boardId: 'b-1',
  workspaceId: 'w-1',
};
const CARD_SCOPE: ReportScope = {
  kind: 'card',
  cardId: 'c-1',
  boardId: 'b-1',
  workspaceId: 'w-1',
};

describe('computeRestrictedScope — workspace scope', () => {
  it('workspace admin (hasWorkspaceAccess admin=true) → null (her şeyi görür)', async () => {
    const ctx = makeCtx({
      hasWorkspaceAccess: async (_wsId, min) => min === 'admin',
      accessibleBoardsInWorkspace: async () => ['b-1', 'b-2', 'b-3', 'b-4', 'b-5'],
      totalBoardsInWorkspace: async () => 5,
    });
    const result = await computeRestrictedScope({ ctx, scope: WS_SCOPE });
    expect(result).toBeNull();
  });

  it('workspace member, 5 board, 3 erişilebilir → { board, excludedCount: 2 }', async () => {
    const ctx = makeCtx({
      hasWorkspaceAccess: async () => false, // member değil admin
      accessibleBoardsInWorkspace: async () => ['b-1', 'b-2', 'b-3'],
      totalBoardsInWorkspace: async () => 5,
    });
    const result = await computeRestrictedScope({ ctx, scope: WS_SCOPE });
    expect(result).toEqual({ excludedKind: 'board', excludedCount: 2 });
  });

  it('workspace member, 5 board, hiçbirine üye değil → { board, excludedCount: 5 }', async () => {
    const ctx = makeCtx({
      hasWorkspaceAccess: async () => false,
      accessibleBoardsInWorkspace: async () => [],
      totalBoardsInWorkspace: async () => 5,
    });
    const result = await computeRestrictedScope({ ctx, scope: WS_SCOPE });
    expect(result).toEqual({ excludedKind: 'board', excludedCount: 5 });
  });

  it('workspace member, 0 board (workspace boş) → null', async () => {
    const ctx = makeCtx({
      hasWorkspaceAccess: async () => false,
      accessibleBoardsInWorkspace: async () => [],
      totalBoardsInWorkspace: async () => 0,
    });
    const result = await computeRestrictedScope({ ctx, scope: WS_SCOPE });
    expect(result).toBeNull();
  });

  it('workspace member, tüm board üyesi (5/5) → null', async () => {
    const ctx = makeCtx({
      hasWorkspaceAccess: async () => false,
      accessibleBoardsInWorkspace: async () => ['b-1', 'b-2', 'b-3', 'b-4', 'b-5'],
      totalBoardsInWorkspace: async () => 5,
    });
    const result = await computeRestrictedScope({ ctx, scope: WS_SCOPE });
    expect(result).toBeNull();
  });

  it('defensive: accessible > total (cache stale) → excludedCount<=0 → null', async () => {
    // Workspace içinde 3 board var ama cache'te 5 accessibleBoard rapor
    // ediyorsa (test pathology) negatif sayım yerine null dön.
    const ctx = makeCtx({
      hasWorkspaceAccess: async () => false,
      accessibleBoardsInWorkspace: async () => ['b-1', 'b-2', 'b-3', 'b-4', 'b-5'],
      totalBoardsInWorkspace: async () => 3,
    });
    const result = await computeRestrictedScope({ ctx, scope: WS_SCOPE });
    expect(result).toBeNull();
  });
});

describe('computeRestrictedScope — board/list/card scope (V1: hep null)', () => {
  it('board scope → null (Pusula V1 list-level ACL yok)', async () => {
    const ctx = makeCtx({
      hasWorkspaceAccess: async () => false,
      accessibleListsInBoard: async () => ['l-1', 'l-2'],
      totalListsInBoard: async () => 5,
    });
    const result = await computeRestrictedScope({ ctx, scope: BOARD_SCOPE });
    expect(result).toBeNull();
  });

  it('list scope → null', async () => {
    const ctx = makeCtx({});
    const result = await computeRestrictedScope({ ctx, scope: LIST_SCOPE });
    expect(result).toBeNull();
  });

  it('card scope → null', async () => {
    const ctx = makeCtx({});
    const result = await computeRestrictedScope({ ctx, scope: CARD_SCOPE });
    expect(result).toBeNull();
  });
});

describe('computeRestrictedScope — bilgi sızıntısı (§9.4)', () => {
  it('envelope rozeti SADECE { excludedKind, excludedCount } taşır — board id/title YOK', async () => {
    // PermissionsCtx 5 board'dan sadece 'b-1', 'b-2', 'b-3' erişilebilir.
    // Banner sadece "2 board görünürlüğünüz dışında" demeli; b-4, b-5
    // hakkında hiçbir bilgi rozette geçmez.
    const ctx = makeCtx({
      hasWorkspaceAccess: async () => false,
      accessibleBoardsInWorkspace: async () => ['b-1', 'b-2', 'b-3'],
      totalBoardsInWorkspace: async () => 5,
    });
    const result = await computeRestrictedScope({ ctx, scope: WS_SCOPE });
    expect(result).not.toBeNull();
    expect(Object.keys(result!).sort()).toEqual(['excludedCount', 'excludedKind']);
    // Hiçbir entity id'si rozette yok.
    expect(JSON.stringify(result)).not.toContain('b-4');
    expect(JSON.stringify(result)).not.toContain('b-5');
  });
});
