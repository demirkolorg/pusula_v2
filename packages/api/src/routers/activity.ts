/**
 * Activity router — Faz 17 (yeni). Sol kenardaki "Aktivite Akışı" global
 * panelinin (DEM-313'ün ikinci yarısı) tek prosedürü: kullanıcının erişebildiği
 * tüm workspace/board'lardan global aktivite akışı, cursor-paginated.
 *
 * - `audit.list` pattern'ı (DEM-282 tarafından kanıtlanmış): bileşik cursor
 *   `(createdAt DESC, id DESC)`, base64-JSON encoded, +1 satır lookahead ile
 *   `hasMore` çıkar.
 * - Visibility: önce kullanıcının erişebildiği `accessibleBoardIds`'i çek
 *   (`nav.tree` ile aynı disiplin — workspace member+ → tüm board'lar,
 *   workspace guest → yalnız explicit `board_members` üyelik) sonra
 *   `activity_events.board_id IN (...)` filtrele. Hiç board yoksa boş döner.
 * - Tip filtresi: opsiyonel chip grupları (`card_changes` / `comments` /
 *   `members` / `other`). 4 sabit grup, her grup `ACTIVITY_EVENT_TYPES`'tan
 *   bir alt küme. UI chip ile gönderir, backend `IN (...)` filtreyi uygular.
 * - Workspace-scope event'ler (board_id NULL) ilk sürümde DAHIL DEĞIL — panel
 *   "board aktivitelerinden global feed" pratiğini izler; üye davetleri vs.
 *   ileride opt-in olarak eklenebilir.
 */
import { TRPCError } from '@trpc/server';
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from '@pusula/db';
import {
  activityEvents,
  boardMembers,
  boards,
  cards,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import type { ActivityEventType } from '@pusula/domain';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';

const FEED_PAGE_DEFAULT = 30;
const FEED_PAGE_MAX = 100;

/**
 * UI chip grupları — `ACTIVITY_EVENT_TYPES`'ı 5 kova (bucket) altında
 * topluyoruz. Frontend chip seçildiğinde sadece o grup(lar)daki tipler
 * `IN (...)` filtreye girer. Boş seçim = "tümü" (filtre uygulanmaz).
 *
 * - `card_changes`: kart oluşturma, taşıma, etiket, vade, tamamlama, arşiv,
 *   ek dosya.
 * - `comments`: SADECE yorum aksiyonları + mention.
 * - `checklists`: checklist oluşturma + madde ekle/kaldır/işaretle.
 * - `members`: kart/board/workspace üye ekleme-çıkarma, davet, rol değişimi.
 * - `other`: board/list/workspace oluşturma, yeniden adlandırma, arka plan,
 *   erişim talebi.
 */
export const ACTIVITY_FEED_GROUPS = [
  'card_changes',
  'comments',
  'checklists',
  'members',
  'other',
] as const;
export type ActivityFeedGroup = (typeof ACTIVITY_FEED_GROUPS)[number];

const GROUP_TO_TYPES: Record<ActivityFeedGroup, readonly ActivityEventType[]> = {
  card_changes: [
    'card.created',
    'card.updated',
    'card.moved',
    'card.renamed',
    'card.description_changed',
    'card.archived',
    'card.deleted',
    'card.completed',
    'card.uncompleted',
    'card.due_set',
    'card.due_cleared',
    'card.label_added',
    'card.label_removed',
    'card.cover_changed',
    'card.cover_cleared',
    'card.cover_image_changed',
    'card.cover_image_cleared',
    'attachment.added',
    'attachment.removed',
  ],
  comments: [
    'comment.created',
    'comment.updated',
    'comment.deleted',
    'comment.mentioned',
  ],
  checklists: [
    'checklist.created',
    'checklist.item_added',
    'checklist.item_checked',
    'checklist.item_unchecked',
    'checklist.item_removed',
    'checklist.item_completed',
  ],
  members: [
    'card.member_added',
    'card.member_removed',
    'board.member_added',
    'board.member_removed',
    'board.member_role_changed',
    'board.member_invited',
    'board.invitation_revoked',
    'workspace.member_added',
    'workspace.member_removed',
    'workspace.member_role_changed',
    'workspace.member_invited',
    'workspace.invitation_revoked',
  ],
  other: [
    'workspace.created',
    'workspace.updated',
    'workspace.archived',
    'board.created',
    'board.updated',
    'board.renamed',
    'board.archived',
    'board.background_changed',
    'board.background_cleared',
    'board.access_requested',
    'list.created',
    'list.updated',
    'list.moved',
    'list.renamed',
    'list.archived',
    'list.deleted',
    'list.color_changed',
    'list.color_cleared',
    'list.icon_changed',
    'list.icon_cleared',
  ],
};

const feedInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(FEED_PAGE_MAX).optional(),
  /**
   * Chip filtresi. Boş array / undefined → tüm tipler. Geçersiz grup adı Zod
   * tarafından reject (`enum`).
   */
  groups: z.array(z.enum(ACTIVITY_FEED_GROUPS)).optional(),
});

interface CursorPayload {
  createdAt: string;
  id: string;
}

function decodeCursor(raw: string): CursorPayload | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<CursorPayload>;
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export const activityRouter = router({
  /**
   * Global aktivite akışı — kullanıcının erişebildiği tüm board'lardan en yeni
   * önce. Cursor `(createdAt DESC, id DESC)` bileşik. `groups` boşsa tüm
   * tipler; doluysa seçilen grup(lar)ın tip kümesi `IN (...)`.
   *
   * Performans: `activity_events_board_created_idx (board_id, created_at)`
   * indexi sayesinde `board_id IN (...) ORDER BY created_at DESC LIMIT N` hızlı
   * çalışır. Workspace member+ kullanıcılarda board kümesi büyük olabilir; yine
   * de tek `IN (...)` yeterli (10K+ board nadirdir; ekstrem ölçek için
   * gelecekte materialised view düşünülebilir).
   */
  feed: protectedProcedure.input(feedInput).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const limit = input.limit ?? FEED_PAGE_DEFAULT;

    // 1) Erişilebilir board ID'leri. İki dal:
    // (a) member+ workspace (owner/admin/member, NOT guest) → workspace'in tüm aktif board'ları
    // (b) guest workspace → yalnız explicit `board_members` satırı olan aktif board'lar
    const memberBoardRows = await ctx.db
      .select({ id: boards.id })
      .from(boards)
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, boards.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .where(and(isNull(boards.archivedAt), ne(workspaceMembers.role, 'guest')));

    const guestBoardRows = await ctx.db
      .select({ id: boards.id })
      .from(boardMembers)
      .innerJoin(boards, eq(boards.id, boardMembers.boardId))
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, boards.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .where(
        and(
          eq(boardMembers.userId, userId),
          eq(workspaceMembers.role, 'guest'),
          isNull(boards.archivedAt),
        ),
      );

    const boardIdSet = new Set<string>();
    for (const row of memberBoardRows) boardIdSet.add(row.id);
    for (const row of guestBoardRows) boardIdSet.add(row.id);
    const boardIds = Array.from(boardIdSet);

    if (boardIds.length === 0) {
      return { items: [], nextCursor: null as string | null };
    }

    // 2) Tip filtresi — grup → tip kümesi.
    const wantedTypes: ActivityEventType[] = [];
    if (input.groups && input.groups.length > 0) {
      for (const group of input.groups) {
        for (const type of GROUP_TO_TYPES[group]) wantedTypes.push(type);
      }
    }

    // 3) Cursor decode.
    let cursorDate: Date | null = null;
    let cursorId: string | null = null;
    if (input.cursor) {
      const decoded = decodeCursor(input.cursor);
      if (!decoded) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Geçersiz cursor.' });
      }
      cursorDate = new Date(decoded.createdAt);
      cursorId = decoded.id;
      if (Number.isNaN(cursorDate.getTime())) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Geçersiz cursor.' });
      }
    }

    // 4) Ana sorgu — activity_events + board (inner; visibility filter board
     // kümesinden zaten geliyor) + workspace + actor (left) + card (left).
     // JOIN sırası: inner'lar önce, left'ler sonra — bazı Drizzle sürümleri
     // `leftJoin → innerJoin` zincirinde runtime'da yanlış SQL üretebiliyor.
    const conditions = [
      inArray(activityEvents.boardId, boardIds),
      // İlk sürümde workspace-scope (board_id NULL) event'leri DAHIL DEĞIL.
      isNotNull(activityEvents.boardId),
    ];
    if (wantedTypes.length > 0) {
      // Drizzle 0.45 + node-postgres'in `pgEnum` kolonuna `eq()` / `inArray()`
      // ile string literal geçince prepared-statement type inference'ı
      // başarısız oluyor — Postgres "operator does not exist:
      // activity_event_type = text" atıyor. Çözüm: kolonu açıkça `::text`'e
      // cast et, string karşılaştırması yap. Indeks kaybı yok çünkü
      // activity_events üzerindeki birincil indeks `(board_id, created_at)`
      // (zaten `board_id IN (...)` ile kullanılıyor).
      const typeOr = or(...wantedTypes.map((t) => sql`${activityEvents.type}::text = ${t}`));
      if (typeOr) conditions.push(typeOr);
    }
    if (cursorDate && cursorId) {
      const tuple = or(
        lt(activityEvents.createdAt, cursorDate),
        and(eq(activityEvents.createdAt, cursorDate), lt(activityEvents.id, cursorId)),
      );
      if (tuple) conditions.push(tuple);
    }

    const rows = await ctx.db
      .select({
        id: activityEvents.id,
        type: activityEvents.type,
        createdAt: activityEvents.createdAt,
        workspaceId: activityEvents.workspaceId,
        boardId: activityEvents.boardId,
        cardId: activityEvents.cardId,
        actorId: activityEvents.actorId,
        actorName: users.name,
        actorImage: users.image,
        cardTitle: cards.title,
        boardTitle: boards.title,
        boardIcon: boards.icon,
        workspaceName: workspaces.name,
        workspaceIcon: workspaces.icon,
      })
      .from(activityEvents)
      .innerJoin(boards, eq(boards.id, activityEvents.boardId))
      .innerJoin(workspaces, eq(workspaces.id, activityEvents.workspaceId))
      .leftJoin(users, eq(users.id, activityEvents.actorId))
      .leftJoin(cards, eq(cards.id, activityEvents.cardId))
      .where(and(...conditions))
      .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null;

    return { items, nextCursor };
  }),
});
