import { describe, expect, it } from 'vitest';
import { deepLinkTarget } from '@/lib/deep-link';

/**
 * `deep-link.ts` birim testleri (Faz 7L) — universal/şema URL'sinin Expo Router
 * hedefine deterministik çevrimi. Web rota desenleri (`/workspaces/.../boards/...`)
 * mobil rota ağacıyla eşleşmediği için bu helper aradaki çeviriyi yapar.
 */
describe('deepLinkTarget', () => {
  it('kart query paramlı board URL\'sini kart detayına çevirir', () => {
    expect(
      deepLinkTarget('https://pusulaportal.com/workspaces/ws-1/boards/b-1?card=c-9'),
    ).toEqual({
      pathname: '/cards/[cardId]',
      params: { cardId: 'c-9', title: '' },
    });
  });

  it('kart paramı olmayan board URL\'sini board ekranına çevirir', () => {
    expect(deepLinkTarget('https://pusulaportal.com/workspaces/ws-1/boards/b-1')).toEqual({
      pathname: '/boards/[boardId]',
      params: { boardId: 'b-1', title: '' },
    });
  });

  it('yalnız workspace yolunu workspace ekranına çevirir', () => {
    expect(deepLinkTarget('https://pusulaportal.com/workspaces/ws-7')).toEqual({
      pathname: '/workspaces/[id]',
      params: { id: 'ws-7', name: '' },
    });
  });

  it('özel şema (pusula://) URL\'sini de çözer', () => {
    expect(
      deepLinkTarget('pusula://workspaces/ws-2/boards/b-2?card=c-2'),
    ).toEqual({
      pathname: '/cards/[cardId]',
      params: { cardId: 'c-2', title: '' },
    });
  });

  it('son eğik çizgili yolu segment olarak doğru ayrıştırır', () => {
    expect(deepLinkTarget('https://pusulaportal.com/workspaces/ws-1/boards/b-1/')).toEqual({
      pathname: '/boards/[boardId]',
      params: { boardId: 'b-1', title: '' },
    });
  });

  it('boş card paramını yok sayıp board ekranına düşer', () => {
    expect(deepLinkTarget('https://pusulaportal.com/workspaces/ws-1/boards/b-1?card=')).toEqual({
      pathname: '/boards/[boardId]',
      params: { boardId: 'b-1', title: '' },
    });
  });

  it('eşleşmeyen yol için null döner', () => {
    expect(deepLinkTarget('https://pusulaportal.com/settings/profile')).toBeNull();
    expect(deepLinkTarget('https://pusulaportal.com/')).toBeNull();
    expect(deepLinkTarget('https://pusulaportal.com/workspaces')).toBeNull();
  });

  it('eksik board kimliği için null döner', () => {
    expect(deepLinkTarget('https://pusulaportal.com/workspaces/ws-1/boards')).toBeNull();
  });

  it('geçersiz/boş URL için exception fırlatmadan null döner', () => {
    expect(deepLinkTarget('bozuk url')).toBeNull();
    expect(deepLinkTarget('')).toBeNull();
    expect(deepLinkTarget('   ')).toBeNull();
    expect(deepLinkTarget(null)).toBeNull();
    expect(deepLinkTarget(undefined)).toBeNull();
  });

  it('URL-kodlu segmentleri çözer', () => {
    expect(
      deepLinkTarget('https://pusulaportal.com/workspaces/ws%2D1'),
    ).toEqual({
      pathname: '/workspaces/[id]',
      params: { id: 'ws-1', name: '' },
    });
  });
});
