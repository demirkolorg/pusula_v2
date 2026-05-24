/**
 * Faz 13D — `PermissionsCtx` somut implementasyonu (DEM-260). Domain
 * (`@pusula/domain/reports/scope-adapter`) yalnız arayüzü bilir; bu
 * dosya gerçek Drizzle sorgularını sağlar.
 *
 * - `accessibleBoardsInWorkspace` / `accessibleListsInBoard`:
 *   restricted-scope hesaplaması (§9.4 — "bilgi sızıntısı yok") için
 *   session user'ın görebildiği alt entity id listesi.
 * - `hasBoardAccess` / `hasWorkspaceAccess`: rapor scope adapter'larından
 *   spot-check için ≥ min role karşılaştırması.
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §16.5 +
 * `docs/domain/09-raporlama-kurallari.md` §9.3-§9.4.
 */
import { and, eq, isNull, sql, type Database } from '@pusula/db';
import {
  boardMembers,
  boards,
  lists,
  workspaceMembers,
} from '@pusula/db';
import {
  boardRoleAtLeast,
  effectiveBoardRole,
  workspaceRoleAtLeast,
  type BoardRole,
  type WorkspaceRole,
} from '@pusula/domain';
import type { PermissionsCtx } from '@pusula/domain/reports';

/**
 * Session user + workspace üyeliğinden tipik `PermissionsCtx` üret.
 * `userId` ve `userWorkspaceRole` çağıran procedure'de çözülmüş olur;
 * helper sadece "bu user için workspace içinde hangi board id'leri /
 * board içinde hangi list id'leri erişilebilir?" sorularını cevaplar.
 */
export function buildReportPermissionsCtx(args: {
  db: Database;
  userId: string;
  /** Optional cache: bilinen workspaceId → workspaceRole eşlemesi. */
  workspaceRoleByWorkspace?: Map<string, WorkspaceRole>;
}): PermissionsCtx {
  const { db, userId } = args;
  const workspaceRoleByWorkspace = args.workspaceRoleByWorkspace ?? new Map<string, WorkspaceRole>();

  // Request-scope caches — aynı workspaceId/boardId birden fazla micro-report
  // tarafından sorulur; tek tRPC call'da DB'yi N kere hit etmesin (13O).
  const accessibleBoardsCache = new Map<string, readonly string[]>();
  const accessibleListsCache = new Map<string, readonly string[]>();
  const totalBoardsCache = new Map<string, number>();
  const totalListsCache = new Map<string, number>();

  async function resolveWorkspaceRole(workspaceId: string): Promise<WorkspaceRole | null> {
    const cached = workspaceRoleByWorkspace.get(workspaceId);
    if (cached) return cached;
    const [row] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!row) return null;
    workspaceRoleByWorkspace.set(workspaceId, row.role);
    return row.role;
  }

  async function resolveEffectiveBoardRole(boardId: string): Promise<BoardRole | null> {
    const [board] = await db
      .select({ id: boards.id, workspaceId: boards.workspaceId, archivedAt: boards.archivedAt })
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);
    if (!board) return null;

    const workspaceRole = await resolveWorkspaceRole(board.workspaceId);
    if (!workspaceRole) return null;

    const [membership] = await db
      .select({ role: boardMembers.role })
      .from(boardMembers)
      .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)))
      .limit(1);

    return effectiveBoardRole({
      workspaceRole,
      boardRole: membership?.role ?? null,
    });
  }

  return {
    async accessibleBoardsInWorkspace(workspaceId: string): Promise<readonly string[]> {
      const cached = accessibleBoardsCache.get(workspaceId);
      if (cached) return cached;

      const workspaceRole = await resolveWorkspaceRole(workspaceId);
      if (!workspaceRole) {
        accessibleBoardsCache.set(workspaceId, []);
        return [];
      }

      // Workspace owner / admin tüm panoları görür; member ise yalnız
      // member olduğu pano + ek pano üyeliği aldığı panoları. Guest sadece
      // explicit board membership.
      let ids: string[];
      if (workspaceRole === 'owner' || workspaceRole === 'admin') {
        const rows = await db
          .select({ id: boards.id })
          .from(boards)
          .where(and(eq(boards.workspaceId, workspaceId), isNull(boards.archivedAt)));
        ids = rows.map((r) => r.id);
      } else if (workspaceRole === 'member') {
        // Member: workspace içinde tüm panoları görür (Pusula board visibility:
        // workspace member → effective board role 'member'). Ama explicit
        // `board_members.role = 'viewer'` yoksa, workspace member zaten
        // görür (effectiveBoardRole 'member' döner). Guest için explicit
        // board membership şart.
        const rows = await db
          .select({ id: boards.id })
          .from(boards)
          .where(and(eq(boards.workspaceId, workspaceId), isNull(boards.archivedAt)));
        ids = rows.map((r) => r.id);
      } else {
        // Guest: yalnız explicit board membership.
        const rows = await db
          .select({ boardId: boardMembers.boardId })
          .from(boardMembers)
          .innerJoin(boards, eq(boards.id, boardMembers.boardId))
          .where(
            and(
              eq(boardMembers.userId, userId),
              eq(boards.workspaceId, workspaceId),
              isNull(boards.archivedAt),
            ),
          );
        ids = rows.map((r) => r.boardId);
      }

      accessibleBoardsCache.set(workspaceId, ids);
      return ids;
    },

    async accessibleListsInBoard(boardId: string): Promise<readonly string[]> {
      const cached = accessibleListsCache.get(boardId);
      if (cached) return cached;

      const role = await resolveEffectiveBoardRole(boardId);
      if (!role) {
        accessibleListsCache.set(boardId, []);
        return [];
      }
      // Şu an Pusula'da list-level ACL yok — board erişimi olan tüm liste
      // id'lerini döner. Arşivli listeler ileride filtre seçeneği üstünden
      // geçilir (`scopeFilter.includeArchivedLists`); burada tüm liste
      // id'lerini döneriz (kullanıcıya görünür olan).
      const rows = await db
        .select({ id: lists.id })
        .from(lists)
        .where(eq(lists.boardId, boardId));
      const ids = rows.map((r) => r.id);
      accessibleListsCache.set(boardId, ids);
      return ids;
    },

    async hasBoardAccess(boardId: string, minRole: BoardRole): Promise<boolean> {
      const role = await resolveEffectiveBoardRole(boardId);
      if (!role) return false;
      return boardRoleAtLeast(role, minRole);
    },

    async hasWorkspaceAccess(workspaceId: string, minRole: WorkspaceRole): Promise<boolean> {
      const role = await resolveWorkspaceRole(workspaceId);
      if (!role) return false;
      return workspaceRoleAtLeast(role, minRole);
    },

    async totalBoardsInWorkspace(workspaceId: string): Promise<number> {
      const cached = totalBoardsCache.get(workspaceId);
      if (cached !== undefined) return cached;

      // Permission-bağımsız sayım — `restrictedScope.excludedCount` hesabı
      // için. Arşivli board'lar dışlanır (rapor envelope'u arşivli olanı
      // hesaplamıyor; UI/PDF aktif board görünümü).
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(boards)
        .where(and(eq(boards.workspaceId, workspaceId), isNull(boards.archivedAt)));
      const total = row?.count ?? 0;
      totalBoardsCache.set(workspaceId, total);
      return total;
    },

    async totalListsInBoard(boardId: string): Promise<number> {
      const cached = totalListsCache.get(boardId);
      if (cached !== undefined) return cached;

      // Permission-bağımsız sayım. V1'de Pusula'da list-level ACL yok;
      // V2'de gelirse `computeRestrictedScope` board scope için kullanır.
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(lists)
        .where(eq(lists.boardId, boardId));
      const total = row?.count ?? 0;
      totalListsCache.set(boardId, total);
      return total;
    },
  };
}
