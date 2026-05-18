import { beforeEach, describe, expect, it, vi } from 'vitest';

// `unit` (node) projesi `vitest.setup.tsx` AsyncStorage mock'unu yüklemiyor —
// bu saf-helper testi kendi bellekte-tutan mock'unu tanımlar.
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
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  loadThemePreference,
  saveThemePreference,
} = await import('./theme-preference');

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('isThemePreference', () => {
  it('geçerli tercihleri kabul eder', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
  });

  it('geçersiz değerleri reddeder', () => {
    expect(isThemePreference('neon')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
    expect(isThemePreference(1)).toBe(false);
  });
});

describe('loadThemePreference', () => {
  it('saklanmamışsa varsayılan (system) döner', async () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe('system');
    expect(await loadThemePreference()).toBe('system');
  });

  it('saklanan geçerli tercihi döner', async () => {
    await saveThemePreference('dark');
    expect(await loadThemePreference()).toBe('dark');
  });

  it('bozuk saklanan değeri yok sayıp varsayılana düşer', async () => {
    // Depo anahtarı modül-içi private — bozuk değer senaryosu için elle yazılır.
    await AsyncStorage.setItem('pusula:theme-preference', 'neon');
    expect(await loadThemePreference()).toBe('system');
  });
});

describe('saveThemePreference', () => {
  it('tercihi sonraki yüklemeye taşır', async () => {
    await saveThemePreference('light');
    expect(await loadThemePreference()).toBe('light');
  });
});
