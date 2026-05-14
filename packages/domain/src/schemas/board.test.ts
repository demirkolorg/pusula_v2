import { describe, expect, it } from 'vitest';
import {
  BOARD_BACKGROUND_GRADIENTS,
  CARD_COVER_COLORS,
} from '../constants';
import { boardBackgroundSchema, updateBoardInput } from './board';

describe('boardBackgroundSchema', () => {
  it('accepts null as the default board background', () => {
    expect(boardBackgroundSchema.parse(null)).toBeNull();
  });

  it('accepts every gradient preset with the gradient prefix', () => {
    for (const name of BOARD_BACKGROUND_GRADIENTS) {
      expect(boardBackgroundSchema.parse(`gradient:${name}`)).toBe(`gradient:${name}`);
    }
  });

  it('accepts every shared palette colour with the solid prefix', () => {
    for (const name of CARD_COVER_COLORS) {
      expect(boardBackgroundSchema.parse(`solid:${name}`)).toBe(`solid:${name}`);
    }
  });

  it('rejects unknown gradients, unknown palette colours and raw token names', () => {
    for (const value of [
      '',
      'sunset',
      'mavi',
      'gradient:',
      'gradient:unknown',
      'solid:',
      'solid:unknown',
      'url:https://example.test/bg.jpg',
      'gradient:sunset;',
    ]) {
      expect(boardBackgroundSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe('updateBoardInput background', () => {
  it('keeps background optional for title-only updates', () => {
    expect(updateBoardInput.parse({ boardId: 'board_1', title: 'Yeni pano' })).toEqual({
      boardId: 'board_1',
      title: 'Yeni pano',
    });
  });

  it('accepts set and clear background updates', () => {
    expect(updateBoardInput.parse({ boardId: 'board_1', background: 'gradient:ocean' })).toEqual({
      boardId: 'board_1',
      background: 'gradient:ocean',
    });

    expect(updateBoardInput.parse({ boardId: 'board_1', background: null })).toEqual({
      boardId: 'board_1',
      background: null,
    });
  });

  it('rejects invalid background formats in board updates', () => {
    expect(updateBoardInput.safeParse({ boardId: 'board_1', background: 'ocean' }).success).toBe(false);
  });
});
