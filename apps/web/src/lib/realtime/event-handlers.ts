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
 * Payload contract (producer shape first; legacy/full-row shape accepted):
 *   - `card.moved`      → `{ cardId, fromListId, toListId, toPosition }`
 *   - `card.created`    → `{ cardId, listId, title, position }` or `{ card }`
 *   - `card.updated`    → `{ cardId, patch }` — shallow merge over the card
 *   - `card.archived`   → `{ cardId, archived }`
 *   - `card.completed`  → `{ cardId, completedAt, completedBy? }`
 *   - `card.uncompleted`→ `{ cardId }`
 *   - `list.moved`      → `{ listId, toPosition }`
 *   - `list.created`    → `{ listId, title, position }` or `{ list }`
 *   - `list.updated`    → `{ listId, patch? }` or `{ listId, fromTitle?, toTitle?, color? }`
 *   - `list.archived`   → `{ listId, archived }`
 *   - `list.deleted`    → `{ listId }`           (Faz 17 — hard delete)
 *   - `card.deleted`    → `{ cardId, listId }`   (Faz 17 — hard delete)
 *   - `board.updated`   → `{ patch }`
 *   - `board.archived`  → `{ archived }`
 *
 * Spec: `05-board-mekanigi.md` §5.3, `08-web-ve-mobil.md` §8.1.10.
 */
import type { QueryClient, QueryFilters } from '@tanstack/react-query';
import {
  cardCompletedPayloadSchema,
  cardUncompletedPayloadSchema,
  hasRealtimeEventPayloadSchema,
  parseRealtimeEventPayload,
  type RealtimeEventEnvelope,
} from '@pusula/domain';
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
  applyCardRemove,
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
  applyListRemove,
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
  /** `board.accessRequests.list({ boardId })` filter factory — DEM-154. */
  boardAccessRequests?: (boardId: string) => QueryFilters;
  /** `attachment.list({ cardId })` filter factory — Faz 11D (DEM-150). */
  attachments?: (cardId: string) => QueryFilters;
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

function isPayload(value: unknown): value is Payload {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(payload: Payload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

function booleanField(payload: Payload, key: string): boolean | undefined {
  const value = payload[key];
  return typeof value === 'boolean' ? value : undefined;
}

function createdAtDate(envelope: RealtimeEventEnvelope): Date {
  const date = new Date(envelope.createdAt);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function archivedAtFromPayload(
  payload: Payload,
  envelope: RealtimeEventEnvelope,
): string | null | undefined {
  if (Object.prototype.hasOwnProperty.call(payload, 'archivedAt')) {
    const archivedAt = payload.archivedAt;
    if (archivedAt === null || typeof archivedAt === 'string') return archivedAt;
  }
  const archived = booleanField(payload, 'archived');
  if (archived === true) return envelope.createdAt;
  if (archived === false) return null;
  return undefined;
}

function cardFromPayload(payload: Payload, envelope: RealtimeEventEnvelope): CardCache | undefined {
  const source = isPayload(payload.card) ? payload.card : payload;
  const id = stringField(source, 'id') ?? stringField(source, 'cardId');
  const listId = stringField(source, 'listId');
  const title = stringField(source, 'title');
  const position = stringField(source, 'position') ?? stringField(source, 'toPosition');
  if (!id || !listId || !title || !position) return undefined;

  const timestamp = createdAtDate(envelope);
  return {
    id,
    boardId: stringField(source, 'boardId') ?? envelope.boardId ?? '',
    listId,
    title,
    description: null,
    position,
    dueAt: null,
    completed: false,
    completedAt: null,
    completedBy: null,
    coverColor: null,
    coverImageAttachmentId: null,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    labels: [],
    checklistTotal: 0,
    checklistDone: 0,
    commentCount: 0,
    // Faz 11B (DEM-148) — board.get response carries this; new realtime-
    // synthesised cards start with zero attachments.
    attachmentCount: 0,
    members: [],
    coverImage: null,
    // DEM-227 — board.get kart projection'ı kapak presigned URL'i taşır; yeni
    // sentezlenen kartın kapağı yoktur.
    coverImageUrl: null,
  } as CardCache;
}

function listFromPayload(payload: Payload, envelope: RealtimeEventEnvelope): ListCache | undefined {
  const source = isPayload(payload.list) ? payload.list : payload;
  const id = stringField(source, 'id') ?? stringField(source, 'listId');
  const title = stringField(source, 'title');
  const position = stringField(source, 'position') ?? stringField(source, 'toPosition');
  if (!id || !title || !position) return undefined;

  const timestamp = createdAtDate(envelope);
  return {
    id,
    title,
    color: null,
    icon: null,
    iconColor: null,
    position,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  } as ListCache;
}

function setBoard(
  qc: QueryClient,
  filters: RealtimeFilters,
  mutate: (data: BoardCache) => BoardCache,
): void {
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

/**
 * Invalidate the `comment.list({ cardId, checklistItemId })` thread for a single
 * checklist item.
 *
 * `filters.comments(cardId)` is a *partial* match on `{ cardId }` so it also
 * covers `{ cardId, checklistItemId }` entries — but a bare invalidation would
 * additionally refetch the card-level thread (whose contents are unaffected by
 * an item comment). We narrow with a `predicate` that requires the query's
 * serialized input to carry the matching `checklistItemId`, so only the item's
 * own thread refetches. The input lives at `queryKey[1].input` (tRPC's
 * react-query key shape); we read it defensively.
 */
function invalidateChecklistItemThread(
  qc: QueryClient,
  filters: RealtimeFilters,
  cardId: string,
  checklistItemId: string,
): void {
  const base = filters.comments?.(cardId);
  if (!base) return;
  void qc.invalidateQueries({
    ...base,
    predicate: (query) => inputChecklistItemId(query.queryKey) === checklistItemId,
  });
}

/** Read `checklistItemId` out of a tRPC react-query key's serialized input. */
function inputChecklistItemId(queryKey: readonly unknown[]): string | undefined {
  for (const part of queryKey) {
    if (part && typeof part === 'object') {
      const record = part as Record<string, unknown>;
      const input = ('input' in record ? record.input : record) as
        | Record<string, unknown>
        | undefined;
      if (input && typeof input === 'object' && typeof input.checklistItemId === 'string') {
        return input.checklistItemId;
      }
    }
  }
  return undefined;
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
  patch: Partial<CardDetailCache['card']>,
): void {
  // `card.get` çıktısı `{ card, relations }` — kart alanları `.card` altında
  // nested. Patch top-level'a değil `.card`'a merge edilmeli; aksi halde kart
  // detay modalı (`card.get` cache'inden okur) realtime patch'i görmez.
  qc.setQueriesData<CardDetailCache>(filters.card(cardId), (data) =>
    data == null ? data : { ...data, card: { ...data.card, ...patch } },
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
  field: 'commentCount' | 'checklistTotal' | 'checklistDone' | 'attachmentCount',
  delta: number,
): void {
  patchBoardCard(qc, filters, cardId, (card) => {
    const current = typeof card[field] === 'number' ? card[field] : 0;
    const next = Math.max(0, current + delta);
    return next === current ? card : { ...card, [field]: next };
  });
}

function addBoardCardLabel(
  qc: QueryClient,
  filters: RealtimeFilters,
  cardId: string,
  label: CardLabelRow,
): void {
  patchBoardCard(qc, filters, cardId, (card) => {
    const labels = applyCardLabelAdd(card.labels ?? [], label) as CardLabelRow[];
    return labels === card.labels ? card : { ...card, labels };
  });
}

function removeBoardCardLabel(
  qc: QueryClient,
  filters: RealtimeFilters,
  cardId: string,
  labelId: string,
): void {
  patchBoardCard(qc, filters, cardId, (card) => {
    const labels = applyCardLabelRemove(card.labels ?? [], labelId) as CardLabelRow[];
    return labels === card.labels ? card : { ...card, labels };
  });
}

function patchBoardCardLabels(
  qc: QueryClient,
  filters: RealtimeFilters,
  labelId: string,
  patch: Partial<CardLabelRow>,
): void {
  patchAllBoardCards(qc, filters, (card) => {
    if (!card.labels?.some((label) => label.labelId === labelId)) return card;
    return {
      ...card,
      labels: card.labels.map((label) =>
        label.labelId === labelId ? { ...label, ...patch } : label,
      ),
    };
  });
}

function invalidateCardLabelQueriesForBoardLabel(
  qc: QueryClient,
  filters: RealtimeFilters,
  labelId: string,
): void {
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

function addBoardCardMember(
  qc: QueryClient,
  filters: RealtimeFilters,
  cardId: string,
  member: CardMemberRow,
): void {
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
  const parsedPayload = parseRealtimeEventPayload(envelope.type, envelope.payload);
  if (parsedPayload === undefined && hasRealtimeEventPayloadSchema(envelope.type)) return;

  const payload = isPayload(parsedPayload) ? parsedPayload : {};

  switch (envelope.type) {
    case 'card.moved': {
      const cardId = stringField(payload, 'cardId');
      const toListId = stringField(payload, 'toListId');
      const position = stringField(payload, 'position') ?? stringField(payload, 'toPosition');
      if (!cardId || !toListId || !position) return;
      setBoard(qc, filters, (data) =>
        applyCardMove(data, { cardId, toListId, newPosition: position }),
      );
      return;
    }
    case 'card.created': {
      const card = cardFromPayload(payload, envelope);
      if (!card) return;
      setBoard(qc, filters, (data) => applyCardAdd(data, card));
      return;
    }
    case 'card.updated': {
      const { cardId, patch } = payload as { cardId: string; patch: Partial<CardCache> };
      setBoard(qc, filters, (data) => applyCardPatch(data, cardId, patch));
      patchCardDetail(qc, filters, cardId, patch as Partial<CardDetailCache['card']>);
      return;
    }
    case 'card.archived': {
      const cardId = stringField(payload, 'cardId');
      if (!cardId) return;
      // Kart detay modalı açıksa `card.get`'i tazele — modal `archivedAt`'i
      // oradan okuyup salt-okunur kararını verir; refetch güncel durumu getirir
      // (arşivle ve arşivden çıkar dallarının ikisinde de gerekli).
      void qc.invalidateQueries(filters.card(cardId));
      if (booleanField(payload, 'archived') === false) {
        void qc.invalidateQueries(filters.board);
        return;
      }
      setBoard(qc, filters, (data) => applyCardArchive(data, cardId));
      return;
    }
    case 'card.completed': {
      // Faz 5 review (5C.1): payload sözleşmesi @pusula/domain üzerinden Zod ile
      // doğrulanıyor — server (insertRealtimeEvent çağrıları) ve client aynı tipi
      // paylaşır; bozuk payload sessizce cache'i bozmaz, parse hatası warn ile düşer.
      const parsed = cardCompletedPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        console.warn('[realtime] card.completed payload parse failed:', parsed.error.message);
        return;
      }
      const { cardId, completedAt, completedBy } = parsed.data;
      // `CardCache.completedAt` is `Date` (superjson reifies it client-side);
      // wire format is ISO-8601 from the producer. Convert here.
      // `completed` boolean'ı da yamanmalı — kart yüzü (`card-item.tsx`) bu
      // alanı okur; yalnız `completedAt` yamanırsa diğer kullanıcıda kart
      // "tamamlanmamış" görünmeye devam eder (event tipi durumu belirtir).
      const patch: Partial<CardCache> = {
        completed: true,
        completedAt: new Date(completedAt),
        completedBy,
      };
      setBoard(qc, filters, (data) => applyCardPatch(data, cardId, patch));
      patchCardDetail(qc, filters, cardId, patch as Partial<CardDetailCache['card']>);
      return;
    }
    case 'card.uncompleted': {
      const parsed = cardUncompletedPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        console.warn('[realtime] card.uncompleted payload parse failed:', parsed.error.message);
        return;
      }
      const { cardId } = parsed.data;
      // `completed: false` — bkz. `card.completed` case'indeki not.
      const patch: Partial<CardCache> = { completed: false, completedAt: null, completedBy: null };
      setBoard(qc, filters, (data) => applyCardPatch(data, cardId, patch));
      patchCardDetail(qc, filters, cardId, patch as Partial<CardDetailCache['card']>);
      return;
    }
    case 'list.moved': {
      const listId = stringField(payload, 'listId');
      const position = stringField(payload, 'position') ?? stringField(payload, 'toPosition');
      if (!listId || !position) return;
      setBoard(qc, filters, (data) => applyListMove(data, { listId, newPosition: position }));
      return;
    }
    case 'list.created': {
      const list = listFromPayload(payload, envelope);
      if (!list) return;
      setBoard(qc, filters, (data) => applyListAdd(data, list));
      return;
    }
    case 'list.updated': {
      const { listId, patch, toTitle, color, icon, iconColor } = payload as {
        listId: string;
        patch?: Partial<ListCache>;
        toTitle?: string;
        color?: ListCache['color'];
        icon?: ListCache['icon'];
        iconColor?: ListCache['iconColor'];
      };
      const nextPatch: Partial<ListCache> = { ...(patch ?? {}) };
      if (toTitle !== undefined) nextPatch.title = toTitle;
      if (Object.prototype.hasOwnProperty.call(payload, 'color')) nextPatch.color = color ?? null;
      if (Object.prototype.hasOwnProperty.call(payload, 'icon')) nextPatch.icon = icon ?? null;
      if (Object.prototype.hasOwnProperty.call(payload, 'iconColor')) {
        nextPatch.iconColor = iconColor ?? null;
      }
      if (Object.keys(nextPatch).length === 0) return;
      setBoard(qc, filters, (data) => applyListPatch(data, listId, nextPatch));
      return;
    }
    case 'list.archived': {
      const listId = stringField(payload, 'listId');
      const archivedAt = archivedAtFromPayload(payload, envelope);
      if (!listId || archivedAt === undefined) return;
      setBoard(qc, filters, (data) => applyListArchive(data, listId, archivedAt));
      return;
    }
    case 'list.deleted': {
      // Faz 17 (2026-06-01) — kalıcı silme; arşivlemenin aksine listeyi cache'ten
      // tamamen düşür. Server boş liste garantisi vermiş; yine de defansif olarak
      // `applyListRemove` listenin altındaki kartları da temizler (stale optimistic
      // pencere).
      const listId = stringField(payload, 'listId');
      if (!listId) return;
      setBoard(qc, filters, (data) => applyListRemove(data, listId));
      return;
    }
    case 'card.deleted': {
      // Faz 17 (2026-06-01) — kart kalıcı silme; arşivlemenin aksine
      // `card.get({ cardId })` query'sini de invalidate eder (açık modal varsa
      // 404 / "kart bulunamadı" akışına düşsün). `applyCardRemove` kartı
      // listeden çıkarır.
      const cardId = stringField(payload, 'cardId');
      if (!cardId) return;
      void qc.invalidateQueries(filters.card(cardId));
      setBoard(qc, filters, (data) => applyCardRemove(data, cardId));
      return;
    }
    case 'board.updated': {
      const { patch } = payload as { patch: Partial<BoardCache['board']> };
      setBoard(qc, filters, (data) => applyBoardPatch(data, patch));
      return;
    }
    case 'board.archived': {
      const archivedAt = archivedAtFromPayload(payload, envelope);
      if (archivedAt === undefined) return;
      setBoard(qc, filters, (data) =>
        applyBoardPatch(data, { archivedAt } as Partial<BoardCache['board']>),
      );
      return;
    }
    case 'comment.created': {
      const cardId = cardIdFrom(envelope, payload);
      const comment = payload.comment as IdRow | undefined;
      if (!cardId || !comment) return;
      // Checklist madde yorumu — kart thread'ine / kart commentCount'una DOKUNMA.
      // Sadece o maddenin thread'ini ve checklist listesini (rozet sayacı) tazele.
      const checklistItemId = stringField(payload, 'checklistItemId');
      if (checklistItemId) {
        invalidateChecklistItemThread(qc, filters, cardId, checklistItemId);
        invalidate(qc, filters.checklists?.(cardId));
        return;
      }
      setList<IdRow>(qc, filters.comments?.(cardId), (data) => applyCommentAdd(data, comment));
      bumpCardNumber(qc, filters, cardId, 'commentCount', 1);
      return;
    }
    case 'comment.updated': {
      const cardId = cardIdFrom(envelope, payload);
      const { commentId, patch } = payload as { commentId: string; patch?: Partial<IdRow> };
      if (!cardId || !commentId) return;
      const checklistItemId = stringField(payload, 'checklistItemId');
      if (checklistItemId) {
        // Düzenleme rozet sayacını değiştirmez; yalnız madde thread'ini tazele.
        invalidateChecklistItemThread(qc, filters, cardId, checklistItemId);
        return;
      }
      setList<IdRow>(qc, filters.comments?.(cardId), (data) =>
        applyCommentPatch(data, commentId, patch ?? {}),
      );
      return;
    }
    case 'comment.deleted': {
      const cardId = cardIdFrom(envelope, payload);
      const { commentId, deletedAt } = payload as { commentId: string; deletedAt?: string | null };
      if (!cardId || !commentId) return;
      const checklistItemId = stringField(payload, 'checklistItemId');
      if (checklistItemId) {
        invalidateChecklistItemThread(qc, filters, cardId, checklistItemId);
        invalidate(qc, filters.checklists?.(cardId));
        return;
      }
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
      setList<ChecklistRow>(qc, filters.checklists?.(cardId), (data) =>
        applyChecklistAdd(data, checklist),
      );
      return;
    }
    case 'checklist.updated': {
      const cardId = cardIdFrom(envelope, payload);
      const { checklistId, patch } = payload as {
        checklistId: string;
        patch?: Partial<ChecklistRow>;
      };
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
      setList<ChecklistRow>(qc, filters.checklists?.(cardId), (data) =>
        applyChecklistRemove(data, checklistId),
      );
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
      setList<LabelIdRow>(qc, filters.cardLabels?.(cardId), (data) =>
        applyCardLabelAdd(data, label),
      );
      const boardLabel = cardLabelFromPayload(label);
      if (boardLabel) addBoardCardLabel(qc, filters, cardId, boardLabel);
      return;
    }
    case 'card.label_removed': {
      const cardId = cardIdFrom(envelope, payload);
      const { labelId } = payload as { labelId: string };
      if (!cardId || !labelId) return;
      setList<LabelIdRow>(qc, filters.cardLabels?.(cardId), (data) =>
        applyCardLabelRemove(data, labelId),
      );
      removeBoardCardLabel(qc, filters, cardId, labelId);
      return;
    }
    case 'card.member_added': {
      const cardId = cardIdFrom(envelope, payload);
      const member = payload.member as UserIdRow | undefined;
      if (!cardId || !member) return;
      setList<UserIdRow>(qc, filters.cardMembers?.(cardId), (data) =>
        applyCardMemberAdd(data, member),
      );
      const boardMember = cardMemberFromPayload(member);
      if (boardMember) addBoardCardMember(qc, filters, cardId, boardMember);
      return;
    }
    case 'card.member_removed': {
      const cardId = cardIdFrom(envelope, payload);
      const { userId, role } = payload as { userId: string; role?: unknown };
      if (!cardId || !userId) return;
      setList<UserIdRow>(qc, filters.cardMembers?.(cardId), (data) =>
        applyCardMemberRemove(data, userId, role),
      );
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
      setList<IdRow>(qc, filters.boardLabels?.(boardId), (data) =>
        applyBoardLabelRemove(data, labelId),
      );
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
    case 'board.access_requested': {
      // DEM-154 — yeni erişim talebi. Admin'in açık board sayfasında "Talepler"
      // sekmesi + bekleyen-talep rozeti sayfa yenilemeden güncellensin diye
      // `board.accessRequests.list` invalidate edilir. Talep sahibi board
      // room'unda olmadığı için event yalnız admin'lere ulaşır.
      const boardId = boardIdFrom(envelope, payload);
      if (!boardId) return;
      invalidate(qc, filters.boardAccessRequests?.(boardId));
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
    case 'attachment.added': {
      // Faz 11D (DEM-150) — invalidate the card's `attachment.list` so the
      // "Ekler" tab shows the new file, and bump the board card's
      // `attachmentCount` so the paperclip meta chip stays in sync.
      const cardId = cardIdFrom(envelope, payload);
      if (!cardId) return;
      invalidate(qc, filters.attachments?.(cardId));
      bumpCardNumber(qc, filters, cardId, 'attachmentCount', 1);
      return;
    }
    case 'attachment.removed': {
      const cardId = cardIdFrom(envelope, payload);
      if (!cardId) return;
      invalidate(qc, filters.attachments?.(cardId));
      bumpCardNumber(qc, filters, cardId, 'attachmentCount', -1);
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
