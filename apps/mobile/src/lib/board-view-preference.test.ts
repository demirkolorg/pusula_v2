import { beforeEach, describe, expect, it, vi } from 'vitest';

// `unit` (node) projesi `vitest.setup.tsx` AsyncStorage mock'unu yüklemiyor —
// bu saf-helper testi kendi bellekte-tutan mock'unu tanımlar
// (`theme-preference.test.ts` deseni).
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
const { DEFAULT_BOARD_VIEW_MODE, isBoardViewMode, loadBoardViewMode, saveBoardViewMode } =
  await import('./board-view-preference');

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('isBoardViewMode', () => {
  it('geçerli modları kabul eder', () => {
    expect(isBoardViewMode('kanban')).toBe(true);
    expect(isBoardViewMode('list')).toBe(true);
  });

  it('geçersiz değerleri reddeder', () => {
    expect(isBoardViewMode('grid')).toBe(false);
    expect(isBoardViewMode(null)).toBe(false);
    expect(isBoardViewMode(undefined)).toBe(false);
    expect(isBoardViewMode(1)).toBe(false);
  });
});

describe('loadBoardViewMode', () => {
  it('saklanmamışsa varsayılan (kanban) döner', async () => {
    expect(DEFAULT_BOARD_VIEW_MODE).toBe('kanban');
    expect(await loadBoardViewMode()).toBe('kanban');
  });

  it('saklanan geçerli modu döner', async () => {
    await saveBoardViewMode('list');
    expect(await loadBoardViewMode()).toBe('list');
  });

  it('bozuk saklanan değeri yok sayıp varsayılana düşer', async () => {
    // Depo anahtarı modül-içi private — bozuk değer senaryosu için elle yazılır.
    await AsyncStorage.setItem('pusula:board-view-mode', 'grid');
    expect(await loadBoardViewMode()).toBe('kanban');
  });
});

describe('saveBoardViewMode', () => {
  it('modu sonraki yüklemeye taşır', async () => {
    await saveBoardViewMode('list');
    expect(await loadBoardViewMode()).toBe('list');
  });
});
