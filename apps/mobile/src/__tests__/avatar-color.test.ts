import { describe, expect, it } from 'vitest';
import { avatarColor, avatarInitial } from '../lib/avatar-color';

/** Faz 7C — entity avatar deterministik renk/baş harf birim testleri. */
describe('avatarColor', () => {
  it('deterministiktir — aynı tohum aynı renk', () => {
    expect(avatarColor('Çalışma Alanım')).toBe(avatarColor('Çalışma Alanım'));
  });

  it('geçerli hex renk döndürür', () => {
    expect(avatarColor('Pusula')).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('boş tohumda bile geçerli renk döndürür', () => {
    expect(avatarColor('')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('avatarInitial', () => {
  it('ilk harfi büyük döndürür ve kırpar', () => {
    expect(avatarInitial('pusula')).toBe('P');
    expect(avatarInitial('  ada  ')).toBe('A');
  });

  it('boş / yalnız boşluk ad → ?', () => {
    expect(avatarInitial('')).toBe('?');
    expect(avatarInitial('   ')).toBe('?');
  });
});
