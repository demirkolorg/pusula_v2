import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Faz 7N — `ConnectionBanner` (çevrimdışı şerit) bileşen birim testleri.
 *
 * Banner `useNetworkStatus`'a göre koşullu render eder; hook `expo-network`
 * köprüsü olduğu için test başına mock'lanır. Saf "çevrimdışı mı?" türetmesi
 * `network-status.ts`'te ayrıca birim test edilir.
 */

beforeEach(async () => {
  // Önceki render'ın DOM'unu temizle — dinamik import'lu testte otomatik
  // cleanup garanti değil, render'lar `document.body`'de birikmesin.
  const { cleanup } = await import('@testing-library/react');
  cleanup();
  // Her testte taze modül grafiği — `doMock` bir sonraki dinamik import'a
  // uygulanır, eski cache'lenmiş `ConnectionBanner` sızmaz.
  vi.resetModules();
});

async function renderBanner(isOffline: boolean) {
  vi.doMock('@/lib/use-network-status', () => ({
    useNetworkStatus: () => ({ isOffline }),
  }));
  const { render, screen } = await import('./render-helper');
  const { ConnectionBanner } = await import('../connection-banner');
  render(<ConnectionBanner />);
  return screen;
}

describe('ConnectionBanner', () => {
  it('çevrimiçiyken hiçbir şey render etmez', async () => {
    const screen = await renderBanner(false);
    expect(screen.queryByText('Bağlantı yok')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('çevrimdışıyken uyarı şeridini gösterir', async () => {
    const screen = await renderBanner(true);
    expect(screen.getByText('Bağlantı yok')).toBeTruthy();
  });

  it('çevrimdışı şerit alert rolü taşır (ekran okuyucu duyurusu)', async () => {
    const screen = await renderBanner(true);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
