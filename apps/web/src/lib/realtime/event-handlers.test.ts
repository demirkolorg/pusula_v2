/**
 * Realtime event dispatcher tests — Phase 5C (DEM-85).
 *
 * `dispatchRealtimeEvent` is the pure side of the realtime listener: given a
 * `QueryClient`, a board filter, and a `RealtimeEventEnvelope`, it routes the
 * envelope to the matching `board-cache` primitive and applies it through
 * `setQueriesData`. Unknown event types log a warning and skip (forward
 * compatibility — `apps/api` Faz 5B can publish new types before `apps/web`
 * learns to handle them).
 *
 * The 5B prompt has the matching server-side envelope shape; this suite pins
 * the client-side payload contract a step early so 5B can hit the same shape
 * when it implements producers. Spec: `08-web-ve-mobil.md` §8.1.10,
 * `05-board-mekanigi.md` §5.3.
 */
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeEventEnvelope } from '@pusula/domain';
import { dispatchRealtimeEvent } from './event-handlers';

// --- Fixture cache shape (mirrors `board.get` output) ---------------------

type FixCard = {
  id: string;
  listId: string;
  position: string;
  title: string;
  completed?: boolean;
  completedAt: Date | null;
  labels?: FixCardLabel[];
  checklistTotal?: number;
  checklistDone?: number;
  commentCount?: number;
  members?: FixMember[];
};
type FixList = {
  id: string;
  position: string;
  title: string;
  archivedAt: string | null;
  color: string | null;
  icon: string | null;
  iconColor: string | null;
};
type FixBoard = { id: string; title: string; version: number; archivedAt: string | null };
type FixCache = { board: FixBoard; lists: FixList[]; cards: FixCard[] };
type FixComment = { id: string; body: string; deletedAt: string | null };
type FixChecklistItem = {
  id: string;
  checklistId: string;
  position: string;
  content: string;
  completed: boolean;
  completedAt: string | null;
  completedBy: string | null;
};
type FixChecklist = { id: string; title: string; position: string; items: FixChecklistItem[] };
type FixCardLabel = { labelId: string; name: string; color: string };
type FixBoardLabel = { id: string; name: string; color: string };
type FixMember = { userId: string; role: string; name: string | null; inherited?: boolean };

const boardKey = (boardId: string) => ['board.get', { boardId }] as const;
const cardKey = (cardId: string) => ['card.get', { cardId }] as const;
const commentKey = (cardId: string) => ['comment.list', { cardId }] as const;
const checklistKey = (cardId: string) => ['checklist.list', { cardId }] as const;
const cardLabelsKey = (cardId: string) => ['card.labels.list', { cardId }] as const;
const cardMembersKey = (cardId: string) => ['card.members.list', { cardId }] as const;
const boardLabelsKey = (boardId: string) => ['label.list', { boardId }] as const;
const boardMembersKey = (boardId: string) => ['board.members.list', { boardId }] as const;
const boardInvitationsKey = (boardId: string) => ['board.invitations.list', { boardId }] as const;
const boardAccessRequestsKey = (boardId: string) =>
  ['board.accessRequests.list', { boardId }] as const;

const fixture = (): FixCache => ({
  board: { id: 'b1', title: 'Pano', version: 7, archivedAt: null },
  lists: [
    {
      id: 'L1',
      position: 'l0',
      title: 'Yapılacak',
      archivedAt: null,
      color: null,
      icon: null,
      iconColor: null,
    },
    {
      id: 'L2',
      position: 'l1',
      title: 'Bitti',
      archivedAt: null,
      color: null,
      icon: null,
      iconColor: null,
    },
  ],
  cards: [
    {
      id: 'c1',
      listId: 'L1',
      position: 'a0',
      title: 'bir',
      completedAt: null,
      labels: [{ labelId: 'l1', name: 'Bug', color: 'green' }],
      checklistTotal: 1,
      checklistDone: 0,
      commentCount: 1,
      members: [{ userId: 'u1', role: 'watcher', name: 'Ada' }],
    },
    {
      id: 'c2',
      listId: 'L1',
      position: 'a1',
      title: 'iki',
      completedAt: null,
      labels: [],
      members: [],
    },
    { id: 'c3', listId: 'L2', position: 'b0', title: 'üç', completedAt: null },
  ],
});

const envelope = <TPayload>(
  type: string,
  payload: TPayload,
  overrides: Partial<RealtimeEventEnvelope<TPayload>> = {},
): RealtimeEventEnvelope<TPayload> => ({
  id: 'evt_test',
  type,
  workspaceId: 'ws_1',
  boardId: 'b1',
  actorUserId: 'user_b',
  seq: 8,
  payload,
  createdAt: new Date().toISOString(),
  ...overrides,
});

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

const boardFilter = { queryKey: boardKey('b1') };

const makeFilters = () => ({
  board: boardFilter,
  card: (cardId: string) => ({ queryKey: cardKey(cardId) }),
  comments: (cardId: string) => ({ queryKey: commentKey(cardId) }),
  checklists: (cardId: string) => ({ queryKey: checklistKey(cardId) }),
  cardLabels: (cardId: string) => ({ queryKey: cardLabelsKey(cardId) }),
  cardMembers: (cardId: string) => ({ queryKey: cardMembersKey(cardId) }),
  boardLabels: (boardId: string) => ({ queryKey: boardLabelsKey(boardId) }),
  boardMembers: (boardId: string) => ({ queryKey: boardMembersKey(boardId) }),
  boardInvitations: (boardId: string) => ({ queryKey: boardInvitationsKey(boardId) }),
  boardAccessRequests: (boardId: string) => ({ queryKey: boardAccessRequestsKey(boardId) }),
});

describe('dispatchRealtimeEvent — board cache reconciliation', () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeClient();
    qc.setQueryData(boardKey('b1'), fixture());
    qc.setQueryData<FixComment[]>(commentKey('c1'), [{ id: 'cm1', body: 'old', deletedAt: null }]);
    qc.setQueryData<FixChecklist[]>(checklistKey('c1'), [
      {
        id: 'cl1',
        title: 'Checklist',
        position: 'a0',
        items: [
          {
            id: 'i1',
            checklistId: 'cl1',
            position: 'a0',
            content: 'one',
            completed: false,
            completedAt: null,
            completedBy: null,
          },
        ],
      },
    ]);
    qc.setQueryData<FixCardLabel[]>(cardLabelsKey('c1'), [
      { labelId: 'l1', name: 'Bug', color: 'green' },
    ]);
    qc.setQueryData<FixMember[]>(cardMembersKey('c1'), [
      { userId: 'u1', role: 'watcher', name: 'Ada' },
    ]);
    qc.setQueryData<FixBoardLabel[]>(boardLabelsKey('b1'), [
      { id: 'l1', name: 'Bug', color: 'green' },
    ]);
    qc.setQueryData<FixMember[]>(boardMembersKey('b1'), [
      { userId: 'u1', role: 'member', name: 'Ada', inherited: false },
    ]);
    qc.setQueryData(boardInvitationsKey('b1'), [
      { id: 'inv1', email: 'old@example.com', role: 'viewer' },
    ]);
  });

  afterEach(() => {
    qc.clear();
  });

  it('card.moved → re-parents the card and re-sorts', () => {
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('card.moved', {
        cardId: 'c1',
        fromListId: 'L1',
        toListId: 'L2',
        position: 'b0V',
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    const moved = next.cards.find((c) => c.id === 'c1')!;
    expect(moved.listId).toBe('L2');
    expect(moved.position).toBe('b0V');
  });

  it('card.moved accepts the compact producer toPosition field', () => {
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('card.moved', {
        cardId: 'c1',
        fromListId: 'L1',
        toListId: 'L2',
        fromPosition: 'a0',
        toPosition: 'b0V',
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    const moved = next.cards.find((c) => c.id === 'c1')!;
    expect(moved.listId).toBe('L2');
    expect(moved.position).toBe('b0V');
  });

  it('card.created → appends the card row and re-sorts', () => {
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('card.created', {
        card: {
          id: 'c4',
          listId: 'L2',
          position: 'b1',
          title: 'dört',
          completedAt: null,
        } satisfies FixCard,
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.cards.find((c) => c.id === 'c4')).toBeDefined();
  });

  it('card.created accepts the compact producer payload', () => {
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('card.created', {
        cardId: 'c4',
        listId: 'L2',
        title: 'dört',
        position: 'b1',
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.cards.find((c) => c.id === 'c4')).toMatchObject({
      id: 'c4',
      listId: 'L2',
      title: 'dört',
      position: 'b1',
    });
  });
  it('card.created with a malformed nested card payload leaves the cache untouched', () => {
    const before = qc.getQueryData<FixCache>(boardKey('b1'));

    expect(() =>
      dispatchRealtimeEvent(
        qc,
        { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
        envelope('card.created', {
          card: { id: 'c4' },
        }),
      ),
    ).not.toThrow();

    expect(qc.getQueryData<FixCache>(boardKey('b1'))).toBe(before);
  });

  it('card.created with a malformed nested card payload leaves the cache untouched', () => {
    const before = qc.getQueryData<FixCache>(boardKey('b1'));

    expect(() =>
      dispatchRealtimeEvent(
        qc,
        { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
        envelope('card.created', {
          card: { id: 'c4' },
        }),
      ),
    ).not.toThrow();

    expect(qc.getQueryData<FixCache>(boardKey('b1'))).toBe(before);
  });

  it('card.updated → shallow-patches the card by id', () => {
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('card.updated', {
        cardId: 'c1',
        patch: { title: 'birinci (yeni)' },
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.cards.find((c) => c.id === 'c1')!.title).toBe('birinci (yeni)');
  });

  // DEM-227 — kapak değişiminde server `realtimePatch`'e `coverImageUrl` koyar;
  // ikinci client'ta shallow-merge eski URL'i değil yeni presigned URL'i alır.
  it('card.updated → kapak değişiminde coverImageUrl/coverImage patch board cache\'ine işler', () => {
    qc.setQueryData(boardKey('b1'), {
      ...fixture(),
      cards: [
        {
          id: 'c1',
          listId: 'L1',
          position: 'a0',
          title: 'birinci',
          completedAt: null,
          coverImageAttachmentId: 'old-att',
          coverImage: { id: 'old-att' },
          coverImageUrl: 'https://signed/old.jpg?sig=eski',
        },
      ],
    });
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('card.updated', {
        cardId: 'c1',
        patch: {
          coverImageAttachmentId: 'new-att',
          coverImage: { id: 'new-att' },
          coverImageUrl: 'https://signed/new.jpg?sig=yeni',
        },
      }),
    );
    const patched = qc
      .getQueryData<{ cards: Record<string, unknown>[] }>(boardKey('b1'))!
      .cards.find((c) => c.id === 'c1')!;
    expect(patched.coverImageAttachmentId).toBe('new-att');
    expect(patched.coverImageUrl).toBe('https://signed/new.jpg?sig=yeni');
  });

  it('card.updated → kapak kaldırılınca coverImageUrl null olarak yamalanır', () => {
    qc.setQueryData(boardKey('b1'), {
      ...fixture(),
      cards: [
        {
          id: 'c1',
          listId: 'L1',
          position: 'a0',
          title: 'birinci',
          completedAt: null,
          coverImageAttachmentId: 'old-att',
          coverImage: { id: 'old-att' },
          coverImageUrl: 'https://signed/old.jpg?sig=eski',
        },
      ],
    });
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('card.updated', {
        cardId: 'c1',
        patch: { coverImageAttachmentId: null, coverImage: null, coverImageUrl: null },
      }),
    );
    const patched = qc
      .getQueryData<{ cards: Record<string, unknown>[] }>(boardKey('b1'))!
      .cards.find((c) => c.id === 'c1')!;
    expect(patched.coverImageAttachmentId).toBeNull();
    expect(patched.coverImageUrl).toBeNull();
  });

  it('card.updated with a malformed patch payload leaves board and card caches untouched', () => {
    qc.setQueryData(cardKey('c1'), { id: 'c1', title: 'bir', description: '' });
    const beforeBoard = qc.getQueryData<FixCache>(boardKey('b1'));
    const beforeDetail = qc.getQueryData<{ id: string; title: string; description: string }>(
      cardKey('c1'),
    );

    expect(() =>
      dispatchRealtimeEvent(
        qc,
        { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
        envelope('card.updated', {
          cardId: 'c1',
        }),
      ),
    ).not.toThrow();

    expect(qc.getQueryData<FixCache>(boardKey('b1'))).toBe(beforeBoard);
    expect(qc.getQueryData(cardKey('c1'))).toBe(beforeDetail);
  });

  it('card.updated with a malformed patch payload leaves board and card caches untouched', () => {
    qc.setQueryData(cardKey('c1'), { id: 'c1', title: 'bir', description: '' });
    const beforeBoard = qc.getQueryData<FixCache>(boardKey('b1'));
    const beforeDetail = qc.getQueryData<{ id: string; title: string; description: string }>(
      cardKey('c1'),
    );

    expect(() =>
      dispatchRealtimeEvent(
        qc,
        { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
        envelope('card.updated', {
          cardId: 'c1',
        }),
      ),
    ).not.toThrow();

    expect(qc.getQueryData<FixCache>(boardKey('b1'))).toBe(beforeBoard);
    expect(qc.getQueryData(cardKey('c1'))).toBe(beforeDetail);
  });

  it('card.archived → removes the card from the active set', () => {
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('card.archived', { cardId: 'c2' }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.cards.find((c) => c.id === 'c2')).toBeUndefined();
  });

  it('card.completed → patches completed + completedAt on the card', () => {
    const completedAt = '2026-05-13T10:00:00.000Z';
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('card.completed', {
        cardId: 'c1',
        completedAt,
      }),
    );
    const card = qc.getQueryData<FixCache>(boardKey('b1'))!.cards.find((c) => c.id === 'c1')!;
    // Producer ships ISO-8601; dispatcher reifies to `Date` (matches the
    // tRPC + superjson cache shape).
    expect(card.completedAt).toEqual(new Date(completedAt));
    // Regresyon (DEM-222): kart yüzü `completed` boolean'ını okur — yalnız
    // `completedAt` yamanırsa diğer kullanıcı tamamlanmayı görmez.
    expect(card.completed).toBe(true);
  });

  it('card.uncompleted → clears completed + completedAt on the card', () => {
    qc.setQueryData(boardKey('b1'), {
      ...fixture(),
      cards: fixture().cards.map((c) =>
        c.id === 'c1'
          ? { ...c, completed: true, completedAt: new Date('2026-05-13T10:00:00.000Z') }
          : c,
      ),
    });
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('card.uncompleted', { cardId: 'c1' }),
    );
    const card = qc.getQueryData<FixCache>(boardKey('b1'))!.cards.find((c) => c.id === 'c1')!;
    expect(card.completedAt).toBeNull();
    // Regresyon (DEM-222): `completed` boolean'ı da false'a dönmeli.
    expect(card.completed).toBe(false);
  });

  // DEM-223: kart detay modalı `card.get` cache'inden (`{ card, relations }`)
  // okur; realtime patch'i `.card`'a inmeli. Aşağıdaki testler patchCardDetail'in
  // doğru nesting katmanına yazdığını doğrular (önceki testler yalnız board
  // cache'ine baktığı için bu katmanı kaçırmıştı).
  it('card.completed → patches the open card-detail modal cache (.card)', () => {
    qc.setQueryData(cardKey('c1'), {
      card: { id: 'c1', title: 'bir', completed: false, completedAt: null, archivedAt: null },
      relations: {},
    });
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('card.completed', { cardId: 'c1', completedAt: '2026-05-13T10:00:00.000Z' }),
    );
    const detail = qc.getQueryData<{ card: { completed: boolean; completedAt: Date | null } }>(
      cardKey('c1'),
    )!;
    expect(detail.card.completed).toBe(true);
    expect(detail.card.completedAt).toEqual(new Date('2026-05-13T10:00:00.000Z'));
  });

  it('card.uncompleted → clears completion on the open card-detail modal cache', () => {
    qc.setQueryData(cardKey('c1'), {
      card: {
        id: 'c1',
        title: 'bir',
        completed: true,
        completedAt: new Date('2026-05-13T10:00:00.000Z'),
        archivedAt: null,
      },
      relations: {},
    });
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('card.uncompleted', { cardId: 'c1' }),
    );
    const detail = qc.getQueryData<{ card: { completed: boolean; completedAt: Date | null } }>(
      cardKey('c1'),
    )!;
    expect(detail.card.completed).toBe(false);
    expect(detail.card.completedAt).toBeNull();
  });

  it('card.updated → patches the open card-detail modal cache (.card)', () => {
    qc.setQueryData(cardKey('c1'), { card: { id: 'c1', title: 'bir' }, relations: {} });
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('card.updated', { cardId: 'c1', patch: { title: 'birinci (yeni)' } }),
    );
    const detail = qc.getQueryData<{ card: { title: string } }>(cardKey('c1'))!;
    expect(detail.card.title).toBe('birinci (yeni)');
  });

  it('card.archived → invalidates the card-detail modal query', () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    dispatchRealtimeEvent(qc, makeFilters(), envelope('card.archived', { cardId: 'c1', archived: true }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: cardKey('c1') });
  });

  it('list.moved → re-positions the list', () => {
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('list.moved', {
        listId: 'L1',
        position: 'l2',
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.lists.find((l) => l.id === 'L1')!.position).toBe('l2');
  });

  it('list.moved accepts the compact producer toPosition field', () => {
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('list.moved', {
        listId: 'L1',
        fromPosition: 'l0',
        toPosition: 'l2',
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.lists.find((l) => l.id === 'L1')!.position).toBe('l2');
  });

  it('list.created → appends and re-sorts', () => {
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('list.created', {
        list: {
          id: 'L3',
          position: 'l2',
          title: 'Yeni liste',
          archivedAt: null,
          color: null,
          icon: null,
          iconColor: null,
        } satisfies FixList,
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.lists.find((l) => l.id === 'L3')).toBeDefined();
  });

  it('list.created accepts the compact producer payload', () => {
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('list.created', {
        listId: 'L3',
        title: 'Yeni liste',
        position: 'l2',
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.lists.find((l) => l.id === 'L3')).toMatchObject({
      id: 'L3',
      title: 'Yeni liste',
      position: 'l2',
      archivedAt: null,
    });
  });

  it('list.updated → shallow-patches the list', () => {
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('list.updated', {
        listId: 'L1',
        patch: { title: 'YENİ İSİM' },
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.lists.find((l) => l.id === 'L1')!.title).toBe('YENİ İSİM');
  });

  it('list.updated with color field → patches the list colour', () => {
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('list.updated', {
        listId: 'L1',
        color: 'yesil',
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.lists.find((l) => l.id === 'L1')!.color).toBe('yesil');
  });

  it('list.updated with color:null → clears the list colour', () => {
    qc.setQueryData(boardKey('b1'), {
      ...fixture(),
      lists: fixture().lists.map((l) => (l.id === 'L1' ? { ...l, color: 'mor' } : l)),
    });
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('list.updated', {
        listId: 'L1',
        color: null,
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.lists.find((l) => l.id === 'L1')!.color).toBeNull();
  });

  it('list.updated with icon fields → patches the list icon and icon colour', () => {
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('list.updated', {
        listId: 'L1',
        icon: 'star',
        iconColor: 'mavi',
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.lists.find((l) => l.id === 'L1')).toMatchObject({
      icon: 'star',
      iconColor: 'mavi',
    });
  });

  it('list.updated with icon:null → clears icon and icon colour', () => {
    qc.setQueryData(boardKey('b1'), {
      ...fixture(),
      lists: fixture().lists.map((l) =>
        l.id === 'L1' ? { ...l, icon: 'rocket', iconColor: 'mor' } : l,
      ),
    });
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('list.updated', {
        listId: 'L1',
        icon: null,
        iconColor: null,
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.lists.find((l) => l.id === 'L1')).toMatchObject({
      icon: null,
      iconColor: null,
    });
  });

  it('list.archived → stamps archivedAt without removing the list', () => {
    const archivedAt = '2026-05-13T11:00:00.000Z';
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('list.archived', {
        listId: 'L1',
        archivedAt,
      }),
    );
    const next = qc.getQueryData<FixCache>(boardFilter.queryKey)!;
    const archived = next.lists.find((l) => l.id === 'L1')!;
    expect(archived.archivedAt).toBe(archivedAt);
  });

  it('list.archived accepts the compact producer archived flag', () => {
    const createdAt = '2026-05-13T11:00:00.000Z';
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope(
        'list.archived',
        {
          listId: 'L1',
          archived: true,
        },
        { createdAt },
      ),
    );
    const next = qc.getQueryData<FixCache>(boardFilter.queryKey)!;
    expect(next.lists.find((l) => l.id === 'L1')!.archivedAt).toBe(createdAt);
  });

  it('board.updated → patches the board node', () => {
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('board.updated', {
        patch: { title: 'Yeni pano adı' },
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.board.title).toBe('Yeni pano adı');
  });

  it('board.archived → stamps board.archivedAt', () => {
    const archivedAt = '2026-05-13T11:00:00.000Z';
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('board.archived', { archivedAt }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.board.archivedAt).toBe(archivedAt);
  });

  it('board.archived accepts the compact producer archived flag', () => {
    const createdAt = '2026-05-13T11:00:00.000Z';
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('board.archived', { boardId: 'b1', archived: true }, { createdAt }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.board.archivedAt).toBe(createdAt);
  });

  it('unknown event type → warns and leaves the cache untouched', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = qc.getQueryData<FixCache>(boardKey('b1'));
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('card.unknown_type_future', { foo: 'bar' }),
    );
    const after = qc.getQueryData<FixCache>(boardKey('b1'));
    expect(after).toBe(before);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('comment.created -> prepends the comment list cache', () => {
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope(
        'comment.created',
        {
          commentId: 'cm2',
          comment: { id: 'cm2', body: 'new', deletedAt: null } satisfies FixComment,
        },
        { cardId: 'c1' },
      ),
    );
    expect(qc.getQueryData<FixComment[]>(commentKey('c1'))?.map((c) => c.id)).toEqual([
      'cm2',
      'cm1',
    ]);
    expect(
      qc.getQueryData<FixCache>(boardKey('b1'))?.cards.find((c) => c.id === 'c1')?.commentCount,
    ).toBe(2);
  });

  it('comment.updated -> patches the comment list cache', () => {
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope(
        'comment.updated',
        { commentId: 'cm1', patch: { body: 'edited' } },
        { cardId: 'c1' },
      ),
    );
    expect(qc.getQueryData<FixComment[]>(commentKey('c1'))?.[0]?.body).toBe('edited');
  });

  it('comment.deleted -> soft-deletes the comment in cache', () => {
    const deletedAt = '2026-05-13T10:00:00.000Z';
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope('comment.deleted', { commentId: 'cm1', deletedAt }, { cardId: 'c1' }),
    );
    expect(qc.getQueryData<FixComment[]>(commentKey('c1'))?.[0]?.deletedAt).toBe(deletedAt);
    expect(
      qc.getQueryData<FixCache>(boardKey('b1'))?.cards.find((c) => c.id === 'c1')?.commentCount,
    ).toBe(0);
  });

  it('comment.mentioned -> no-op cache path', () => {
    const before = qc.getQueryData<FixComment[]>(commentKey('c1'));
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope(
        'comment.mentioned',
        { commentId: 'cm1', mentionedUserId: 'u2', actorUserId: 'u1' },
        { cardId: 'c1' },
      ),
    );
    expect(qc.getQueryData<FixComment[]>(commentKey('c1'))).toBe(before);
  });

  it('checklist.created -> appends the checklist cache', () => {
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope(
        'checklist.created',
        {
          checklistId: 'cl2',
          checklist: { id: 'cl2', title: 'Second', position: 'a1', items: [] },
        },
        { cardId: 'c1' },
      ),
    );
    expect(qc.getQueryData<FixChecklist[]>(checklistKey('c1'))?.map((c) => c.id)).toEqual([
      'cl1',
      'cl2',
    ]);
  });

  it('checklist.updated -> patches the checklist cache', () => {
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope(
        'checklist.updated',
        { checklistId: 'cl1', patch: { title: 'Updated' } },
        { cardId: 'c1' },
      ),
    );
    expect(qc.getQueryData<FixChecklist[]>(checklistKey('c1'))?.[0]?.title).toBe('Updated');
  });

  it('checklist.deleted -> removes the checklist from cache', () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope('checklist.deleted', { checklistId: 'cl1' }, { cardId: 'c1' }),
    );
    expect(qc.getQueryData<FixChecklist[]>(checklistKey('c1'))).toEqual([]);
    expect(invalidate).toHaveBeenCalledWith(boardFilter);
  });

  it('checklist.item_added -> appends the nested item cache', () => {
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope(
        'checklist.item_added',
        {
          checklistId: 'cl1',
          itemId: 'i2',
          item: {
            id: 'i2',
            checklistId: 'cl1',
            position: 'a1',
            content: 'two',
            completed: false,
            completedAt: null,
            completedBy: null,
          } satisfies FixChecklistItem,
        },
        { cardId: 'c1' },
      ),
    );
    expect(
      qc.getQueryData<FixChecklist[]>(checklistKey('c1'))?.[0]?.items.map((i) => i.id),
    ).toEqual(['i1', 'i2']);
    expect(
      qc.getQueryData<FixCache>(boardKey('b1'))?.cards.find((c) => c.id === 'c1')?.checklistTotal,
    ).toBe(2);
  });

  it('checklist.item_updated -> patches the nested item cache', () => {
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope(
        'checklist.item_updated',
        { checklistId: 'cl1', itemId: 'i1', patch: { content: 'edited item' } },
        { cardId: 'c1' },
      ),
    );
    expect(qc.getQueryData<FixChecklist[]>(checklistKey('c1'))?.[0]?.items[0]?.content).toBe(
      'edited item',
    );
  });

  it('checklist.item_toggled -> patches completion fields', () => {
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope(
        'checklist.item_toggled',
        {
          checklistId: 'cl1',
          itemId: 'i1',
          completed: true,
          completedBy: 'u1',
          patch: { completed: true, completedAt: '2026-05-13T10:00:00.000Z', completedBy: 'u1' },
        },
        { cardId: 'c1' },
      ),
    );
    expect(qc.getQueryData<FixChecklist[]>(checklistKey('c1'))?.[0]?.items[0]).toMatchObject({
      completed: true,
      completedBy: 'u1',
    });
    expect(
      qc.getQueryData<FixCache>(boardKey('b1'))?.cards.find((c) => c.id === 'c1')?.checklistDone,
    ).toBe(1);
  });

  it('checklist.item_deleted -> removes the nested item cache', () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope('checklist.item_deleted', { checklistId: 'cl1', itemId: 'i1' }, { cardId: 'c1' }),
    );
    expect(qc.getQueryData<FixChecklist[]>(checklistKey('c1'))?.[0]?.items).toEqual([]);
    expect(invalidate).toHaveBeenCalledWith(boardFilter);
  });

  it('card.label_added -> appends card labels', () => {
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope(
        'card.label_added',
        {
          cardId: 'c1',
          labelId: 'l2',
          label: { labelId: 'l2', name: 'Ops', color: 'blue' } satisfies FixCardLabel,
        },
        { cardId: 'c1' },
      ),
    );
    expect(qc.getQueryData<FixCardLabel[]>(cardLabelsKey('c1'))?.map((l) => l.labelId)).toEqual([
      'l1',
      'l2',
    ]);
    expect(
      qc
        .getQueryData<FixCache>(boardKey('b1'))
        ?.cards.find((c) => c.id === 'c1')
        ?.labels?.map((l) => l.labelId),
    ).toEqual(['l1', 'l2']);
  });

  it('card.label_removed -> removes card labels', () => {
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope('card.label_removed', { cardId: 'c1', labelId: 'l1' }, { cardId: 'c1' }),
    );
    expect(qc.getQueryData<FixCardLabel[]>(cardLabelsKey('c1'))).toEqual([]);
    expect(
      qc.getQueryData<FixCache>(boardKey('b1'))?.cards.find((c) => c.id === 'c1')?.labels,
    ).toEqual([]);
  });

  it('card.member_added -> appends card members', () => {
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope(
        'card.member_added',
        {
          cardId: 'c1',
          userId: 'u2',
          role: 'assignee',
          member: { userId: 'u2', role: 'assignee', name: 'Bora' } satisfies FixMember,
        },
        { cardId: 'c1' },
      ),
    );
    expect(qc.getQueryData<FixMember[]>(cardMembersKey('c1'))?.map((m) => m.userId)).toEqual([
      'u1',
      'u2',
    ]);
    expect(
      qc
        .getQueryData<FixCache>(boardKey('b1'))
        ?.cards.find((c) => c.id === 'c1')
        ?.members?.map((m) => m.userId),
    ).toEqual(['u1', 'u2']);
  });

  it('card.member_added -> preserves distinct roles for the same user', () => {
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope(
        'card.member_added',
        {
          cardId: 'c1',
          userId: 'u1',
          role: 'assignee',
          member: { userId: 'u1', role: 'assignee', name: 'Ada' } satisfies FixMember,
        },
        { cardId: 'c1' },
      ),
    );
    expect(qc.getQueryData<FixMember[]>(cardMembersKey('c1'))?.map((m) => m.role)).toEqual([
      'watcher',
      'assignee',
    ]);
    expect(
      qc
        .getQueryData<FixCache>(boardKey('b1'))
        ?.cards.find((c) => c.id === 'c1')
        ?.members?.map((m) => m.role),
    ).toEqual(['watcher', 'assignee']);
  });

  it('card.member_removed -> removes only the matching user role', () => {
    qc.setQueryData<FixMember[]>(cardMembersKey('c1'), [
      { userId: 'u1', role: 'watcher', name: 'Ada' },
      { userId: 'u1', role: 'assignee', name: 'Ada' },
    ]);
    qc.setQueryData(boardKey('b1'), {
      ...fixture(),
      cards: fixture().cards.map((card) =>
        card.id === 'c1'
          ? {
              ...card,
              members: [
                { userId: 'u1', role: 'watcher', name: 'Ada' },
                { userId: 'u1', role: 'assignee', name: 'Ada' },
              ],
            }
          : card,
      ),
    });
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope(
        'card.member_removed',
        { cardId: 'c1', userId: 'u1', role: 'watcher' },
        { cardId: 'c1' },
      ),
    );
    expect(qc.getQueryData<FixMember[]>(cardMembersKey('c1'))?.map((m) => m.role)).toEqual([
      'assignee',
    ]);
    expect(
      qc
        .getQueryData<FixCache>(boardKey('b1'))
        ?.cards.find((c) => c.id === 'c1')
        ?.members?.map((m) => m.role),
    ).toEqual(['assignee']);
  });

  it('board.label_created -> appends board labels', () => {
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope('board.label_created', {
        labelId: 'l2',
        label: { id: 'l2', name: 'Ops', color: 'blue' } satisfies FixBoardLabel,
      }),
    );
    expect(qc.getQueryData<FixBoardLabel[]>(boardLabelsKey('b1'))?.map((l) => l.id)).toEqual([
      'l1',
      'l2',
    ]);
  });

  it('board.label_updated -> patches board labels', () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope('board.label_updated', {
        labelId: 'l1',
        label: { id: 'l1', name: 'Bug', color: 'red' } satisfies FixBoardLabel,
      }),
    );
    expect(qc.getQueryData<FixBoardLabel[]>(boardLabelsKey('b1'))?.[0]?.color).toBe('red');
    expect(
      qc.getQueryData<FixCache>(boardKey('b1'))?.cards.find((c) => c.id === 'c1')?.labels?.[0]
        ?.color,
    ).toBe('red');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: cardLabelsKey('c1') });
  });

  it('board.label_deleted -> removes board labels', () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    dispatchRealtimeEvent(qc, makeFilters(), envelope('board.label_deleted', { labelId: 'l1' }));
    expect(qc.getQueryData<FixBoardLabel[]>(boardLabelsKey('b1'))).toEqual([]);
    expect(
      qc.getQueryData<FixCache>(boardKey('b1'))?.cards.find((c) => c.id === 'c1')?.labels,
    ).toEqual([]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: cardLabelsKey('c1') });
  });

  it('board.member_invited -> invalidates board member and invitation caches', () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope('board.member_invited', {
        invitationId: 'inv2',
        email: 'new@example.com',
        role: 'viewer',
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: boardMembersKey('b1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: boardInvitationsKey('b1') });
  });

  it('board.invitation_accepted -> invalidates board member and invitation caches', () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope('board.invitation_accepted', { invitationId: 'inv1', userId: 'u2' }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: boardMembersKey('b1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: boardInvitationsKey('b1') });
  });

  it('board.invitation_declined -> invalidates board member and invitation caches', () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope('board.invitation_declined', { invitationId: 'inv1' }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: boardMembersKey('b1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: boardInvitationsKey('b1') });
  });

  it('board.invitation_revoked -> invalidates board member and invitation caches', () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope('board.invitation_revoked', { invitationId: 'inv1' }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: boardMembersKey('b1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: boardInvitationsKey('b1') });
  });

  it('board.member_added -> invalidates board members cache', () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope('board.member_added', {
        userId: 'u2',
        role: 'viewer',
        member: {
          userId: 'u2',
          role: 'viewer',
          name: 'Bora',
          inherited: false,
        } satisfies FixMember,
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: boardMembersKey('b1') });
    expect(invalidate).toHaveBeenCalledWith(boardFilter);
  });

  it('board.member_role_changed -> invalidates board members cache', () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope('board.member_role_changed', { userId: 'u1', oldRole: 'member', newRole: 'admin' }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: boardMembersKey('b1') });
    expect(invalidate).toHaveBeenCalledWith(boardFilter);
  });

  it('board.member_removed -> invalidates board members cache', () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    dispatchRealtimeEvent(qc, makeFilters(), envelope('board.member_removed', { userId: 'u1' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: boardMembersKey('b1') });
    expect(invalidate).toHaveBeenCalledWith(boardFilter);
  });

  it('board.access_requested -> invalidates board access requests cache', () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    dispatchRealtimeEvent(
      qc,
      makeFilters(),
      envelope('board.access_requested', { accessRequestId: 'req1' }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: boardAccessRequestsKey('b1') });
  });
});
