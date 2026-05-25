/**
 * Faz 14D — Klasik pano PDF raporu için veri toplayıcı service (DEM-293).
 *
 * Tek çağrıda board + workspace + members + lists + cards + checklists +
 * comments (son N + toplam) + cardMembers + labels + attachment count
 * topla. Permission KONTROLÜ YOK — caller (14E route handler) yapar.
 *
 * Spec: `docs/process/08-faz-14-klasik-pdf-plani.md` §8.3 (4 sayfa kanonik
 * içerik) + `docs/architecture/16-raporlama-mimarisi.md` §16.18.4. Domain
 * kuralları: `docs/domain/09-raporlama-kurallari.md` §9.15.
 *
 * Tiptap JSON `cards.description` ve `comments.body` HAM olarak döner —
 * `entity-summary` pattern'i ile aynı (§9.13). PDF component (14C) plaintext'e
 * çevirir. 14A karar 1: tamamlandı = `cards.completed`. 14A karar 2: acil yok.
 * 14A karar 7: son 5 yorum + commentCount footer. 14A karar 12: arşivli kart/
 * liste filter dışı; boş pano route handler "Veri yok" sayfasını koşullu çizer.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull } from '@pusula/db';
import {
  attachments,
  boardMembers,
  boards,
  cardLabels,
  cardMembers,
  cards,
  checklistItems,
  checklists,
  comments,
  labels as labelsTable,
  lists,
  users,
  workspaces,
  type Database,
} from '@pusula/db';

/** 14A karar 7 — kart başına dönen yorum sayısı. */
export const CLASSIC_REPORT_COMMENTS_PER_CARD = 5;

export interface ClassicReportMember {
  userId: string;
  name: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  assignedCardCount: number;
}

export interface ClassicReportChecklistItem {
  id: string;
  content: string;
  completed: boolean;
  position: string;
}

export interface ClassicReportChecklist {
  id: string;
  title: string;
  position: string;
  items: ClassicReportChecklistItem[];
}

export interface ClassicReportComment {
  id: string;
  /** Tiptap JSON ham string (`comments.body`); component plaintext'e çevirir. */
  body: string;
  createdAt: string;
  /** `authorId IS NULL` olursa "Misafir" — bkz. `comments` `share_link_id` invariant. */
  author: { id: string | null; name: string | null };
}

export interface ClassicReportCard {
  id: string;
  title: string;
  /** Tiptap JSON ham string veya `null` — component plaintext'e çevirir. */
  description: string | null;
  position: string;
  /** 14A karar 1 — `cards.completed` doğrudan. */
  completed: boolean;
  completedAt: string | null;
  dueAt: string | null;
  members: Array<{ userId: string; name: string }>;
  labels: Array<{ id: string; name: string; color: string }>;
  checklists: ClassicReportChecklist[];
  /** 14A karar 7 — son `CLASSIC_REPORT_COMMENTS_PER_CARD` yorum. */
  comments: ClassicReportComment[];
  /** Toplam yorum sayısı — "ve M yorum daha" footer için. */
  commentCount: number;
  /** Yüklenmiş (committed) ek sayısı. */
  attachmentCount: number;
}

export interface ClassicReportList {
  id: string;
  title: string;
  position: string;
  color: string | null;
  cards: ClassicReportCard[];
}

export interface ClassicReportStats {
  totalCards: number;
  completedCards: number;
  openCards: number;
  /** `completedCards / totalCards * 100` yuvarlanmış. Toplam 0 → 0. */
  progressPercent: number;
}

export interface BoardReportData {
  board: {
    id: string;
    title: string;
    /** Tiptap JSON ham string veya `null`. */
    description: string | null;
    icon: string;
    createdAt: string;
    archivedAt: string | null;
  };
  workspace: { id: string; name: string };
  members: ClassicReportMember[];
  lists: ClassicReportList[];
  stats: ClassicReportStats;
  /** Service çağrı anı (ISO timestamp). */
  generatedAt: string;
}

/**
 * 14A karar 12 — Pano bulunamazsa `null` döner (route handler 404 yapar).
 * Arşivli pano yine render edilir; arşivli liste/kart filter dışı.
 */
export async function loadBoardForClassicReport(
  db: Database,
  boardId: string,
): Promise<BoardReportData | null> {
  const [boardRow] = await db
    .select({
      boardId: boards.id,
      boardTitle: boards.title,
      boardIcon: boards.icon,
      boardArchivedAt: boards.archivedAt,
      boardCreatedAt: boards.createdAt,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
    })
    .from(boards)
    .innerJoin(workspaces, eq(boards.workspaceId, workspaces.id))
    .where(eq(boards.id, boardId))
    .limit(1);

  if (!boardRow) return null;

  const memberRowsPromise = db
    .select({
      userId: boardMembers.userId,
      name: users.name,
      email: users.email,
      role: boardMembers.role,
    })
    .from(boardMembers)
    .innerJoin(users, eq(boardMembers.userId, users.id))
    .where(eq(boardMembers.boardId, boardId));

  const listRowsPromise = db
    .select({
      id: lists.id,
      title: lists.title,
      position: lists.position,
      color: lists.color,
    })
    .from(lists)
    .where(and(eq(lists.boardId, boardId), isNull(lists.archivedAt)))
    .orderBy(asc(lists.position));

  const [memberRows, listRows] = await Promise.all([memberRowsPromise, listRowsPromise]);

  const listIds = listRows.map((l) => l.id);
  const cardRows = listIds.length
    ? await db
        .select({
          id: cards.id,
          listId: cards.listId,
          title: cards.title,
          description: cards.description,
          position: cards.position,
          completed: cards.completed,
          completedAt: cards.completedAt,
          dueAt: cards.dueAt,
        })
        .from(cards)
        .where(and(inArray(cards.listId, listIds), isNull(cards.archivedAt)))
        .orderBy(asc(cards.listId), asc(cards.position))
    : [];

  const cardIds = cardRows.map((c) => c.id);

  // Paralel: cardId-bazlı tüm sorgular.
  const [
    cardMemberRows,
    cardLabelRows,
    checklistRows,
    commentRows,
    attachmentCountRows,
  ] = cardIds.length
    ? await Promise.all([
        db
          .select({
            cardId: cardMembers.cardId,
            userId: cardMembers.userId,
            name: users.name,
            role: cardMembers.role,
          })
          .from(cardMembers)
          .innerJoin(users, eq(cardMembers.userId, users.id))
          .where(inArray(cardMembers.cardId, cardIds)),
        db
          .select({
            cardId: cardLabels.cardId,
            id: labelsTable.id,
            name: labelsTable.name,
            color: labelsTable.color,
          })
          .from(cardLabels)
          .innerJoin(labelsTable, eq(cardLabels.labelId, labelsTable.id))
          .where(inArray(cardLabels.cardId, cardIds)),
        db
          .select({
            checklistId: checklists.id,
            cardId: checklists.cardId,
            title: checklists.title,
            position: checklists.position,
            itemId: checklistItems.id,
            itemContent: checklistItems.content,
            itemCompleted: checklistItems.completed,
            itemPosition: checklistItems.position,
          })
          .from(checklists)
          .leftJoin(checklistItems, eq(checklistItems.checklistId, checklists.id))
          .where(inArray(checklists.cardId, cardIds))
          .orderBy(asc(checklists.cardId), asc(checklists.position), asc(checklistItems.position)),
        db
          .select({
            id: comments.id,
            cardId: comments.cardId,
            body: comments.body,
            createdAt: comments.createdAt,
            deletedAt: comments.deletedAt,
            authorId: users.id,
            authorName: users.name,
          })
          .from(comments)
          .leftJoin(users, eq(comments.authorId, users.id))
          .where(and(inArray(comments.cardId, cardIds), isNull(comments.deletedAt)))
          .orderBy(asc(comments.cardId), desc(comments.createdAt)),
        db
          .select({
            cardId: attachments.cardId,
            count: attachments.id,
          })
          .from(attachments)
          .where(and(inArray(attachments.cardId, cardIds), isNotNull(attachments.committedAt))),
      ])
    : [[], [], [], [], []];

  // Yorum grup-başına son N + total count
  const commentsByCard = new Map<
    string,
    { kept: ClassicReportComment[]; total: number }
  >();
  for (const row of commentRows) {
    const bucket = commentsByCard.get(row.cardId) ?? { kept: [], total: 0 };
    bucket.total += 1;
    if (bucket.kept.length < CLASSIC_REPORT_COMMENTS_PER_CARD) {
      bucket.kept.push({
        id: row.id,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        author: { id: row.authorId, name: row.authorName },
      });
    }
    commentsByCard.set(row.cardId, bucket);
  }

  // Attachment sayımı (TS-side grup)
  const attachmentCountByCard = new Map<string, number>();
  for (const row of attachmentCountRows) {
    attachmentCountByCard.set(row.cardId, (attachmentCountByCard.get(row.cardId) ?? 0) + 1);
  }

  // CardMembers TS-side grup
  const membersByCard = new Map<string, Array<{ userId: string; name: string }>>();
  for (const row of cardMemberRows) {
    if (row.role !== 'assignee') continue;
    const list = membersByCard.get(row.cardId) ?? [];
    if (!list.some((m) => m.userId === row.userId)) {
      list.push({ userId: row.userId, name: row.name });
    }
    membersByCard.set(row.cardId, list);
  }

  // CardLabels TS-side grup
  const labelsByCard = new Map<string, Array<{ id: string; name: string; color: string }>>();
  for (const row of cardLabelRows) {
    const list = labelsByCard.get(row.cardId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    labelsByCard.set(row.cardId, list);
  }

  // Checklists TS-side grup (her checklist için items array'i topla)
  const checklistsByCard = new Map<string, Map<string, ClassicReportChecklist>>();
  for (const row of checklistRows) {
    const cardBucket = checklistsByCard.get(row.cardId) ?? new Map();
    let checklist = cardBucket.get(row.checklistId);
    if (!checklist) {
      checklist = {
        id: row.checklistId,
        title: row.title,
        position: row.position,
        items: [],
      };
      cardBucket.set(row.checklistId, checklist);
    }
    if (row.itemId) {
      checklist.items.push({
        id: row.itemId,
        content: row.itemContent ?? '',
        completed: row.itemCompleted ?? false,
        position: row.itemPosition ?? '',
      });
    }
    checklistsByCard.set(row.cardId, cardBucket);
  }

  // Üye başı atanmış kart sayımı (kapakta üye metriği için)
  const assignedCountByUser = new Map<string, number>();
  for (const row of cardMemberRows) {
    if (row.role !== 'assignee') continue;
    assignedCountByUser.set(row.userId, (assignedCountByUser.get(row.userId) ?? 0) + 1);
  }

  // Cards by list
  const cardsByList = new Map<string, ClassicReportCard[]>();
  for (const row of cardRows) {
    const bucket = cardsByList.get(row.listId) ?? [];
    const commentBucket = commentsByCard.get(row.id) ?? { kept: [], total: 0 };
    const checklistBucket = checklistsByCard.get(row.id);
    bucket.push({
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      position: row.position,
      completed: row.completed,
      completedAt: row.completedAt?.toISOString() ?? null,
      dueAt: row.dueAt?.toISOString() ?? null,
      members: membersByCard.get(row.id) ?? [],
      labels: labelsByCard.get(row.id) ?? [],
      checklists: checklistBucket
        ? Array.from(checklistBucket.values()).sort((a, b) => a.position.localeCompare(b.position))
        : [],
      comments: commentBucket.kept,
      commentCount: commentBucket.total,
      attachmentCount: attachmentCountByCard.get(row.id) ?? 0,
    });
    cardsByList.set(row.listId, bucket);
  }

  // Final lists shape
  const reportLists: ClassicReportList[] = listRows.map((l) => ({
    id: l.id,
    title: l.title,
    position: l.position,
    color: l.color,
    cards: cardsByList.get(l.id) ?? [],
  }));

  // Members shape (workspace member + atanmış kart sayımı)
  const reportMembers: ClassicReportMember[] = memberRows.map((m) => ({
    userId: m.userId,
    name: m.name,
    email: m.email,
    role: m.role,
    assignedCardCount: assignedCountByUser.get(m.userId) ?? 0,
  }));

  // Stats — 14A karar 1/2/12
  const allCards = reportLists.flatMap((l) => l.cards);
  const totalCards = allCards.length;
  const completedCards = allCards.reduce((acc, c) => (c.completed ? acc + 1 : acc), 0);
  const openCards = totalCards - completedCards;
  const progressPercent = totalCards === 0 ? 0 : Math.round((completedCards / totalCards) * 100);

  return {
    board: {
      id: boardRow.boardId,
      title: boardRow.boardTitle,
      // `boards.description` schema'da yok; eski Pusula'da pano detay alanı
      // kullanmamış. Faz 14 PDF'i pano açıklaması göstermez (4 sayfa kanonik
      // içerikte yok); `null` döner ileride alan eklenirse genişletilir.
      description: null,
      icon: boardRow.boardIcon,
      createdAt: boardRow.boardCreatedAt.toISOString(),
      archivedAt: boardRow.boardArchivedAt?.toISOString() ?? null,
    },
    workspace: {
      id: boardRow.workspaceId,
      name: boardRow.workspaceName,
    },
    members: reportMembers,
    lists: reportLists,
    stats: { totalCards, completedCards, openCards, progressPercent },
    generatedAt: new Date().toISOString(),
  };
}
