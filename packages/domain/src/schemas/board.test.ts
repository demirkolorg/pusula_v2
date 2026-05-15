import { describe, expect, it } from 'vitest';
import { BOARD_BACKGROUND_GRADIENTS, CARD_COVER_COLORS } from '../constants';
import { boardBackgroundSchema, createBoardInput, updateBoardInput } from './board';

describe('boardBackgroundSchema', () => {
  it('accepts null as the default board background', () => {
    expect(boardBackgroundSchema.parse(null)).toBeNull();
  });

  it('accepts every gradient preset with the gradient prefix', () => {
    for (const name of BOARD_BACKGROUND_GRADIENTS) {
      expect(boardBackgroundSchema.parse(`gradient:${name}`)).toBe(`gradient:${name}`);
    }
  });

  it('accepts the expanded board gradient presets', () => {
    expect(boardBackgroundSchema.parse('gradient:lagoon')).toBe('gradient:lagoon');
  });

  it('accepts every shared palette colour with the solid prefix', () => {
    for (const name of CARD_COVER_COLORS) {
      expect(boardBackgroundSchema.parse(`solid:${name}`)).toBe(`solid:${name}`);
    }
  });

  it('accepts board-only white solid backgrounds', () => {
    expect(boardBackgroundSchema.parse('solid:beyaz')).toBe('solid:beyaz');
    expect(boardBackgroundSchema.parse('solid:kirik-beyaz')).toBe('solid:kirik-beyaz');
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
    expect(updateBoardInput.safeParse({ boardId: 'board_1', background: 'ocean' }).success).toBe(
      false,
    );
  });
});

describe('board icon inputs', () => {
  it('defaults new boards to the layout-grid icon', () => {
    expect(createBoardInput.parse({ workspaceId: 'workspace_1', title: 'Yol Haritası' })).toEqual({
      workspaceId: 'workspace_1',
      title: 'Yol Haritası',
      icon: 'layout-grid',
    });
  });

  it('accepts selected icons while creating or updating a board', () => {
    expect(
      createBoardInput.parse({ workspaceId: 'workspace_1', title: 'Yol Haritası', icon: 'rocket' }),
    ).toEqual({
      workspaceId: 'workspace_1',
      title: 'Yol Haritası',
      icon: 'rocket',
    });

    expect(updateBoardInput.parse({ boardId: 'board_1', icon: 'target' })).toEqual({
      boardId: 'board_1',
      icon: 'target',
    });
  });

  it('rejects unknown board icons instead of silently stripping them', () => {
    expect(
      createBoardInput.safeParse({
        workspaceId: 'workspace_1',
        title: 'Yol Haritası',
        icon: 'unknown',
      }).success,
    ).toBe(false);
    expect(updateBoardInput.safeParse({ boardId: 'board_1', icon: 'unknown' }).success).toBe(false);
  });
});
