import { describe, expect, it } from 'vitest';
import {
  avatarInitials,
  avatarPaletteName,
  avatarPaletteSolidClass,
  avatarPaletteSwatchClass,
} from './avatar-color';

describe('avatar-color utilities', () => {
  it('derives the same initials as the shared Avatar component', () => {
    expect(avatarInitials('Aria Chen')).toBe('AC');
    expect(avatarInitials('Abdullah')).toBe('AB');
    expect(avatarInitials('')).toBe('');
  });

  it('returns a deterministic palette name for the same string', () => {
    expect(avatarPaletteName('Marketing Workspace')).toBe(avatarPaletteName('Marketing Workspace'));
  });

  it('returns Tailwind palette classes for solid avatars and swatches', () => {
    expect(avatarPaletteSolidClass('Marketing Workspace')).toMatch(
      /^bg-palet-[a-z]+ text-palet-[a-z]+-foreground$/,
    );
    expect(avatarPaletteSwatchClass('Roadmap Board')).toMatch(/^bg-palet-[a-z]+$/);
  });
});
