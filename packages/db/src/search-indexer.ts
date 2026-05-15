import { and, asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { SearchEntityType } from '@pusula/domain';
import type { Database } from './client';
import { boards, cardLabels, cards, comments, labels, lists, searchDocuments } from './schema';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type SearchIndexerDb = Database | Tx;

export interface SearchDocumentRef {
  entityType: SearchEntityType;
  entityId: string;
}

export interface ResolvedSearchDocument extends SearchDocumentRef {
  workspaceId: string;
  boardId: string | null;
  cardId: string | null;
  title: string;
  body: string | null;
  labels: string[];
  archivedAt: Date | null;
  updatedAt: Date;
}

export interface ReindexSearchDocumentsInput {
  workspaceId?: string;
  boardId?: string;
  entityTypes?: SearchEntityType[];
  limit?: number;
  cursor?: string;
}

export interface ReindexSearchDocumentsResult {
  scanned: number;
  upserted: number;
  deleted: number;
  nextCursor: string | null;
}

export function normalizeSearchText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeSearchLabels(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeSearchText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

const FOLD_FROM = 'ÇĞİIÖŞÜÂÎÛçğıöşüâîû';
const FOLD_TO = 'CGIIOSUAIUcgiosuaiu';
const SEARCH_TOKEN_RE = /[a-z0-9]+/g;
const TURKISH_SUFFIXES = [
  'larindan',
  'lerinden',
  'larinin',
  'lerinin',
  'larla',
  'lerle',
  'lardan',
  'lerden',
  'larin',
  'lerin',
  'lari',
  'leri',
  'lara',
  'lere',
  'dan',
  'den',
  'tan',
  'ten',
  'nin',
  'nun',
  'lar',
  'ler',
  'ini',
  'inu',
  'unu',
  'ye',
  'ya',
  'de',
  'da',
  'te',
  'ta',
  'i',
  'u',
] as const;

function uniq(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function foldSearchText(value: string | null | undefined): string {
  const normalized = normalizeSearchText(value);
  if (!normalized) return '';

  let folded = normalized;
  for (let i = 0; i < FOLD_FROM.length; i++) {
    folded = folded.replaceAll(FOLD_FROM[i]!, FOLD_TO[i]!);
  }

  return folded
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenRootVariants(token: string): string[] {
  const variants = [token];
  for (const suffix of TURKISH_SUFFIXES) {
    if (token.length <= suffix.length + 2 || !token.endsWith(suffix)) continue;
    variants.push(token.slice(0, -suffix.length));
  }
  return uniq(variants);
}

export function searchTermGroups(value: string): string[][] {
  const folded = foldSearchText(value);
  const tokens = folded.match(SEARCH_TOKEN_RE) ?? [];
  return tokens.map(tokenRootVariants).filter((group) => group.length > 0);
}

export function normalizedSearchQuery(value: string): string {
  return searchTermGroups(value)
    .map((group) => group[0])
    .filter(Boolean)
    .join(' ');
}

export function buildSearchTsQueryText(value: string): string | null {
  const groups = searchTermGroups(value);
  if (groups.length === 0) return null;
  return groups
    .map((group) => {
      const terms = group.map((term) => `${term}:*`);
      return terms.length === 1 ? terms[0] : `(${terms.join(' | ')})`;
    })
    .join(' & ');
}

export function buildSearchableText(value: string | null | undefined): string {
  const original = normalizeSearchText(value);
  if (!original) return '';

  const folded = foldSearchText(original);
  const variants = searchTermGroups(original).flat();
  return uniq([original, folded, ...variants]).join(' ');
}

export function buildSearchVectorSql(input: {
  title: string | null | undefined;
  body?: string | null | undefined;
  labels?: readonly (string | null | undefined)[];
}): SQL {
  const title = normalizeSearchText(input.title) ?? '';
  const body = normalizeSearchText(input.body) ?? '';
  const labelText = normalizeSearchLabels(input.labels ?? []).join(' ');
  const searchableTitle = buildSearchableText(title);
  const searchableBody = buildSearchableText(body);
  const searchableLabels = buildSearchableText(labelText);

  return sql`
    setweight(to_tsvector('simple', ${searchableTitle}), 'A') ||
    setweight(to_tsvector('simple', ${searchableLabels}), 'B') ||
    setweight(to_tsvector('simple', ${searchableBody}), 'C')
  `;
}

function firstDate(...values: Array<Date | null | undefined>): Date | null {
  return values.find((value): value is Date => value instanceof Date) ?? null;
}

function refKey(ref: SearchDocumentRef): string {
  return `${ref.entityType}:${ref.entityId}`;
}

function scopeAllows(
  entityTypes: readonly SearchEntityType[] | undefined,
  entityType: SearchEntityType,
): boolean {
  return !entityTypes || entityTypes.includes(entityType);
}

function toInsertValues(payload: ResolvedSearchDocument) {
  const title = normalizeSearchText(payload.title) ?? '';
  const body = normalizeSearchText(payload.body);
  const labelValues = normalizeSearchLabels(payload.labels);

  return {
    workspaceId: payload.workspaceId,
    boardId: payload.boardId,
    cardId: payload.cardId,
    entityType: payload.entityType,
    entityId: payload.entityId,
    title,
    body,
    labels: labelValues,
    searchVector: buildSearchVectorSql({ title, body, labels: labelValues }),
    archivedAt: payload.archivedAt,
    updatedAt: payload.updatedAt,
  };
}

export async function deleteSearchDocument(
  tx: SearchIndexerDb,
  ref: SearchDocumentRef,
): Promise<{ deleted: number }> {
  const rows = await tx
    .delete(searchDocuments)
    .where(
      and(
        eq(searchDocuments.entityType, ref.entityType),
        eq(searchDocuments.entityId, ref.entityId),
      ),
    )
    .returning({ id: searchDocuments.id });
  return { deleted: rows.length };
}

export async function upsertSearchDocument(
  tx: SearchIndexerDb,
  ref: SearchDocumentRef,
): Promise<{ action: 'upserted' | 'deleted' | 'missing'; id?: string }> {
  const payload = await resolveSearchDocumentPayload(tx, ref);
  if (!payload) {
    const deleted = await deleteSearchDocument(tx, ref);
    return deleted.deleted > 0 ? { action: 'deleted' } : { action: 'missing' };
  }

  const values = toInsertValues(payload);
  const [row] = await tx
    .insert(searchDocuments)
    .values(values)
    .onConflictDoUpdate({
      target: [searchDocuments.entityType, searchDocuments.entityId],
      set: {
        workspaceId: values.workspaceId,
        boardId: values.boardId,
        cardId: values.cardId,
        title: values.title,
        body: values.body,
        labels: values.labels,
        searchVector: values.searchVector,
        archivedAt: values.archivedAt,
        updatedAt: values.updatedAt,
      },
    })
    .returning({ id: searchDocuments.id });

  if (!row) throw new Error('search_documents upsert returned no row');
  return { action: 'upserted', id: row.id };
}

export async function resolveSearchDocumentPayload(
  tx: SearchIndexerDb,
  ref: SearchDocumentRef,
): Promise<ResolvedSearchDocument | null> {
  switch (ref.entityType) {
    case 'board':
      return resolveBoardPayload(tx, ref.entityId);
    case 'list':
      return resolveListPayload(tx, ref.entityId);
    case 'card':
      return resolveCardPayload(tx, ref.entityId);
    case 'comment':
      return resolveCommentPayload(tx, ref.entityId);
    case 'label':
      return resolveLabelPayload(tx, ref.entityId);
  }
}

async function resolveBoardPayload(
  tx: SearchIndexerDb,
  boardId: string,
): Promise<ResolvedSearchDocument | null> {
  const [row] = await tx
    .select({
      id: boards.id,
      workspaceId: boards.workspaceId,
      title: boards.title,
      archivedAt: boards.archivedAt,
      updatedAt: boards.updatedAt,
    })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);
  if (!row) return null;
  return {
    entityType: 'board',
    entityId: row.id,
    workspaceId: row.workspaceId,
    boardId: row.id,
    cardId: null,
    title: row.title,
    body: null,
    labels: [],
    archivedAt: row.archivedAt,
    updatedAt: row.updatedAt,
  };
}

async function resolveListPayload(
  tx: SearchIndexerDb,
  listId: string,
): Promise<ResolvedSearchDocument | null> {
  const [row] = await tx
    .select({
      id: lists.id,
      boardId: lists.boardId,
      title: lists.title,
      listArchivedAt: lists.archivedAt,
      updatedAt: lists.updatedAt,
      workspaceId: boards.workspaceId,
      boardArchivedAt: boards.archivedAt,
    })
    .from(lists)
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(eq(lists.id, listId))
    .limit(1);
  if (!row) return null;
  return {
    entityType: 'list',
    entityId: row.id,
    workspaceId: row.workspaceId,
    boardId: row.boardId,
    cardId: null,
    title: row.title,
    body: null,
    labels: [],
    archivedAt: firstDate(row.listArchivedAt, row.boardArchivedAt),
    updatedAt: row.updatedAt,
  };
}

async function resolveCardPayload(
  tx: SearchIndexerDb,
  cardId: string,
): Promise<ResolvedSearchDocument | null> {
  const [row] = await tx
    .select({
      id: cards.id,
      boardId: cards.boardId,
      title: cards.title,
      description: cards.description,
      cardArchivedAt: cards.archivedAt,
      updatedAt: cards.updatedAt,
      listArchivedAt: lists.archivedAt,
      workspaceId: boards.workspaceId,
      boardArchivedAt: boards.archivedAt,
    })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, cards.boardId))
    .where(eq(cards.id, cardId))
    .limit(1);
  if (!row) return null;

  const labelRows = await tx
    .select({ name: labels.name })
    .from(cardLabels)
    .innerJoin(labels, eq(labels.id, cardLabels.labelId))
    .where(eq(cardLabels.cardId, row.id))
    .orderBy(asc(labels.name), asc(labels.color));

  return {
    entityType: 'card',
    entityId: row.id,
    workspaceId: row.workspaceId,
    boardId: row.boardId,
    cardId: row.id,
    title: row.title,
    body: row.description,
    labels: normalizeSearchLabels(labelRows.map((label) => label.name)),
    archivedAt: firstDate(row.cardArchivedAt, row.listArchivedAt, row.boardArchivedAt),
    updatedAt: row.updatedAt,
  };
}

async function resolveCommentPayload(
  tx: SearchIndexerDb,
  commentId: string,
): Promise<ResolvedSearchDocument | null> {
  const [row] = await tx
    .select({
      id: comments.id,
      body: comments.body,
      deletedAt: comments.deletedAt,
      updatedAt: comments.updatedAt,
      cardId: cards.id,
      cardTitle: cards.title,
      cardArchivedAt: cards.archivedAt,
      boardId: cards.boardId,
      listArchivedAt: lists.archivedAt,
      workspaceId: boards.workspaceId,
      boardArchivedAt: boards.archivedAt,
    })
    .from(comments)
    .innerJoin(cards, eq(cards.id, comments.cardId))
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, cards.boardId))
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!row || row.deletedAt) return null;
  return {
    entityType: 'comment',
    entityId: row.id,
    workspaceId: row.workspaceId,
    boardId: row.boardId,
    cardId: row.cardId,
    title: row.cardTitle,
    body: row.body,
    labels: [],
    archivedAt: firstDate(row.cardArchivedAt, row.listArchivedAt, row.boardArchivedAt),
    updatedAt: row.updatedAt,
  };
}

async function resolveLabelPayload(
  tx: SearchIndexerDb,
  labelId: string,
): Promise<ResolvedSearchDocument | null> {
  const [row] = await tx
    .select({
      id: labels.id,
      boardId: labels.boardId,
      name: labels.name,
      color: labels.color,
      updatedAt: labels.updatedAt,
      workspaceId: boards.workspaceId,
      boardArchivedAt: boards.archivedAt,
    })
    .from(labels)
    .innerJoin(boards, eq(boards.id, labels.boardId))
    .where(eq(labels.id, labelId))
    .limit(1);
  if (!row) return null;
  return {
    entityType: 'label',
    entityId: row.id,
    workspaceId: row.workspaceId,
    boardId: row.boardId,
    cardId: null,
    title: normalizeSearchText(row.name) ?? row.color,
    body: null,
    labels: normalizeSearchLabels([row.name]),
    archivedAt: row.boardArchivedAt,
    updatedAt: row.updatedAt,
  };
}

export async function reindexSearchDocuments(
  db: SearchIndexerDb,
  input: ReindexSearchDocumentsInput,
): Promise<ReindexSearchDocumentsResult> {
  const limit = Math.max(1, Math.min(input.limit ?? 500, 5_000));
  const refs = await collectSearchDocumentRefs(db, input);
  const sortedRefs = refs.sort((a, b) => refKey(a).localeCompare(refKey(b)));
  const afterCursor = input.cursor
    ? sortedRefs.filter((ref) => refKey(ref) > input.cursor!)
    : sortedRefs;
  const page = afterCursor.slice(0, limit);
  const nextCursor = afterCursor.length > page.length ? refKey(page[page.length - 1]!) : null;
  const currentKeys = new Set(refs.map(refKey));

  let upserted = 0;
  let deleted = 0;
  for (const ref of page) {
    const result = await upsertSearchDocument(db, ref);
    if (result.action === 'upserted') upserted++;
    if (result.action === 'deleted') deleted++;
  }

  if (!input.cursor) {
    deleted += await deleteStaleSearchDocuments(db, input, currentKeys);
  }

  return { scanned: page.length, upserted, deleted, nextCursor };
}

export async function syncSearchDocumentsForScope(
  db: SearchIndexerDb,
  input: Omit<ReindexSearchDocumentsInput, 'cursor' | 'limit'>,
): Promise<ReindexSearchDocumentsResult> {
  const refs = await collectSearchDocumentRefs(db, input);
  const currentKeys = new Set(refs.map(refKey));

  let upserted = 0;
  let deleted = 0;
  for (const ref of refs.sort((a, b) => refKey(a).localeCompare(refKey(b)))) {
    const result = await upsertSearchDocument(db, ref);
    if (result.action === 'upserted') upserted++;
    if (result.action === 'deleted') deleted++;
  }

  deleted += await deleteStaleSearchDocuments(db, input, currentKeys);

  return { scanned: refs.length, upserted, deleted, nextCursor: null };
}

export async function syncSearchDocumentsForCard(
  db: SearchIndexerDb,
  cardId: string,
): Promise<ReindexSearchDocumentsResult> {
  const [card] = await db.select({ id: cards.id }).from(cards).where(eq(cards.id, cardId)).limit(1);
  const refs: SearchDocumentRef[] = card ? [{ entityType: 'card', entityId: card.id }] : [];

  if (card) {
    const commentRows = await db
      .select({ id: comments.id })
      .from(comments)
      .where(and(eq(comments.cardId, cardId), isNull(comments.deletedAt)));
    for (const row of commentRows) refs.push({ entityType: 'comment', entityId: row.id });
  }

  const currentKeys = new Set(refs.map(refKey));
  let upserted = 0;
  let deleted = 0;
  for (const ref of refs) {
    const result = await upsertSearchDocument(db, ref);
    if (result.action === 'upserted') upserted++;
    if (result.action === 'deleted') deleted++;
  }

  const existing = await db
    .select({ entityType: searchDocuments.entityType, entityId: searchDocuments.entityId })
    .from(searchDocuments)
    .where(
      and(
        eq(searchDocuments.cardId, cardId),
        inArray(searchDocuments.entityType, ['card', 'comment']),
      ),
    );
  for (const row of existing) {
    if (currentKeys.has(refKey(row))) continue;
    deleted += (await deleteSearchDocument(db, row)).deleted;
  }

  return { scanned: refs.length, upserted, deleted, nextCursor: null };
}

async function boardIdsForScope(
  db: SearchIndexerDb,
  input: ReindexSearchDocumentsInput,
): Promise<string[]> {
  if (input.boardId) {
    const clauses = [eq(boards.id, input.boardId)];
    if (input.workspaceId) clauses.push(eq(boards.workspaceId, input.workspaceId));
    const rows = await db
      .select({ id: boards.id })
      .from(boards)
      .where(and(...clauses));
    return rows.map((row) => row.id);
  }
  if (input.workspaceId) {
    const rows = await db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.workspaceId, input.workspaceId));
    return rows.map((row) => row.id);
  }
  const rows = await db.select({ id: boards.id }).from(boards);
  return rows.map((row) => row.id);
}

async function collectSearchDocumentRefs(
  db: SearchIndexerDb,
  input: ReindexSearchDocumentsInput,
): Promise<SearchDocumentRef[]> {
  const boardIds = await boardIdsForScope(db, input);
  if (boardIds.length === 0) return [];

  const refs: SearchDocumentRef[] = [];
  const add = (ref: SearchDocumentRef) => {
    if (scopeAllows(input.entityTypes, ref.entityType)) refs.push(ref);
  };

  for (const boardId of boardIds) add({ entityType: 'board', entityId: boardId });

  if (scopeAllows(input.entityTypes, 'list')) {
    const rows = await db
      .select({ id: lists.id })
      .from(lists)
      .where(inArray(lists.boardId, boardIds));
    for (const row of rows) add({ entityType: 'list', entityId: row.id });
  }

  if (scopeAllows(input.entityTypes, 'card') || scopeAllows(input.entityTypes, 'comment')) {
    const cardRows = await db
      .select({ id: cards.id })
      .from(cards)
      .where(inArray(cards.boardId, boardIds));
    if (scopeAllows(input.entityTypes, 'card')) {
      for (const row of cardRows) add({ entityType: 'card', entityId: row.id });
    }
    if (scopeAllows(input.entityTypes, 'comment') && cardRows.length > 0) {
      const commentRows = await db
        .select({ id: comments.id })
        .from(comments)
        .where(
          and(
            inArray(
              comments.cardId,
              cardRows.map((row) => row.id),
            ),
            isNull(comments.deletedAt),
          ),
        );
      for (const row of commentRows) add({ entityType: 'comment', entityId: row.id });
    }
  }

  if (scopeAllows(input.entityTypes, 'label')) {
    const rows = await db
      .select({ id: labels.id })
      .from(labels)
      .where(inArray(labels.boardId, boardIds));
    for (const row of rows) add({ entityType: 'label', entityId: row.id });
  }

  return refs;
}

async function deleteStaleSearchDocuments(
  db: SearchIndexerDb,
  input: ReindexSearchDocumentsInput,
  currentKeys: ReadonlySet<string>,
): Promise<number> {
  const clauses = [];
  if (input.boardId) clauses.push(eq(searchDocuments.boardId, input.boardId));
  if (input.workspaceId) clauses.push(eq(searchDocuments.workspaceId, input.workspaceId));
  if (input.entityTypes && input.entityTypes.length > 0) {
    clauses.push(inArray(searchDocuments.entityType, input.entityTypes));
  }
  if (clauses.length === 0) return 0;

  const existing = await db
    .select({ entityType: searchDocuments.entityType, entityId: searchDocuments.entityId })
    .from(searchDocuments)
    .where(and(...clauses));

  let deleted = 0;
  for (const row of existing) {
    if (currentKeys.has(refKey(row))) continue;
    deleted += (await deleteSearchDocument(db, row)).deleted;
  }
  return deleted;
}
