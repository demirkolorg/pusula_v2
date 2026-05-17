import { describe, expect, it } from 'vitest';
import { setBoardFavoriteInput } from './board-favorite';

describe('setBoardFavoriteInput', () => {
  it('parses a valid favorite request', () => {
    expect(setBoardFavoriteInput.parse({ boardId: 'board_1', favorited: true })).toEqual({
      boardId: 'board_1',
      favorited: true,
    });
  });

  it('parses an un-favorite request', () => {
    expect(setBoardFavoriteInput.parse({ boardId: 'board_1', favorited: false })).toEqual({
      boardId: 'board_1',
      favorited: false,
    });
  });

  it('keeps clientMutationId optional but accepts a UUID when present', () => {
    const clientMutationId = '11111111-1111-4111-8111-111111111111';
    expect(
      setBoardFavoriteInput.parse({ boardId: 'board_1', favorited: true, clientMutationId }),
    ).toEqual({ boardId: 'board_1', favorited: true, clientMutationId });
  });

  it('rejects a missing `favorited` flag', () => {
    expect(setBoardFavoriteInput.safeParse({ boardId: 'board_1' }).success).toBe(false);
  });

  it('rejects a non-boolean `favorited` flag', () => {
    expect(
      setBoardFavoriteInput.safeParse({ boardId: 'board_1', favorited: 'yes' }).success,
    ).toBe(false);
  });

  it('rejects an empty `boardId`', () => {
    expect(setBoardFavoriteInput.safeParse({ boardId: '', favorited: true }).success).toBe(false);
  });

  it('rejects a non-string `boardId`', () => {
    expect(setBoardFavoriteInput.safeParse({ boardId: 123, favorited: true }).success).toBe(false);
  });
});
