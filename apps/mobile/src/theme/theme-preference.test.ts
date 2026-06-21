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
  // Faz 3 — yazı tipi ailesi ekseni (§13.7.7).
  DEFAULT_FONT_FAMILY,
  isFontFamilyId,
  loadFontFamily,
  saveFontFamily,
  // Faz 4 — yazı boyutu ekseni (§13.7.7).
  DEFAULT_FONT_SCALE,
  MIN_FONT_SCALE,
  MAX_FONT_SCALE,
  normalizeFontScale,
  fontScalePercent,
  loadFontScale,
  saveFontScale,
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

// ─── Faz 3 — yazı tipi ailesi ekseni (§13.7.7) ───────────────────────────────

describe('isFontFamilyId', () => {
  it('8 geçerli aileyi kabul eder', () => {
    for (const id of [
      'poppins',
      'inter',
      'system',
      'lora',
      'manrope',
      'dm-sans',
      'jetbrains-mono',
      'atkinson',
    ]) {
      expect(isFontFamilyId(id)).toBe(true);
    }
  });

  it('geçersiz değerleri reddeder', () => {
    expect(isFontFamilyId('comic-sans')).toBe(false);
    expect(isFontFamilyId(null)).toBe(false);
    expect(isFontFamilyId(42)).toBe(false);
  });
});

describe('loadFontFamily', () => {
  it('saklanmamışsa varsayılan (poppins) döner', async () => {
    expect(DEFAULT_FONT_FAMILY).toBe('poppins');
    expect(await loadFontFamily()).toBe('poppins');
  });

  it('saklanan geçerli aileyi döner', async () => {
    await saveFontFamily('jetbrains-mono');
    expect(await loadFontFamily()).toBe('jetbrains-mono');
  });

  it('bozuk değeri yok sayıp varsayılana düşer', async () => {
    await AsyncStorage.setItem('pusula:font-family', 'wingdings');
    expect(await loadFontFamily()).toBe('poppins');
  });
});

// ─── Faz 4 — yazı boyutu ekseni (§13.7.7) ────────────────────────────────────

describe('normalizeFontScale', () => {
  it('aralık içindeki değeri en yakın %5 adımına yuvarlar', () => {
    expect(normalizeFontScale(1.0)).toBe(1.0);
    expect(normalizeFontScale(1.07)).toBe(1.05);
    expect(normalizeFontScale(1.13)).toBe(1.15);
  });

  it('sınırların dışına kelepçeler', () => {
    expect(normalizeFontScale(0.5)).toBe(MIN_FONT_SCALE);
    expect(normalizeFontScale(2.0)).toBe(MAX_FONT_SCALE);
    expect(MIN_FONT_SCALE).toBe(0.9);
    expect(MAX_FONT_SCALE).toBe(1.2);
  });

  it('geçersiz/sonsuz değerde varsayılana düşer', () => {
    expect(normalizeFontScale(Number.NaN)).toBe(DEFAULT_FONT_SCALE);
    expect(normalizeFontScale(Number.POSITIVE_INFINITY)).toBe(DEFAULT_FONT_SCALE);
  });
});

describe('fontScalePercent', () => {
  it('ölçeği yüzde tamsayısına çevirir', () => {
    expect(fontScalePercent(1.0)).toBe(100);
    expect(fontScalePercent(0.9)).toBe(90);
    expect(fontScalePercent(1.2)).toBe(120);
  });
});

describe('loadFontScale / saveFontScale', () => {
  it('saklanmamışsa varsayılan (1.0) döner', async () => {
    expect(DEFAULT_FONT_SCALE).toBe(1.0);
    expect(await loadFontScale()).toBe(1.0);
  });

  it('saklanan değeri normalize edip döner', async () => {
    await saveFontScale(1.15);
    expect(await loadFontScale()).toBe(1.15);
  });

  it('aralık dışı saklanan değeri kelepçeler', async () => {
    await saveFontScale(5);
    expect(await loadFontScale()).toBe(MAX_FONT_SCALE);
  });

  it('bozuk değeri yok sayıp varsayılana düşer', async () => {
    await AsyncStorage.setItem('pusula:font-scale', 'big');
    expect(await loadFontScale()).toBe(DEFAULT_FONT_SCALE);
  });
});
