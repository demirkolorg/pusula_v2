/**
 * Nav (navigator) router — sol panel "Gezgin" için tek seferde tüm
 * workspace/board/list/card hiyerarşisini döndürür. Pano ekranında kullanılır.
 *
 * Yetki: her workspace için kullanıcının rolü çözülür. `guest` ise yalnız
 * `board_members` aracılığıyla erişebildiği board'lar görünür; `member+` ise
 * workspace'teki tüm board'lar. Listeler/kartlar yalnızca aktif olanlardır
 * (`archived_at IS NULL`).
 */
import { and, asc, eq, inArray, isNull } from '@pusula/db';
import {
  boardMembers,
  boards,
  cards,
  lists,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { effectiveBoardRole, type BoardRole, type WorkspaceRole } from '@pusula/domain';
import { protectedProcedure, router } from '../trpc';

type WorkspaceNode = {
  id: string;
  name: string;
  icon: string;
  role: WorkspaceRole;
  boards: BoardNode[];
};

type BoardNode = {
  id: string;
  workspaceId: string;
  title: string;
  icon: string;
  role: BoardRole;
  lists: ListNode[];
};

type ListNode = {
  id: string;
  boardId: string;
  title: string;
  cards: CardNode[];
};

type CardNode = {
  id: string;
  listId: string;
  boardId: string;
  title: string;
  completed: boolean;
};

export const navRouter = router({
  /**
   * Tüm hiyerarşi tek çağrıda. Sıralama:
   * - workspaces: `created_at` asc
   * - boards: `created_at` asc
   * - lists: `position` asc
   * - cards: `position` asc
   *
   * Arşivli workspace / board / list / card döndürülmez (bu panel canlı
   * gezinme için; arşiv ekranı ayrı).
   */
  tree: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // 1) Kullanıcının üyesi olduğu, arşivli olmayan workspace'ler + rolleri.
    const workspaceRows = await ctx.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        icon: workspaces.icon,
        role: workspaceMembers.role,
        createdAt: workspaces.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, userId), isNull(workspaces.archivedAt)))
      .orderBy(asc(workspaces.createdAt));

    if (workspaceRows.length === 0) {
      return { workspaces: [] satisfies WorkspaceNode[] };
    }

    const guestWorkspaceIds = workspaceRows
      .filter((row) => row.role === 'guest')
      .map((row) => row.id);
    const nonGuestWorkspaceIds = workspaceRows
      .filter((row) => row.role !== 'guest')
      .map((row) => row.id);

    // 2) Görünür board'lar — iki kısımdan oluşur:
    //    a) guest workspace'lerde yalnız `board_members` üzerinden erişilenler
    //    b) member+ workspace'lerde workspace'in tüm aktif board'ları
    //    (kullanıcının opsiyonel `board_members` rolü ile birlikte)
    const boardCols = {
      id: boards.id,
      workspaceId: boards.workspaceId,
      title: boards.title,
      icon: boards.icon,
      createdAt: boards.createdAt,
      boardRole: boardMembers.role,
    } as const;

    const guestBoardRows =
      guestWorkspaceIds.length === 0
        ? []
        : await ctx.db
            .select(boardCols)
            .from(boards)
            .innerJoin(
              boardMembers,
              and(eq(boardMembers.boardId, boards.id), eq(boardMembers.userId, userId)),
            )
            .where(
              and(inArray(boards.workspaceId, guestWorkspaceIds), isNull(boards.archivedAt)),
            )
            .orderBy(asc(boards.createdAt));

    const memberBoardRows =
      nonGuestWorkspaceIds.length === 0
        ? []
        : await ctx.db
            .select(boardCols)
            .from(boards)
            .leftJoin(
              boardMembers,
              and(eq(boardMembers.boardId, boards.id), eq(boardMembers.userId, userId)),
            )
            .where(
              and(inArray(boards.workspaceId, nonGuestWorkspaceIds), isNull(boards.archivedAt)),
            )
            .orderBy(asc(boards.createdAt));

    const allBoardRows = [...guestBoardRows, ...memberBoardRows];
    const boardIds = allBoardRows.map((row) => row.id);

    // 3) Listeler — aktif, board ID setiyle, `position` asc.
    const listRows =
      boardIds.length === 0
        ? []
        : await ctx.db
            .select({
              id: lists.id,
              boardId: lists.boardId,
              title: lists.title,
              position: lists.position,
            })
            .from(lists)
            .where(and(inArray(lists.boardId, boardIds), isNull(lists.archivedAt)))
            .orderBy(asc(lists.position));

    const listIds = listRows.map((row) => row.id);

    // 4) Kartlar — aktif, list ID setiyle, `position` asc.
    const cardRows =
      listIds.length === 0
        ? []
        : await ctx.db
            .select({
              id: cards.id,
              listId: cards.listId,
              boardId: cards.boardId,
              title: cards.title,
              completed: cards.completed,
              position: cards.position,
            })
            .from(cards)
            .where(and(inArray(cards.listId, listIds), isNull(cards.archivedAt)))
            .orderBy(asc(cards.position));

    // --- Grupla ----------------------------------------------------------------
    const cardsByList = new Map<string, CardNode[]>();
    for (const row of cardRows) {
      const node: CardNode = {
        id: row.id,
        listId: row.listId,
        boardId: row.boardId,
        title: row.title,
        completed: row.completed,
      };
      const bucket = cardsByList.get(row.listId);
      if (bucket) bucket.push(node);
      else cardsByList.set(row.listId, [node]);
    }

    const listsByBoard = new Map<string, ListNode[]>();
    for (const row of listRows) {
      const node: ListNode = {
        id: row.id,
        boardId: row.boardId,
        title: row.title,
        cards: cardsByList.get(row.id) ?? [],
      };
      const bucket = listsByBoard.get(row.boardId);
      if (bucket) bucket.push(node);
      else listsByBoard.set(row.boardId, [node]);
    }

    const workspaceRoleById = new Map<string, WorkspaceRole>();
    for (const row of workspaceRows) workspaceRoleById.set(row.id, row.role);

    const boardsByWorkspace = new Map<string, BoardNode[]>();
    for (const row of allBoardRows) {
      const workspaceRole = workspaceRoleById.get(row.workspaceId);
      if (!workspaceRole) continue;
      const role = effectiveBoardRole({
        workspaceRole,
        boardRole: row.boardRole ?? null,
      });
      if (!role) continue;
      const node: BoardNode = {
        id: row.id,
        workspaceId: row.workspaceId,
        title: row.title,
        icon: row.icon,
        role,
        lists: listsByBoard.get(row.id) ?? [],
      };
      const bucket = boardsByWorkspace.get(row.workspaceId);
      if (bucket) bucket.push(node);
      else boardsByWorkspace.set(row.workspaceId, [node]);
    }

    const result: WorkspaceNode[] = workspaceRows.map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      role: row.role,
      boards: boardsByWorkspace.get(row.id) ?? [],
    }));

    return { workspaces: result };
  }),
});

export type NavTreeOutput = {
  workspaces: WorkspaceNode[];
};
