/**
 * Realtime event dispatcher — Phase 5C (DEM-85).
 *
 * Pure routing layer between a `RealtimeEventEnvelope` (server fan-out from
 * Faz 5B's outbox + worker) and the board cache primitives. Stays pure on
 * purpose: takes a `QueryClient` + a board filter + a card filter factory,
 * pushes the cache update through `setQueriesData`, returns nothing. Unknown
 * event types log a warning and skip — Faz 5B is allowed to publish a new
 * type before this file learns to handle it (forward compatibility).
 *
 * Payload contract (matches the producer that 5B will land):
 *   - `card.moved`      → `{ cardId, fromListId, toListId, position }`
 *   - `card.created`    → `{ card }` — full row (`board.get` projection)
 *   - `card.updated`    → `{ cardId, patch }` — shallow merge over the card
 *   - `card.archived`   → `{ cardId }`
 *   - `card.completed`  → `{ cardId, completedAt, completedBy? }`
 *   - `card.uncompleted`→ `{ cardId }`
 *   - `list.moved`      → `{ listId, position }`
 *   - `list.created`    → `{ list }`
 *   - `list.updated`    → `{ listId, patch? }` or `{ listId, fromTitle?, toTitle?, color? }`
 *   - `list.archived`   → `{ listId, archivedAt }`
 *   - `board.updated`   → `{ patch }`
 *   - `board.archived`  → `{ archivedAt }`
 *
 * Spec: `05-board-mekanigi.md` §5.3, `08-web-ve-mobil.md` §8.1.10.
 */
import type { QueryClient, QueryFilters } from '@tanstack/react-query';
// `QueryFilters` is re-exported below in the `RealtimeFilters` shape; the
// import is intentional — keep the reference so it isn't tree-shaken from the
// `.d.ts` consumer view.
import type { RealtimeEventEnvelope } from '@pusula/domain';
import {
  applyBoardPatch,
  applyBoardLabelAdd,
  applyBoardLabelPatch,
  applyBoardLabelRemove,
  applyCardAdd,
  applyCardArchive,
  applyCardLabelAdd,
  applyCardLabelRemove,
  applyCardMemberAdd,
  applyCardMemberRemove,
  applyCardMove,
  applyCardPatch,
  applyChecklistAdd,
  applyChecklistItemAdd,
  applyChecklistItemPatch,
  applyChecklistItemRemove,
  applyChecklistItemToggle,
  applyChecklistPatch,
  applyChecklistRemove,
  applyCommentAdd,
  applyCommentPatch,
  applyCommentSoftDelete,
  applyListAdd,
  applyListArchive,
  applyListMove,
  applyListPatch,
} from '@/lib/board-cache/primitives';
import type { BoardCache, CardCache, ListCache, CardDetailCache } from '@/lib/board-cache/types';

/** Filters the dispatcher needs to address the right query-client entries. */
export interface RealtimeFilters {
  /** `board.get({ boardId })` filter — the primary cache patched per event. */
  board: QueryFilters;
  /** `card.get({ cardId })` filter factory — used when the event references a single card detail. */
  card: (cardId: string) => QueryFilters;
  /** `comment.list({ cardId })` filter factory. */
  comments?: (cardId: string) => QueryFilters;
  /** `checklist.list({ cardId })` filter factory. */
  checklists?: (cardId: string) => QueryFilters;
  /** `card.labels.list({ cardId })` filter factory. */
  cardLabels?: (cardId: string) => QueryFilters;
  /** `card.members.list({ cardId })` filter factory. */
  cardMembers?: (cardId: string) => QueryFilters;
  /** `label.list({ boardId })` filter factory. */
  boardLabels?: (boardId: string) => QueryFilters;
  /** `board.members.list({ boardId })` filter factory. */
  boardMembers?: (boardId: string) => QueryFilters;
  /** `board.invitations.list({ boardId })` filter factory. */
  boardInvitations?: (boardId: string) => QueryFilters;
}

type Payload = Record<string, unknown>;
type IdRow = { id: string };
type CommentRow = { id: string; deletedAt: unknown };
type LabelIdRow = { labelId: string };
type UserIdRow = { userId: string; role?: unknown };
type ChecklistItemRow = { id: string; position: string; completed?: boolean };
type ChecklistRow = { id: string; position: string; items: ChecklistItemRow[] };
type CardLabelRow = CardCache['labels'][number];
type CardMemberRow = CardCache['members'][number];
type CardSummary = CardCache;

function setBoard(qc: QueryClient, filters: RealtimeFilters, mutate: (data: BoardCache) => BoardCache): void {
  qc.setQueriesData<BoardCache>(filters.board, (data) => (data == null ? data : mutate(data)));
}

function setList<T>(
  qc: QueryClient,
  filter: QueryFilters | undefined,
  mutate: (data: readonly T[]) => readonly T[],
): void {
  if (!filter) return;
  qc.setQueriesData<readonly T[]>(filter, (data) => (data == null ? data : mutate(data)));
}

function invalidate(qc: QueryClient, filter: QueryFilters | undefined): void {
  if (!filter) return;
  void qc.invalidateQueries(filter);
}

function cardIdFrom(envelope: RealtimeEventEnvelope, payload: Payload): string | undefined {
  return envelope.cardId ?? (typeof payload.cardId === 'string' ? payload.cardId : undefined);
}

function boardIdFrom(envelope: RealtimeEventEnvelope, payload: Payload): string | undefined {
  return envelope.boardId ?? (typeof payload.boardId === 'string' ? payload.boardId : undefined);
}

function patchCardDetail(
  qc: QueryClient,
  filters: RealtimeFilters,
  cardId: string,
  patch: Partial<CardDetailCache>,
): void {
  qc.setQueriesData<CardDetailCache>(filters.card(cardId), (data) =>
    data == null ? data : { ...data, ...patch },
  );
}

function patchBoardCard(
  qc: QueryClient,
  filters: RealtimeFilters,
  cardId: string,
  mutate: (card: CardSummary) => CardSummary,
): void {
  setBoard(qc, filters, (data) => {
    let changed = false;
    const cards = data.cards.map((card) => {
      if (card.id !== cardId) return card;
      const next = mutate(card as CardSummary) as CardCache;
      if (next !== card) changed = true;
      return next;
    });
    return changed ? { ...data, cards } : data;
  });
}

function patchAllBoardCards(
  qc: QueryClient,
  filters: RealtimeFilters,
  mutate: (card: CardSummary) => CardSummary,
): void {
  setBoard(qc, filters, (data) => {
    let changed = false;
    const cards = data.cards.map((card) => {
      const next = mutate(card as CardSummary) as CardCache;
      if (next !== card) changed = true;
      return next;
    });
    return changed ? { ...data, cards } : data;
  });
}

function bumpCardNumber(
  qc: QueryClient,
  filters: RealtimeFilters,
  cardId: string,
  field: 'commentCount' | 'checklistTotal' | 'checklistDone',
  delta: number,
): void {
  patchBoardCard(qc, filters, cardId, (card) => {
    const current = typeof card[field] === 'number' ? card[field] : 0;
    const next = Math.max(0, current + delta);
    return next === current ? card : { ...card, [field]: next };
  });
}

function addBoardCardLabel(qc: QueryClient, filters: RealtimeFilters, cardId: string, label: CardLabelRow): void {
  patchBoardCard(qc, filters, cardId, (card) => {
    const labels = applyCardLabelAdd(card.labels ?? [], label) as CardLabelRow[];
    return labels === card.labels ? card : { ...card, labels };
  });
}

function removeBoardCardLabel(qc: QueryClient, filters: RealtimeFilters, cardId: string, labelId: string): void {
  patchBoardCard(qc, filters, cardId, (card) => {
    const labels = applyCardLabelRemove(card.labels ?? [], labelId) as CardLabelRow[];
    return labels === card.labels ? card : { ...card, labels };
  });
}

function patchBoardCardLabels(qc: QueryClient, filters: RealtimeFilters, labelId: string, patch: Partial<CardLabelRow>): void {
  patchAllBoardCards(qc, filters, (card) => {
    if (!card.labels?.some((label) => label.labelId === labelId)) return card;
    return {
      ...card,
      labels: card.labels.map((label) => (label.labelId === labelId ? { ...label, ...patch } : label)),
    };
  });
}

function invalidateCardLabelQueriesForBoardLabel(qc: QueryClient, filters: RealtimeFilters, labelId: string): void {
  if (!filters.cardLabels) return;
  const entries = qc.getQueriesData<readonly LabelIdRow[]>({ queryKey: ['card.labels.list'] });
  for (const [queryKey, labels] of entries) {
    if (!labels?.some((label) => label.labelId === labelId)) continue;
    const input = Array.isArray(queryKey) ? queryKey[1] : undefined;
    const cardId =
      input && typeof input === 'object' && 'cardId' in input && typeof input.cardId === 'string'
        ? input.cardId
        : undefined;
    if (cardId) invalidate(qc, filters.cardLabels(cardId));
  }
}

function cardLabelFromPayload(label: unknown): CardLabelRow | undefined {
  if (!label || typeof label !== 'object') return undefined;
  const record = label as Record<string, unknown>;
  if (
    typeof record.labelId === 'string' &&
    typeof record.name === 'string' &&
    typeof record.color === 'string'
  ) {
    return { labelId: record.labelId, name: record.name, color: record.color };
  }
  return undefined;
}

function cardMemberFromPayload(member: unknown): CardMemberRow | undefined {
  if (!member || typeof member !== 'object') return undefined;
  const record = member as Record<string, unknown>;
  if (
    typeof record.userId !== 'string' ||
    (record.role !== 'assignee' && record.role !== 'watcher')
  ) {
    return undefined;
  }
  return {
    userId: record.userId,
    role: record.role,
    name: typeof record.name === 'string' ? record.name : null,
    image: typeof record.image === 'string' ? record.image : null,
  };
}

function addBoardCardMember(qc: QueryClient, filters: RealtimeFilters, cardId: string, member: CardMemberRow): void {
  patchBoardCard(qc, filters, cardId, (card) => {
    const members = applyCardMemberAdd(card.members ?? [], member) as CardMemberRow[];
    return members === card.members ? card : { ...card, members };
  });
}

function removeBoardCardMember(
  qc: QueryClient,
  filters: RealtimeFilters,
  cardId: string,
  userId: string,
  role?: unknown,
): void {
  patchBoardCard(qc, filters, cardId, (card) => {
    const members = applyCardMemberRemove(card.members ?? [], userId, role) as CardMemberRow[];
    return members === card.members ? card : { ...card, members };
  });
}

/**
 * Apply a single envelope to the board cache. The caller is responsible for
 * echo skipping + `seq` gating before invoking this — the dispatcher itself
 * is the cache write.
 */
export function dispatchRealtimeEvent(
  qc: QueryClient,
  filters: RealtimeFilters,
  envelope: RealtimeEventEnvelope,
): void {
  const payload = (envelope.payload ?? {}) as Payload;

  switch (envelope.type) {
    case 'card.moved': {
      const { cardId, toListId, position } = payload as {
        cardId: string;
        toListId: string;
        position: string;
      };
      setBoard(qc, filters, (data) => applyCardMove(data, { cardId, toListId, newPosition: position }));
      return;
    }
    case 'card.created': {
      const { card } = payload as { card: CardCache };
      setBoard(qc, filters, (data) => applyCardAdd(data, card));
      return;
    }
    case 'card.updated': {
      const { cardId, patch } = payload as { cardId: string; patch: Partial<CardCache> };
      setBoard(qc, filters, (data) => applyCardPatch(data, cardId, patch));
      patchCardDetail(qc, filters, cardId, patch as Partial<CardDetailCache>);
      return;
    }
    case 'card.archived': {
      const { cardId } = payload as { cardId: string };
      setBoard(qc, filters, (data) => applyCardArchive(data, cardId));
      return;
    }
    case 'card.completed': {
      const { cardId, completedAt, completedBy } = payload as {
        cardId: string;
        completedAt: string;
        completedBy?: string | null;
      };
      // `CardCache.completedAt` is `Date` (superjson reifies it client-side);
      // wire format is ISO-8601 from the producer. Convert here.
      const patch = {
        completedAt: new Date(completedAt),
        completedBy: completedBy ?? null,
      } as unknown as Partial<CardCache>;
      setBoard(qc, filters, (data) => applyCardPatch(data, cardId, patch));
      patchCardDetail(qc, filters, cardId, patch as unknown as Partial<CardDetailCache>);
      return;
    }
    case 'card.uncompleted': {
      const { cardId } = payload as { cardId: string };
      const patch = { completedAt: null, completedBy: null } as unknown as Partial<CardCache>;
      setBoard(qc, filters, (data) => applyCardPatch(data, cardId, patch));
      patchCardDetail(qc, filters, cardId, patch as unknown as Partial<CardDetailCache>);
      return;
    }
    case 'list.moved': {
      const { listId, position } = payload as { listId: string; position: string };
      setBoard(qc, filters, (data) => applyListMove(data, { listId, newPosition: position }));
      return;
    }
    case 'list.created': {
      const { list } = payload as { list: ListCache };
      setBoard(qc, filters, (data) => applyListAdd(data, list));
      return;
    }
    case 'list.updated': {
      const { listId, patch, toTitle, color } = payload as {
        listId: string;
        patch?: Partial<ListCache>;
        toTitle?: string;
        color?: ListCache['color'];
      };
      const nextPatch: Partial<ListCache> = { ...(patch ?? {}) };
      if (toTitle !== undefined) nextPatch.title = toTitle;
      if (Object.prototype.hasOwnProperty.call(payload, 'color')) nextPatch.color = color ?? null;
      if (Object.keys(nextPatch).length === 0) return;
      setBoard(qc, filters, (data) => applyListPatch(data, listId, nextPatch));
      return;
    }
    case 'list.archived': {
      const { listId, archivedAt } = payload as {
        listId: string;
        archivedAt: string | null;
      };
      setBoard(qc, filters, (data) => applyListArchive(data, listId, archivedAt));
      return;
    }
    case 'board.updated': {
      const { patch } = payload as { patch: Partial<BoardCache['board']> };
      setBoard(qc, filters, (data) => applyBoardPatch(data, patch));
      return;
    }
    case 'board.archived': {
      const { archivedAt } = payload as { archivedAt: string | null };
      setBoard(qc, filters, (data) =>
        applyBoardPatch(data, { archivedAt } as Partial<BoardCache['board']>),
      );
      return;
    }
    case 'comment.created': {
      const cardId = cardIdFrom(envelope, payload);
      const comment = payload.comment as IdRow | undefined;
      if (!cardId || !comment) return;
      setList<IdRow>(qc, filters.comments?.(cardId), (data) => applyCommentAdd(data, comment));
      bumpCardNumber(qc, filters, cardId, 'commentCount', 1);
      return;
    }
    case 'comment.updated': {
      const cardId = cardIdFrom(envelope, payload);
      const { commentId, patch } = payload as { commentId: string; patch?: Partial<IdRow> };
      if (!cardId || !commentId) return;
      setList<IdRow>(qc, filters.comments?.(cardId), (data) => applyCommentPatch(data, commentId, patch ?? {}));
      return;
    }
    case 'comment.deleted': {
      const cardId = cardIdFrom(envelope, payload);
      const { commentId, deletedAt } = payload as { commentId: string; deletedAt?: string | null };
      if (!cardId || !commentId) return;
      setList<CommentRow>(qc, filters.comments?.(cardId), (data) =>
        applyCommentSoftDelete(data, commentId, deletedAt ?? envelope.createdAt),
      );
      bumpCardNumber(qc, filters, cardId, 'commentCount', -1);
      return;
    }
    case 'comment.mentioned': {
      return;
    }
    case 'checklist.created': {
      const cardId = cardIdFrom(envelope, payload);
      const checklist = payload.checklist as ChecklistRow | undefined;
      if (!cardId || !checklist) return;
      setList<ChecklistRow>(qc, filters.checklists?.(cardId), (data) => applyChecklistAdd(data, checklist));
      return;
    }
    case 'checklist.updated': {
      const cardId = cardIdFrom(envelope, payload);
      const { checklistId, patch } = payload as { checklistId: string; patch?: Partial<ChecklistRow> };
      if (!cardId || !checklistId) return;
      setList<ChecklistRow>(qc, filters.checklists?.(cardId), (data) =>
        applyChecklistPatch(data, checklistId, patch ?? {}),
      );
      return;
    }
    case 'checklist.deleted': {
      const cardId = cardIdFrom(envelope, payload);
      const { checklistId } = payload as { checklistId: string };
      if (!cardId || !checklistId) return;
      setList<ChecklistRow>(qc, filters.checklists?.(cardId), (data) => applyChecklistRemove(data, checklistId));
      invalidate(qc, filters.board);
      return;
    }
    case 'checklist.item_added': {
      const cardId = cardIdFrom(envelope, payload);
      const { checklistId } = payload as { checklistId: string };
      const item = payload.item as ChecklistItemRow | undefined;
      if (!cardId || !checklistId || !item) return;
      setList<ChecklistRow>(qc, filters.checklists?.(cardId), (data) =>
        applyChecklistItemAdd(data, checklistId, item),
      );
      bumpCardNumber(qc, filters, cardId, 'checklistTotal', 1);
      if (item.completed) bumpCardNumber(qc, filters, cardId, 'checklistDone', 1);
      return;
    }
    case 'checklist.item_updated': {
      const cardId = cardIdFrom(envelope, payload);
      const { checklistId, itemId, patch } = payload as {
        checklistId: string;
        itemId: string;
        patch?: Partial<ChecklistItemRow>;
      };
      if (!cardId || !checklistId || !itemId) return;
      setList<ChecklistRow>(qc, filters.checklists?.(cardId), (data) =>
        applyChecklistItemPatch(data, checklistId, itemId, patch ?? {}),
      );
      return;
    }
    case 'checklist.item_toggled': {
      const cardId = cardIdFrom(envelope, payload);
      const { checklistId, itemId, patch } = payload as {
        checklistId: string;
        itemId: string;
        patch?: Partial<ChecklistItemRow>;
      };
      if (!cardId || !checklistId || !itemId) return;
      setList<ChecklistRow>(qc, filters.checklists?.(cardId), (data) =>
        applyChecklistItemToggle(data, checklistId, itemId, patch ?? {}),
      );
      if (typeof patch?.completed === 'boolean') {
        bumpCardNumber(qc, filters, cardId, 'checklistDone', patch.completed ? 1 : -1);
      }
      return;
    }
    case 'checklist.item_deleted': {
      const cardId = cardIdFrom(envelope, payload);
      const { checklistId, itemId } = payload as { checklistId: string; itemId: string };
      if (!cardId || !checklistId || !itemId) return;
      setList<ChecklistRow>(qc, filters.checklists?.(cardId), (data) =>
        applyChecklistItemRemove(data, checklistId, itemId),
      );
      invalidate(qc, filters.board);
      return;
    }
    case 'card.label_added': {
      const cardId = cardIdFrom(envelope, payload);
      const label = payload.label as LabelIdRow | undefined;
      if (!cardId || !label) return;
      setList<LabelIdRow>(qc, filters.cardLabels?.(cardId), (data) => applyCardLabelAdd(data, label));
      const boardLabel = cardLabelFromPayload(label);
      if (boardLabel) addBoardCardLabel(qc, filters, cardId, boardLabel);
      return;
    }
    case 'card.label_removed': {
      const cardId = cardIdFrom(envelope, payload);
      const { labelId } = payload as { labelId: string };
      if (!cardId || !labelId) return;
      setList<LabelIdRow>(qc, filters.cardLabels?.(cardId), (data) => applyCardLabelRemove(data, labelId));
      removeBoardCardLabel(qc, filters, cardId, labelId);
      return;
    }
    case 'card.member_added': {
      const cardId = cardIdFrom(envelope, payload);
      const member = payload.member as UserIdRow | undefined;
      if (!cardId || !member) return;
      setList<UserIdRow>(qc, filters.cardMembers?.(cardId), (data) => applyCardMemberAdd(data, member));
      const boardMember = cardMemberFromPayload(member);
      if (boardMember) addBoardCardMember(qc, filters, cardId, boardMember);
      return;
    }
    case 'card.member_removed': {
      const cardId = cardIdFrom(envelope, payload);
      const { userId, role } = payload as { userId: string; role?: unknown };
      if (!cardId || !userId) return;
      setList<UserIdRow>(qc, filters.cardMembers?.(cardId), (data) => applyCardMemberRemove(data, userId, role));
      removeBoardCardMember(qc, filters, cardId, userId, role);
      return;
    }
    case 'board.label_created': {
      const boardId = boardIdFrom(envelope, payload);
      const label =
        (payload.label as IdRow | undefined) ??
        ({ id: payload.labelId, name: payload.name, color: payload.color } as IdRow);
      if (!boardId || !label.id) return;
      setList<IdRow>(qc, filters.boardLabels?.(boardId), (data) => applyBoardLabelAdd(data, label));
      return;
    }
    case 'board.label_updated': {
      const boardId = boardIdFrom(envelope, payload);
      const labelId = typeof payload.labelId === 'string' ? payload.labelId : undefined;
      const label = payload.label as IdRow | undefined;
      if (!boardId || !labelId) return;
      setList<IdRow>(qc, filters.boardLabels?.(boardId), (data) =>
        applyBoardLabelPatch(data, labelId, (label ?? payload) as Partial<IdRow>),
      );
      const patch: Partial<CardLabelRow> = {};
      const labelRecord = (label ?? payload) as Record<string, unknown>;
      if (typeof labelRecord.name === 'string') patch.name = labelRecord.name;
      if (typeof labelRecord.color === 'string') patch.color = labelRecord.color;
      patchBoardCardLabels(qc, filters, labelId, patch);
      invalidateCardLabelQueriesForBoardLabel(qc, filters, labelId);
      return;
    }
    case 'board.label_deleted': {
      const boardId = boardIdFrom(envelope, payload);
      const { labelId } = payload as { labelId: string };
      if (!boardId || !labelId) return;
      setList<IdRow>(qc, filters.boardLabels?.(boardId), (data) => applyBoardLabelRemove(data, labelId));
      patchAllBoardCards(qc, filters, (card) => {
        const labels = applyCardLabelRemove(card.labels ?? [], labelId) as CardLabelRow[];
        return labels === card.labels ? card : { ...card, labels };
      });
      invalidateCardLabelQueriesForBoardLabel(qc, filters, labelId);
      return;
    }
    case 'board.member_invited':
    case 'board.invitation_accepted':
    case 'board.invitation_declined':
    case 'board.invitation_revoked': {
      const boardId = boardIdFrom(envelope, payload);
      if (!boardId) return;
      invalidate(qc, filters.boardMembers?.(boardId));
      invalidate(qc, filters.boardInvitations?.(boardId));
      return;
    }
    case 'board.member_added': {
      const boardId = boardIdFrom(envelope, payload);
      if (!boardId) return;
      invalidate(qc, filters.boardMembers?.(boardId));
      invalidate(qc, filters.board);
      return;
    }
    case 'board.member_role_changed': {
      const boardId = boardIdFrom(envelope, payload);
      if (!boardId) return;
      invalidate(qc, filters.boardMembers?.(boardId));
      invalidate(qc, filters.board);
      return;
    }
    case 'board.member_removed': {
      const boardId = boardIdFrom(envelope, payload);
      if (!boardId) return;
      invalidate(qc, filters.boardMembers?.(boardId));
      invalidate(qc, filters.board);
      return;
    }
    default: {
      // Forward-compat: a 5B-published type the client doesn't recognise yet —
      // log once and skip rather than throwing.
      console.warn(`[realtime] unknown event type '${envelope.type}', skipping`);
      return;
    }
  }
}
