/**
 * My Tasks router — Faz 17 (yeni). Sol kenardaki "Görevlerim" global panelinin
 * (DEM-313'ün ilk yarısı) tek prosedürü: kullanıcının `assignee` olarak atandığı,
 * aktif (archived_at IS NULL) ve `completed = false` kartları döner. UI tarafı
 * frontend'de tarih gruplarına (vadesi geçti / bugün / bu hafta / sonra /
 * vadesiz) ayırır; backend yalnız sıralanmış düz listeyi üretir.
 *
 * Visibility: card_members satırı kartı korumaya yetmez — kullanıcı aradan
 * board'a erişimi kaybetmiş olabilir (workspace üyeliği bitti, board guest +
 * board_members satırı silindi vs.). `nav.tree` ile aynı pattern: workspace
 * member+ → tüm board'lar; workspace guest → yalnız explicit `board_members`
 * satırı olan board'lar. Filtreyi SQL içinde JOIN ile yapıyoruz (effective
 * board role JS tarafında çözülür, role=null ise satır düşer).
 *
 * Pagination: ilk sürümde "Görevlerim genelde 200'ün altında" varsayımıyla düz
 * `limit 200`. Aşılırsa frontend "Daha fazla" göstermek için cursor eklenebilir
 * (audit.list pattern'ı hazır). Sayım UI için ayrıca dönmüyoruz —
 * `items.length` yeterli.
 */
import { and, asc, desc, eq, isNull, sql } from '@pusula/db';
import {
  boardMembers,
  boards,
  cardMembers,
  cards,
  lists,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { effectiveBoardRole } from '@pusula/domain';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';

/** İlk sürüm: hard cap. Üst sınıra dayanan kullanıcı görürse cursor eklenir. */
const MY_TASKS_HARD_LIMIT = 200;

const listInput = z
  .object({
    limit: z.number().int().min(1).max(MY_TASKS_HARD_LIMIT).optional(),
  })
  .optional();

export const myTasksRouter = router({
  /**
   * Kullanıcının görevleri — assignee + açık + arşivsiz. Sıralama: önce
   * `due_at` ASC (NULL en altta), sonra `created_at` DESC tie-breaker. Frontend
   * grouping bu sıralamayla doğru görünür (vadesi geçen ve yakın olan üstte).
   */
  assignedToMe: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const limit = input?.limit ?? MY_TASKS_HARD_LIMIT;

    const rows = await ctx.db
      .select({
        cardId: cards.id,
        cardTitle: cards.title,
        cardDueAt: cards.dueAt,
        cardCompleted: cards.completed,
        cardCoverColor: cards.coverColor,
        cardCreatedAt: cards.createdAt,
        listId: lists.id,
        listTitle: lists.title,
        boardId: boards.id,
        boardTitle: boards.title,
        boardIcon: boards.icon,
        workspaceId: workspaces.id,
        workspaceName: workspaces.name,
        workspaceIcon: workspaces.icon,
        workspaceRole: workspaceMembers.role,
        boardRole: boardMembers.role,
      })
      .from(cardMembers)
      .innerJoin(cards, eq(cards.id, cardMembers.cardId))
      .innerJoin(lists, eq(lists.id, cards.listId))
      .innerJoin(boards, eq(boards.id, cards.boardId))
      .innerJoin(workspaces, eq(workspaces.id, boards.workspaceId))
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, boards.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .leftJoin(
        boardMembers,
        and(eq(boardMembers.boardId, boards.id), eq(boardMembers.userId, userId)),
      )
      .where(
        and(
          eq(cardMembers.userId, userId),
          eq(cardMembers.role, 'assignee'),
          eq(cards.completed, false),
          isNull(cards.archivedAt),
          isNull(lists.archivedAt),
          isNull(boards.archivedAt),
          isNull(workspaces.archivedAt),
        ),
      )
      .orderBy(
        // PostgreSQL `ORDER BY due_at ASC NULLS LAST` semantics — null due
        // dates her zaman en altta. SQL parçası kullanıyoruz çünkü Drizzle'da
        // direkt `nullsLast` modifier yok.
        sql`${cards.dueAt} ASC NULLS LAST`,
        desc(cards.createdAt),
        asc(cards.id),
      )
      .limit(limit);

    // Visibility filter: workspace guest + board_members satırı yok ise düş.
    // `effectiveBoardRole` `null` döndüğünde kullanıcı board'u göremez.
    const items = rows
      .map((row) => {
        const role = effectiveBoardRole({
          workspaceRole: row.workspaceRole,
          boardRole: row.boardRole ?? null,
        });
        if (!role) return null;
        return {
          card: {
            id: row.cardId,
            title: row.cardTitle,
            dueAt: row.cardDueAt,
            completed: row.cardCompleted,
            coverColor: row.cardCoverColor,
            createdAt: row.cardCreatedAt,
          },
          list: { id: row.listId, title: row.listTitle },
          board: {
            id: row.boardId,
            title: row.boardTitle,
            icon: row.boardIcon,
            role,
          },
          workspace: {
            id: row.workspaceId,
            name: row.workspaceName,
            icon: row.workspaceIcon,
          },
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    return { items, hasMore: items.length >= limit };
  }),
});
