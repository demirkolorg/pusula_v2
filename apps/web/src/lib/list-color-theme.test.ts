import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const themeCss = readFileSync(
  resolve(process.cwd(), '../../packages/ui/src/styles/theme.css'),
  'utf8',
);

describe('Trello-style list colour theme tokens', () => {
  it('pins the picker swatch and full-list background tokens for light and dark themes', () => {
    expect(themeCss).toMatch(/:root\s*{[\s\S]*--palet-mavi:\s*#669DF1;/);
    expect(themeCss).toMatch(/:root\s*{[\s\S]*--board-list-color-mavi-bg:\s*#CFE1FD;/);
    expect(themeCss).toMatch(/:root\s*{[\s\S]*--board-list-bg:\s*#F1F2F4;/);
    expect(themeCss).toMatch(/:root\s*{[\s\S]*--board-card-bg:\s*#FFFFFF;/);

    expect(themeCss).toMatch(/\.dark\s*{[\s\S]*--palet-mavi:\s*#1558BC;/);
    expect(themeCss).toMatch(/\.dark\s*{[\s\S]*--board-list-color-mavi-bg:\s*#123263;/);
    expect(themeCss).toMatch(/\.dark\s*{[\s\S]*--board-list-bg:\s*#101204;/);
    expect(themeCss).toMatch(/\.dark\s*{[\s\S]*--board-card-bg:\s*#242528;/);
  });
});
