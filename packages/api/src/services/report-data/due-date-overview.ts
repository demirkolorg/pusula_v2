/**
 * `due-date-overview` micro-report — `cards.due_at` kategorize
 * (geciken/yaklaşan/yakında/vadesiz). Scope: C/L/B/W.
 *
 * Eşik tanımları:
 *  - overdue: dueAt < now AND completed=false
 *  - dueSoon: now ≤ dueAt ≤ now+3d AND completed=false
 *  - upcoming: dueAt > now+3d AND completed=false
 *  - noDueDate: dueAt IS NULL
 *  - completed: dueAt IS NOT NULL AND completed=true (rapor için ayrı)
 */
import { and, eq, inArray, isNull, type Database } from '@pusula/db';
import { cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard, cardIdsInWorkspace } from './helpers';

export interface DueDateOverviewData {
  overdue: number;
  dueSoon: number;
  upcoming: number;
  noDueDate: number;
  completed: number;
  total: number;
}

const DUE_SOON_HORIZON_MS = 3 * 24 * 3600 * 1000;

async function categorize(
  db: Database,
  cardIds: string[],
  now: Date,
): Promise<DueDateOverviewData> {
  if (cardIds.length === 0) {
    return { overdue: 0, dueSoon: 0, upcoming: 0, noDueDate: 0, completed: 0, total: 0 };
  }
  const rows = await db
    .select({
      id: cards.id,
      dueAt: cards.dueAt,
      completed: cards.completed,
    })
    .from(cards)
    .where(and(inArray(cards.id, cardIds), isNull(cards.archivedAt)));

  const horizon = now.getTime() + DUE_SOON_HORIZON_MS;
  let overdue = 0;
  let dueSoon = 0;
  let upcoming = 0;
  let noDueDate = 0;
  let completed = 0;

  for (const r of rows) {
    if (!r.dueAt) {
      noDueDate++;
      continue;
    }
    if (r.completed) {
      completed++;
      continue;
    }
    const t = r.dueAt.getTime();
    if (t < now.getTime()) overdue++;
    else if (t <= horizon) dueSoon++;
    else upcoming++;
  }

  return {
    overdue,
    dueSoon,
    upcoming,
    noDueDate,
    completed,
    total: rows.length,
  };
}

export const dueDateOverviewAdapter: ScopeAdapter<DueDateOverviewData> = {
  async card(ctx, scope) {
    return categorize(asDb(ctx), [scope.cardId], ctx.now());
  },
  async list(ctx, scope) {
    const db = asDb(ctx);
    const cardRows = await db
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.listId, scope.listId));
    return categorize(
      db,
      cardRows.map((r) => r.id),
      ctx.now(),
    );
  },
  async board(ctx, scope) {
    return categorize(asDb(ctx), await cardIdsInBoard(ctx, scope.boardId), ctx.now());
  },
  async workspace(ctx, scope) {
    return categorize(asDb(ctx), await cardIdsInWorkspace(ctx, scope.workspaceId), ctx.now());
  },
};
