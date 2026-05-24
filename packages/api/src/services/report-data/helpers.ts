/**
 * Faz 13D — Query servisleri ortak SQL helper'ları (DEM-260). Domain
 * (`@pusula/domain/reports`) saf TS; bu dosya Drizzle-aware (DB I/O
 * yapan tüm scope adapter implementasyonları aynı pattern'i paylaşır).
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §16.5 +
 * `docs/domain/09-raporlama-kurallari.md` §9.3.
 */
import { between, eq, inArray, isNotNull, isNull, sql, type Database, type SQL } from '@pusula/db';
import { activityEvents, cardLabels, cards, lists } from '@pusula/db';
import {
  resolveRange,
  type QueryCtx,
  type ReportFilters,
} from '@pusula/domain/reports';

/** ctx.db'yi Drizzle `Database` olarak görür — sadece API tarafında kullan. */
export function asDb(ctx: QueryCtx): Database {
  return ctx.db as Database;
}

/**
 * `filters.range` → mutlak `[from, to]` Date çifti. `ctx.now()` injection
 * sayesinde test deterministik.
 */
export function rangeOf(ctx: QueryCtx, filters: ReportFilters): { from: Date; to: Date } {
  return resolveRange(filters.range, ctx.now());
}

/**
 * `activity_events` üstünde tarih + üye + (opsiyonel) board scope
 * filtresini AND'leyen ortak where clause. Adapter'lar bunu komposit
 * scope-specific `where` ile genişletir.
 */
export function activityWhere(
  filters: ReportFilters,
  range: { from: Date; to: Date },
  options: { actorRelation?: 'assignee' | 'actor' | 'watcher' } = {},
): SQL[] {
  const clauses: SQL[] = [between(activityEvents.createdAt, range.from, range.to)];

  // `members` filtresinde `relations: ['actor', ...]` varsa actor'a göre
  // user filter uygulanır (assignee/watcher filtreleri `cards`'a karşı
  // ayrı subquery — bu helper sadece activity tablosu için).
  if (filters.members && filters.members.userIds.length > 0) {
    const relevantRelations = options.actorRelation
      ? filters.members.relations.includes(options.actorRelation)
      : filters.members.relations.includes('actor');
    if (relevantRelations) {
      clauses.push(inArray(activityEvents.actorId, filters.members.userIds));
    }
  }

  return clauses;
}

/**
 * Card scope-filter'ından (open/completed/archived) `cards` where
 * predicate'leri. `cardStatus` belirtilmezse default `['open',
 * 'completed']` (§9.8 default).
 */
export function cardStatusWhere(filters: ReportFilters): SQL[] {
  const status = filters.scopeFilter?.cardStatus ?? ['open', 'completed'];
  const clauses: SQL[] = [];

  const includeOpen = status.includes('open');
  const includeCompleted = status.includes('completed');
  const includeArchived = status.includes('archived');

  // Arşivli kartlar default-out; explicit `archived` istenmiyorsa filtre.
  if (!includeArchived) {
    clauses.push(isNull(cards.archivedAt));
  }

  if (includeOpen && includeCompleted) {
    // Açık + tamamlanan — completed flag'ine bakılmaz.
  } else if (includeOpen && !includeCompleted) {
    clauses.push(eq(cards.completed, false));
  } else if (!includeOpen && includeCompleted) {
    clauses.push(eq(cards.completed, true));
  } else if (!includeOpen && !includeCompleted && includeArchived) {
    // Sadece archived — completed bayrağı serbest, ama archived kontrolü
    // yukarıda zaten yok (negate edilmedi); zorla isNotNull.
    clauses.push(isNotNull(cards.archivedAt));
  }

  return clauses;
}

/**
 * Bir kart kümesinin label filter'ından (and/or) eşleştirilmesi —
 * `cardId IN (subquery)` döner. Boş labelIds → null (filter atlanır).
 */
export function cardLabelSubquery(
  db: Database,
  filters: ReportFilters,
): SQL | null {
  if (!filters.labels || filters.labels.labelIds.length === 0) return null;
  const { labelIds, mode } = filters.labels;

  // `cardLabels` join: card için seçili label sayısını say; mode=and ise
  // sayı === labelIds.length, mode=or ise ≥ 1.
  if (mode === 'or') {
    return sql`${cards.id} IN (SELECT ${cardLabels.cardId} FROM ${cardLabels} WHERE ${cardLabels.labelId} IN (${sql.join(
      labelIds.map((id) => sql`${id}`),
      sql`, `,
    )}))`;
  }
  // AND: kart'ın aldığı bu set'ten label sayısı === labelIds.length.
  return sql`${cards.id} IN (
    SELECT ${cardLabels.cardId} FROM ${cardLabels}
    WHERE ${cardLabels.labelId} IN (${sql.join(
      labelIds.map((id) => sql`${id}`),
      sql`, `,
    )})
    GROUP BY ${cardLabels.cardId}
    HAVING COUNT(DISTINCT ${cardLabels.labelId}) = ${labelIds.length}
  )`;
}

/**
 * Board scope için "erişilebilir kartların id listesini" küme olarak
 * döner. `accessibleListsInBoard` ile permission-filtered, sonra
 * `cards.list_id IN (...)` ile cardId listesi.
 */
export async function cardIdsInBoard(
  ctx: QueryCtx,
  boardId: string,
): Promise<string[]> {
  const accessibleListIds = await ctx.permissions.accessibleListsInBoard(boardId);
  if (accessibleListIds.length === 0) return [];
  const db = asDb(ctx);
  const rows = await db
    .select({ id: cards.id })
    .from(cards)
    .where(inArray(cards.listId, accessibleListIds as string[]));
  return rows.map((r) => r.id);
}

/**
 * Workspace scope için board scope'a benzer — `accessibleBoardsInWorkspace`
 * → tüm board için list id'leri → cards.
 */
export async function cardIdsInWorkspace(
  ctx: QueryCtx,
  workspaceId: string,
): Promise<string[]> {
  const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
    workspaceId,
  );
  if (accessibleBoardIds.length === 0) return [];
  const db = asDb(ctx);
  const listRows = await db
    .select({ id: lists.id })
    .from(lists)
    .where(inArray(lists.boardId, accessibleBoardIds as string[]));
  if (listRows.length === 0) return [];
  const rows = await db
    .select({ id: cards.id })
    .from(cards)
    .where(inArray(cards.listId, listRows.map((r) => r.id)));
  return rows.map((r) => r.id);
}
