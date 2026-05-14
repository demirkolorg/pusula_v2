import {
  and,
  boards,
  boardMembers,
  cards,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  searchDocuments,
  sql,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import {
  buildSearchTsQueryText,
  normalizedSearchQuery,
  searchTermGroups,
} from '@pusula/db/search-indexer';
import { searchQueryInput, type SearchResult } from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import type { SQL } from 'drizzle-orm';
import { resolveBoardAccess } from '../middleware/board-access';
import { protectedProcedure, router } from '../trpc';

interface SearchRow {
  id: string;
  entityType: SearchResult['entityType'];
  entityId: string;
  workspaceId: string;
  workspaceTitle: string;
  boardId: string | null;
  boardTitle: string | null;
  cardId: string | null;
  cardTitle: string | null;
  title: string;
  body: string | null;
  labels: string[];
  rank: number;
  updatedAt: Date;
}

function pathPart(value: string): string {
  return encodeURIComponent(value);
}

function targetUrlFor(row: Pick<SearchRow, 'workspaceId' | 'boardId' | 'cardId'>): string {
  if (!row.boardId) return `/workspaces/${pathPart(row.workspaceId)}`;
  const boardUrl = `/workspaces/${pathPart(row.workspaceId)}/boards/${pathPart(row.boardId)}`;
  return row.cardId ? `${boardUrl}?card=${pathPart(row.cardId)}` : boardUrl;
}

function normalizePlainText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function queryNeedles(query: string): string[] {
  return query
    .toLocaleLowerCase('tr')
    .split(/[^\p{L}\p{N}]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildSnippet(row: Pick<SearchRow, 'title' | 'body' | 'labels'>, query: string): string {
  const labels = normalizePlainText(row.labels.join(' '));
  const title = normalizePlainText(row.title);
  const body = normalizePlainText(row.body);
  const needles = queryNeedles(query);
  const candidates = [body, labels, title].filter(Boolean);
  const source =
    candidates.find((candidate) => {
      const lower = candidate.toLocaleLowerCase('tr');
      return needles.some((needle) => lower.includes(needle));
    }) ??
    body ??
    labels ??
    title;

  if (source.length <= 180) return source;
  const lower = source.toLocaleLowerCase('tr');
  const matchIndex = Math.max(0, needles.map((needle) => lower.indexOf(needle)).find((idx) => idx >= 0) ?? 0);
  const start = Math.max(0, matchIndex - 70);
  const end = Math.min(source.length, start + 180);
  return `${start > 0 ? '...' : ''}${source.slice(start, end)}${end < source.length ? '...' : ''}`;
}

function parseCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const offset = Number.parseInt(cursor, 10);
  if (!Number.isFinite(offset) || offset < 0 || String(offset) !== cursor) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Geçersiz arama cursor değeri.' });
  }
  return offset;
}

const SQL_FOLD_FROM = 'ÇĞİIÖŞÜÂÎÛçğıöşüâîû';
const SQL_FOLD_TO = 'CGIIOSUAIUcgiosuaiu';
const FUZZY_MIN_TERM_LENGTH = 4;
const FUZZY_WORD_THRESHOLD = 0.6;

function normalizedDocumentTextSql(): SQL<string> {
  return sql<string>`lower(translate(concat_ws(' ', ${searchDocuments.title}, coalesce(${searchDocuments.body}, ''), array_to_string(${searchDocuments.labels}, ' ')), ${SQL_FOLD_FROM}, ${SQL_FOLD_TO}))`;
}

function termMatchClause(haystack: SQL<string>, terms: readonly string[]): SQL {
  const likeClauses = terms.map((term) => sql`${haystack} like ${`%${term}%`}`);
  const fuzzyClauses = terms
    .filter((term) => term.length >= FUZZY_MIN_TERM_LENGTH)
    .map((term) => sql`word_similarity(${term}, ${haystack}) >= ${FUZZY_WORD_THRESHOLD}`);
  return or(...likeClauses, ...fuzzyClauses) ?? sql`false`;
}

function normalizedMatchClause(haystack: SQL<string>, groups: readonly string[][]): SQL {
  const clauses = groups.map((group) => termMatchClause(haystack, group));
  return and(...clauses) ?? sql`false`;
}

function fuzzyScoreSql(haystack: SQL<string>, groups: readonly string[][]): SQL<number> {
  const terms = groups.flat().filter((term) => term.length >= FUZZY_MIN_TERM_LENGTH);
  if (terms.length === 0) return sql<number>`0`;
  return sql<number>`greatest(${sql.join(
    terms.map((term) => sql`word_similarity(${term}, ${haystack})`),
    sql`, `,
  )})`;
}

export const searchRouter = router({
  query: protectedProcedure.input(searchQueryInput).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const offset = parseCursor(input.cursor);
    const tsQueryText = buildSearchTsQueryText(input.query);
    const termGroups = searchTermGroups(input.query);
    const normalizedQuery = normalizedSearchQuery(input.query);

    if (input.boardId) {
      const board = await resolveBoardAccess(ctx.db, input.boardId, userId);
      if (input.workspaceId && board.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Board bu workspace altında değil.' });
      }
    } else if (input.workspaceId) {
      const [workspace] = await ctx.db
        .select({ id: workspaces.id, archivedAt: workspaces.archivedAt, role: workspaceMembers.role })
        .from(workspaces)
        .leftJoin(
          workspaceMembers,
          and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, userId)),
        )
        .where(eq(workspaces.id, input.workspaceId))
        .limit(1);
      if (!workspace || workspace.archivedAt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace bulunamadı.' });
      }
      if (!workspace.role) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Bu workspace üyesi değilsiniz.' });
      }
    }

    if (!tsQueryText || termGroups.length === 0 || !normalizedQuery) {
      return { items: [], nextCursor: null };
    }

    const tsQuery = sql`to_tsquery('simple', ${tsQueryText})`;
    const normalizedDocumentText = normalizedDocumentTextSql();
    const vectorMatch = sql`${searchDocuments.searchVector} @@ ${tsQuery}`;
    const normalizedMatch = normalizedMatchClause(normalizedDocumentText, termGroups);
    const rank = sql<number>`(
      ts_rank_cd(${searchDocuments.searchVector}, ${tsQuery}) +
      case when ${normalizedMatch} then 0.2 else 0 end +
      (${fuzzyScoreSql(normalizedDocumentText, termGroups)} * 0.1)
    )`;
    const clauses = [
      or(vectorMatch, normalizedMatch) ?? sql`false`,
      isNull(workspaces.archivedAt),
      isNotNull(workspaceMembers.userId),
      or(inArray(workspaceMembers.role, ['owner', 'admin', 'member']), isNotNull(boardMembers.userId)),
    ];
    if (input.workspaceId) clauses.push(eq(searchDocuments.workspaceId, input.workspaceId));
    if (input.boardId) clauses.push(eq(searchDocuments.boardId, input.boardId));
    if (input.entityTypes) clauses.push(inArray(searchDocuments.entityType, input.entityTypes));
    if (!input.includeArchived) clauses.push(isNull(searchDocuments.archivedAt));

    const rows = await ctx.db
      .select({
        id: searchDocuments.id,
        entityType: searchDocuments.entityType,
        entityId: searchDocuments.entityId,
        workspaceId: searchDocuments.workspaceId,
        workspaceTitle: workspaces.name,
        boardId: searchDocuments.boardId,
        boardTitle: boards.title,
        cardId: searchDocuments.cardId,
        cardTitle: cards.title,
        title: searchDocuments.title,
        body: searchDocuments.body,
        labels: searchDocuments.labels,
        rank,
        updatedAt: searchDocuments.updatedAt,
      })
      .from(searchDocuments)
      .innerJoin(workspaces, eq(workspaces.id, searchDocuments.workspaceId))
      .leftJoin(boards, eq(boards.id, searchDocuments.boardId))
      .leftJoin(cards, eq(cards.id, searchDocuments.cardId))
      .leftJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, searchDocuments.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .leftJoin(
        boardMembers,
        and(eq(boardMembers.boardId, searchDocuments.boardId), eq(boardMembers.userId, userId)),
      )
      .where(and(...clauses))
      .orderBy(sql`${rank} DESC`, desc(searchDocuments.updatedAt), desc(searchDocuments.id))
      .limit(input.limit + 1)
      .offset(offset);

    const pageRows = rows.slice(0, input.limit) as SearchRow[];
    const items: SearchResult[] = pageRows.map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      workspaceId: row.workspaceId,
      workspaceTitle: row.workspaceTitle,
      boardId: row.boardId,
      boardTitle: row.boardTitle,
      cardId: row.cardId,
      cardTitle: row.cardTitle,
      title: row.title,
      snippet: buildSnippet(row, input.query),
      rank: Number(row.rank) || 0,
      targetUrl: targetUrlFor(row),
      updatedAt: row.updatedAt,
    }));

    return {
      items,
      nextCursor: rows.length > input.limit ? String(offset + input.limit) : null,
    };
  }),
});
