'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

/**
 * Renk teması — sistem yüzeylerinin (modal / dropdown / popover / dashboard)
 * tweakcn benzeri preset'lerle değişimi. Karar: `<html data-color-theme="X">`
 * attribute → `packages/ui/src/styles/theme.css` içindeki override blokları.
 *
 * Light/dark mod (`next-themes` üzerinden `.dark` class'ı) bağımsız çalışır.
 * Tema seti hem light hem dark için ayrı palet tanımlar; bu provider sadece
 * "hangi tema?" sorusunu yönetir. Board canvas etkilenmez — board renkleri
 * `--board-base`, `--board-list-bg`, `--board-card-bg` üzerinden ayrı katmanda
 * tutulur ve preset'lerde override edilmez.
 */

export const COLOR_THEME_STORAGE_KEY = 'pusula-color-theme';
/**
 * Yeni kullanıcılar için varsayılan tema = `slate` (kullanıcıya "Varsayılan"
 * olarak görünür). Eski Pusula indigo'su `default` id'sinde kalır ama listede
 * "Arduvaz" adıyla yer alır. localStorage'da `default` kayıtlı eski
 * kullanıcılar otomatik olarak o temayı (yeni adıyla "Arduvaz") görür —
 * tercih korunur, sadece etiketler swap edildi.
 */
export const DEFAULT_COLOR_THEME = 'slate';

export const COLOR_THEME_IDS = [
  'default',
  'slate',
  'zinc',
  'stone',
  'neutral',
  'rose',
  'red',
  'orange',
  'amber',
  'green',
  'blue',
  'cyan',
  'violet',
  'whatsapp',
  'discord',
] as const;

export type ColorThemeId = (typeof COLOR_THEME_IDS)[number];

function isColorThemeId(value: string): value is ColorThemeId {
  return (COLOR_THEME_IDS as readonly string[]).includes(value);
}

function readStoredColorTheme(): ColorThemeId {
  if (typeof window === 'undefined') {
    return DEFAULT_COLOR_THEME;
  }

  try {
    const stored = window.localStorage.getItem(COLOR_THEME_STORAGE_KEY);
    return stored && isColorThemeId(stored) ? stored : DEFAULT_COLOR_THEME;
  } catch {
    return DEFAULT_COLOR_THEME;
  }
}

function persistColorTheme(value: ColorThemeId) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, value);
  } catch {
    // localStorage hardened browser modlarında erişilemeyebilir; mevcut session
    // için görsel değişiklik yine uygulanır.
  }
}

export function applyColorTheme(value: ColorThemeId) {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.setAttribute('data-color-theme', value);
}

export function useColorTheme() {
  const [theme, setTheme] = useState<ColorThemeId>(DEFAULT_COLOR_THEME);

  useEffect(() => {
    const stored = readStoredColorTheme();
    setTheme(stored);
    applyColorTheme(stored);
  }, []);

  const commitTheme = useCallback((next: ColorThemeId) => {
    setTheme(next);
    applyColorTheme(next);
    persistColorTheme(next);
  }, []);

  return { theme, setTheme: commitTheme };
}

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyColorTheme(readStoredColorTheme());
  }, []);

  return <>{children}</>;
}
