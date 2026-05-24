/**
 * `entity-summary` micro-report — kart/liste/pano/workspace temel meta.
 * Tek tek entity için "kapsam başlığı + açıklama (Tiptap JSON full) +
 * üyeler + etiketler + alt sayım" döner. Scope: C/L/B/W. Spec §9.13'e
 * göre Tiptap JSON OLDUĞU GIBİ döner (UI Tiptap EditorContent ile render).
 */
import { and, count, eq, isNull } from '@pusula/db';
import {
  boards,
  cardLabels,
  cardMembers,
  cards,
  labels,
  lists,
  workspaces,
} from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard } from './helpers';

export interface EntitySummaryData {
  kind: 'card' | 'list' | 'board' | 'workspace';
  id: string;
  title: string;
  description: unknown | null;
  archivedAt: string | null;
  counts: {
    cards?: number;
    lists?: number;
    boards?: number;
    members?: number;
    labels?: number;
  };
  members?: Array<{ userId: string; role: string }>;
}

export const entitySummaryAdapter: ScopeAdapter<EntitySummaryData> = {
  async card(ctx, scope) {
    const db = asDb(ctx);
    const [row] = await db
      .select({
        id: cards.id,
        title: cards.title,
        description: cards.description,
        archivedAt: cards.archivedAt,
      })
      .from(cards)
      .where(eq(cards.id, scope.cardId))
      .limit(1);
    if (!row) {
      throw new Error(`entity-summary: card ${scope.cardId} bulunamadı`);
    }
    const memberRows = await db
      .select({ userId: cardMembers.userId, role: cardMembers.role })
      .from(cardMembers)
      .where(eq(cardMembers.cardId, scope.cardId));
    const labelCountRows = await db
      .select({ count: count() })
      .from(cardLabels)
      .where(eq(cardLabels.cardId, scope.cardId));
    const labelCount = labelCountRows[0]?.count ?? 0;
    return {
      kind: 'card',
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      counts: { members: memberRows.length, labels: Number(labelCount ?? 0) },
      members: memberRows,
    };
  },

  async list(ctx, scope) {
    const db = asDb(ctx);
    const [row] = await db
      .select({
        id: lists.id,
        title: lists.title,
        archivedAt: lists.archivedAt,
      })
      .from(lists)
      .where(eq(lists.id, scope.listId))
      .limit(1);
    if (!row) throw new Error(`entity-summary: list ${scope.listId} bulunamadı`);
    const cardCountRows = await db
      .select({ count: count() })
      .from(cards)
      .where(and(eq(cards.listId, scope.listId), isNull(cards.archivedAt)));
    const cardCount = cardCountRows[0]?.count ?? 0;
    return {
      kind: 'list',
      id: row.id,
      title: row.title,
      description: null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      counts: { cards: Number(cardCount ?? 0) },
    };
  },

  async board(ctx, scope) {
    const db = asDb(ctx);
    const [row] = await db
      .select({
        id: boards.id,
        title: boards.title,
        archivedAt: boards.archivedAt,
      })
      .from(boards)
      .where(eq(boards.id, scope.boardId))
      .limit(1);
    if (!row) throw new Error(`entity-summary: board ${scope.boardId} bulunamadı`);
    const listCountRows = await db
      .select({ count: count() })
      .from(lists)
      .where(eq(lists.boardId, scope.boardId));
    const listCount = listCountRows[0]?.count ?? 0;
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    const labelCountRows = await db
      .select({ count: count() })
      .from(labels)
      .where(eq(labels.boardId, scope.boardId));
    const labelCount = labelCountRows[0]?.count ?? 0;
    return {
      kind: 'board',
      id: row.id,
      title: row.title,
      description: null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      counts: {
        lists: Number(listCount ?? 0),
        cards: cardIds.length,
        labels: Number(labelCount ?? 0),
      },
    };
  },

  async workspace(ctx, scope) {
    const db = asDb(ctx);
    const [row] = await db
      .select({
        id: workspaces.id,
        title: workspaces.name,
        archivedAt: workspaces.archivedAt,
      })
      .from(workspaces)
      .where(eq(workspaces.id, scope.workspaceId))
      .limit(1);
    if (!row) {
      throw new Error(`entity-summary: workspace ${scope.workspaceId} bulunamadı`);
    }
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    return {
      kind: 'workspace',
      id: row.id,
      title: row.title,
      description: null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      counts: { boards: accessibleBoardIds.length },
    };
  },
};
