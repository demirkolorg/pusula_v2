import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardBackgroundClass } from '@pusula/ui/board-background';

const themeCss = readFileSync(
  resolve(process.cwd(), '../../packages/ui/src/styles/theme.css'),
  'utf8',
);

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

describe('Trello-style list colour theme tokens', () => {
  it('pins the picker swatch and full-list background tokens for light and dark themes', () => {
    expect(themeCss).toMatch(/:root\s*{[\s\S]*--palet-mavi:\s*#669df1;/);
    expect(themeCss).toMatch(/:root\s*{[\s\S]*--board-list-color-mavi-bg:\s*#cfe1fd;/);
    expect(themeCss).toMatch(/:root\s*{[\s\S]*--board-list-bg:\s*#f1f2f4;/);
    expect(themeCss).toMatch(/:root\s*{[\s\S]*--board-card-bg:\s*#ffffff;/);

    expect(themeCss).toMatch(/\.dark\s*{[\s\S]*--palet-mavi:\s*#1558bc;/);
    expect(themeCss).toMatch(/\.dark\s*{[\s\S]*--board-list-color-mavi-bg:\s*#123263;/);
    expect(themeCss).toMatch(/\.dark\s*{[\s\S]*--board-list-bg:\s*#101204;/);
    expect(themeCss).toMatch(/\.dark\s*{[\s\S]*--board-card-bg:\s*#242528;/);
  });
});
