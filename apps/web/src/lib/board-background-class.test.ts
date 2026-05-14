import { describe, expect, it } from 'vitest';
import { boardBackgroundClass } from '@pusula/ui/board-background';

describe('boardBackgroundClass', () => {
  it('maps known board background tokens to utility classes', () => {
    expect(boardBackgroundClass(null)).toBe('bg-background');
    expect(boardBackgroundClass('gradient:ocean')).toBe('bg-gradient-ocean');
    expect(boardBackgroundClass('solid:mavi')).toBe('bg-palet-mavi');
  });

  it('falls back for malformed or unknown stored values', () => {
    expect(boardBackgroundClass('gradient:ocean:extra')).toBe('bg-background');
    expect(boardBackgroundClass('solid:mavi:extra')).toBe('bg-background');
    expect(boardBackgroundClass('gradient:unknown')).toBe('bg-background');
    expect(boardBackgroundClass('solid:unknown')).toBe('bg-background');
  });
});
