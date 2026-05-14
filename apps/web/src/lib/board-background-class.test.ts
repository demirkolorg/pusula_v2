import { describe, expect, it } from 'vitest';
import { boardBackgroundClass } from '@pusula/ui/board-background';

describe('boardBackgroundClass', () => {
  it('maps known board background tokens to utility classes', () => {
    expect(boardBackgroundClass(null)).toBe('board-bg-default');
    expect(boardBackgroundClass('gradient:ocean')).toBe('board-bg-gradient-ocean');
    expect(boardBackgroundClass('gradient:lagoon')).toBe('board-bg-gradient-lagoon');
    expect(boardBackgroundClass('gradient:trello-snow')).toBe('board-bg-gradient-trello-snow');
    expect(boardBackgroundClass('solid:mavi')).toBe('board-bg-solid-mavi');
    expect(boardBackgroundClass('solid:beyaz')).toBe('board-bg-solid-beyaz');
  });

  it('falls back for malformed or unknown stored values', () => {
    expect(boardBackgroundClass('gradient:ocean:extra')).toBe('board-bg-default');
    expect(boardBackgroundClass('solid:mavi:extra')).toBe('board-bg-default');
    expect(boardBackgroundClass('gradient:unknown')).toBe('board-bg-default');
    expect(boardBackgroundClass('solid:unknown')).toBe('board-bg-default');
  });
});
