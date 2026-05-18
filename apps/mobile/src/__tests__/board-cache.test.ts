import { describe, expect, it } from 'vitest';
import {
  addOptimisticCard,
  addOptimisticList,
  archiveListInCache,
  moveCardInCache,
  renameCardInCache,
  renameListInCache,
  replaceOptimisticCard,
  replaceOptimisticList,
  setCardCoverImageInCache,
  type BoardCard,
  type BoardData,
  type BoardList,
} from '../lib/board-cache';

/** Faz 7H — `board.get` optimistic cache dönüşümleri saf-fonksiyon birim testleri. */

const now = new Date('2026-05-18T00:00:00.000Z');

function makeCard(
  over: Partial<BoardCard> & { id: string; listId: string; position: string },
): BoardCard {
  return {
    boardId: 'board-1',
    title: 'Kart',
    description: null,
    dueAt: null,
    completed: false,
    completedAt: null,
    completedBy: null,
    coverColor: null,
    coverImageAttachmentId: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    labels: [],
    checklistTotal: 0,
    checklistDone: 0,
    commentCount: 0,
    attachmentCount: 0,
    members: [],
    coverImage: null,
    ...over,
  };
}

function makeList(over: Partial<BoardList> & { id: string; position: string }): BoardList {
  return {
    title: 'Liste',
    color: null,
    icon: null,
    iconColor: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function makeBoard(lists: BoardList[], cards: BoardCard[]): BoardData {
  return {
    board: { id: 'board-1' } as BoardData['board'],
    lists,
    cards,
  };
}

describe('addOptimisticCard', () => {
  it('kartı listenin sonuna geçici id ile ekler', () => {
    const board = makeBoard(
      [makeList({ id: 'list-1', position: 'a0' })],
      [makeCard({ id: 'c1', listId: 'list-1', position: 'a0' })],
    );
    const next = addOptimisticCard(board, { listId: 'list-1', tempId: 'tmp-1', title: 'Yeni' });
    expect(next.cards).toHaveLength(2);
    const added = next.cards.at(-1);
    expect(added?.id).toBe('tmp-1');
    expect(added?.title).toBe('Yeni');
    expect(added?.listId).toBe('list-1');
    expect(added?.boardId).toBe('board-1');
    // Pozisyon mevcut son karttan büyük (fractional string sırası).
    expect(added && added.position > 'a0').toBe(true);
  });

  it('boş listeye eklenen kart firstPosition alır ve kaynağı mutasyona uğratmaz', () => {
    const board = makeBoard([makeList({ id: 'list-1', position: 'a0' })], []);
    const next = addOptimisticCard(board, { listId: 'list-1', tempId: 'tmp-1', title: 'İlk' });
    expect(next.cards).toHaveLength(1);
    expect(next.cards[0]?.position).toBeTruthy();
    expect(board.cards).toHaveLength(0); // immutability
  });
});

describe('replaceOptimisticCard', () => {
  it('geçici kartı gerçek kartla değiştirir, aggregate alanları sıfırlar', () => {
    const board = makeBoard(
      [makeList({ id: 'list-1', position: 'a0' })],
      [makeCard({ id: 'tmp-1', listId: 'list-1', position: 'a1', title: 'Geçici' })],
    );
    const real = {
      id: 'card-real',
      boardId: 'board-1',
      listId: 'list-1',
      title: 'Geçici',
      description: null,
      position: 'a1',
      dueAt: null,
      completed: false,
      completedAt: null,
      completedBy: null,
      coverColor: null,
      coverImageAttachmentId: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const next = replaceOptimisticCard(board, 'tmp-1', real);
    const card = next.cards[0];
    expect(card?.id).toBe('card-real');
    expect(card?.checklistTotal).toBe(0);
    expect(card?.members).toEqual([]);
    expect(card?.coverImage).toBeNull();
  });
});

describe('addOptimisticList / replaceOptimisticList', () => {
  it('listeyi board şeridinin sonuna ekler', () => {
    const board = makeBoard([makeList({ id: 'list-1', position: 'a0' })], []);
    const next = addOptimisticList(board, { tempId: 'tmp-l', title: 'Yeni Liste' });
    expect(next.lists).toHaveLength(2);
    const added = next.lists.at(-1);
    expect(added?.id).toBe('tmp-l');
    expect(added?.title).toBe('Yeni Liste');
    expect(added && added.position > 'a0').toBe(true);
  });

  it('geçici listeyi gerçek listeyle değiştirir', () => {
    const board = makeBoard([makeList({ id: 'tmp-l', position: 'a1', title: 'Geçici' })], []);
    const real = {
      id: 'list-real',
      boardId: 'board-1',
      title: 'Geçici',
      color: null,
      icon: null,
      iconColor: null,
      position: 'a1',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const next = replaceOptimisticList(board, 'tmp-l', real);
    expect(next.lists[0]?.id).toBe('list-real');
  });
});

describe('renameListInCache', () => {
  it('yalnızca hedef listenin başlığını değiştirir', () => {
    const board = makeBoard(
      [
        makeList({ id: 'list-1', position: 'a0', title: 'Eski' }),
        makeList({ id: 'list-2', position: 'a1', title: 'Diğer' }),
      ],
      [],
    );
    const next = renameListInCache(board, 'list-1', 'Yeni Ad');
    expect(next.lists[0]?.title).toBe('Yeni Ad');
    expect(next.lists[1]?.title).toBe('Diğer');
  });
});

describe('renameCardInCache', () => {
  it('yalnızca hedef kartın başlığını değiştirir', () => {
    const board = makeBoard(
      [makeList({ id: 'list-1', position: 'a0' })],
      [
        makeCard({ id: 'c1', listId: 'list-1', position: 'a0', title: 'Eski' }),
        makeCard({ id: 'c2', listId: 'list-1', position: 'a1', title: 'Diğer' }),
      ],
    );
    const next = renameCardInCache(board, 'c1', 'Yeni Başlık');
    expect(next.cards.find((card) => card.id === 'c1')?.title).toBe('Yeni Başlık');
    expect(next.cards.find((card) => card.id === 'c2')?.title).toBe('Diğer');
    expect(board.cards[0]?.title).toBe('Eski'); // immutability
  });
});

describe('archiveListInCache', () => {
  it('hedef listenin archivedAt değerini set eder', () => {
    const board = makeBoard([makeList({ id: 'list-1', position: 'a0' })], []);
    const next = archiveListInCache(board, 'list-1');
    expect(next.lists[0]?.archivedAt).toBeInstanceOf(Date);
  });
});

describe('moveCardInCache', () => {
  it('kartı hedef listenin sonuna taşır', () => {
    const board = makeBoard(
      [
        makeList({ id: 'list-1', position: 'a0' }),
        makeList({ id: 'list-2', position: 'a1' }),
      ],
      [
        makeCard({ id: 'c1', listId: 'list-1', position: 'a0' }),
        makeCard({ id: 'c2', listId: 'list-2', position: 'a0' }),
      ],
    );
    const next = moveCardInCache(board, 'c1', 'list-2');
    const moved = next.cards.find((card) => card.id === 'c1');
    expect(moved?.listId).toBe('list-2');
    // Hedef listedeki mevcut karttan büyük pozisyon → kolon sonunda görünür.
    expect(moved && moved.position > 'a0').toBe(true);
    expect(next.cards.at(-1)?.id).toBe('c1');
  });

  it('bilinmeyen kart id → veri değişmeden döner', () => {
    const board = makeBoard([makeList({ id: 'list-1', position: 'a0' })], []);
    expect(moveCardInCache(board, 'yok', 'list-1')).toBe(board);
  });
});

describe('setCardCoverImageInCache', () => {
  const cover = {
    attachmentId: 'att-1',
    fileName: 'kapak.png',
    mimeType: 'image/png',
    size: 1024,
  };

  it('hedef kartın kapak görselini ve ham id alanını set eder', () => {
    const board = makeBoard(
      [makeList({ id: 'list-1', position: 'a0' })],
      [
        makeCard({ id: 'c1', listId: 'list-1', position: 'a0' }),
        makeCard({ id: 'c2', listId: 'list-1', position: 'a1' }),
      ],
    );
    const next = setCardCoverImageInCache(board, 'c1', cover);
    const c1 = next.cards.find((card) => card.id === 'c1');
    expect(c1?.coverImage).toEqual(cover);
    expect(c1?.coverImageAttachmentId).toBe('att-1');
    // Diğer kart dokunulmaz.
    expect(next.cards.find((card) => card.id === 'c2')?.coverImage).toBeNull();
    // İmmutability — kaynak değişmez.
    expect(board.cards[0]?.coverImage).toBeNull();
  });

  it('bilinmeyen cardId → hiçbir kartın kapağı değişmez', () => {
    const board = makeBoard(
      [makeList({ id: 'list-1', position: 'a0' })],
      [makeCard({ id: 'c1', listId: 'list-1', position: 'a0' })],
    );
    const next = setCardCoverImageInCache(board, 'yok', cover);
    expect(next.cards.find((card) => card.id === 'c1')?.coverImage).toBeNull();
  });

  it('null kapak hem coverImage hem coverImageAttachmentId alanını temizler', () => {
    const board = makeBoard(
      [makeList({ id: 'list-1', position: 'a0' })],
      [
        makeCard({
          id: 'c1',
          listId: 'list-1',
          position: 'a0',
          coverImage: cover,
          coverImageAttachmentId: 'att-1',
        }),
      ],
    );
    const next = setCardCoverImageInCache(board, 'c1', null);
    const c1 = next.cards.find((card) => card.id === 'c1');
    expect(c1?.coverImage).toBeNull();
    expect(c1?.coverImageAttachmentId).toBeNull();
  });
});
