import { beforeEach, describe, expect, it, vi } from 'vitest';

// `unit` (node) projesi `vitest.setup.tsx` AsyncStorage mock'unu yüklemiyor —
// bu saf-helper testi kendi bellekte-tutan mock'unu tanımlar
// (`board-view-preference.test.ts` deseni).
vi.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => store.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => void store.set(key, value)),
      removeItem: vi.fn(async (key: string) => void store.delete(key)),
      clear: vi.fn(async () => void store.clear()),
    },
  };
});

const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
const {
  DEFAULT_CARD_COVER_VIEW,
  isCardCoverView,
  loadCardCoverView,
  saveCardCoverView,
} = await import('./card-cover-view-preference');

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('isCardCoverView', () => {
  it('geçerli modları kabul eder', () => {
    expect(isCardCoverView('fit')).toBe(true);
    expect(isCardCoverView('banner')).toBe(true);
  });

  it('geçersiz değerleri reddeder', () => {
    expect(isCardCoverView('cover')).toBe(false);
    expect(isCardCoverView(null)).toBe(false);
    expect(isCardCoverView(undefined)).toBe(false);
    expect(isCardCoverView(1)).toBe(false);
  });
});

describe('loadCardCoverView', () => {
  it('saklanmamışsa varsayılan (fit) döner', async () => {
    expect(DEFAULT_CARD_COVER_VIEW).toBe('fit');
    expect(await loadCardCoverView('card_1')).toBe('fit');
  });

  it('saklanan geçerli modu döner', async () => {
    await saveCardCoverView('card_1', 'banner');
    expect(await loadCardCoverView('card_1')).toBe('banner');
  });

  it('tercih kart bazlıdır — başka kartı etkilemez', async () => {
    await saveCardCoverView('card_1', 'banner');
    expect(await loadCardCoverView('card_2')).toBe('fit');
  });

  it('bozuk saklanan değeri yok sayıp varsayılana düşer', async () => {
    // Depo anahtarı modül-içi private — bozuk değer senaryosu için elle yazılır.
    await AsyncStorage.setItem('pusula:card-cover-view:card_1', 'cover');
    expect(await loadCardCoverView('card_1')).toBe('fit');
  });
});

describe('saveCardCoverView', () => {
  it('modu sonraki yüklemeye taşır', async () => {
    await saveCardCoverView('card_1', 'banner');
    expect(await loadCardCoverView('card_1')).toBe('banner');
  });
});
