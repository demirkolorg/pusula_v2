'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

export const FONT_FAMILY_STORAGE_KEY = 'pusula-font-family';

export type FontFamilyId =
  | 'poppins'
  | 'inter'
  | 'system'
  | 'lora'
  | 'manrope'
  | 'dm-sans'
  | 'jetbrains-mono'
  | 'atkinson';

export const DEFAULT_FONT_FAMILY: FontFamilyId = 'poppins';

type FontFamilyDescriptor = {
  id: FontFamilyId;
  cssValue: string;
};

// Each entry maps to a CSS variable injected by `next/font` in `layout.tsx`,
// except `system` which falls through to the operating-system UI stack so the
// page ships zero extra font bytes for that choice.
export const FONT_FAMILIES: readonly FontFamilyDescriptor[] = [
  { id: 'poppins', cssValue: 'var(--font-poppins), ui-sans-serif, system-ui, sans-serif' },
  { id: 'inter', cssValue: 'var(--font-inter), ui-sans-serif, system-ui, sans-serif' },
  {
    id: 'system',
    cssValue:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  { id: 'lora', cssValue: 'var(--font-lora), ui-serif, Georgia, serif' },
  { id: 'manrope', cssValue: 'var(--font-manrope), ui-sans-serif, system-ui, sans-serif' },
  { id: 'dm-sans', cssValue: 'var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif' },
  {
    id: 'jetbrains-mono',
    cssValue: 'var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  { id: 'atkinson', cssValue: 'var(--font-atkinson), ui-sans-serif, system-ui, sans-serif' },
] as const;

const FONT_FAMILY_IDS = new Set<FontFamilyId>(FONT_FAMILIES.map((f) => f.id));

function isFontFamilyId(value: string | null): value is FontFamilyId {
  return value !== null && FONT_FAMILY_IDS.has(value as FontFamilyId);
}

function readStoredFontFamily(): FontFamilyId {
  if (typeof window === 'undefined') {
    return DEFAULT_FONT_FAMILY;
  }

  try {
    const stored = window.localStorage.getItem(FONT_FAMILY_STORAGE_KEY);
    return isFontFamilyId(stored) ? stored : DEFAULT_FONT_FAMILY;
  } catch {
    return DEFAULT_FONT_FAMILY;
  }
}

function persistFontFamily(value: FontFamilyId) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(FONT_FAMILY_STORAGE_KEY, value);
  } catch {
    // localStorage can be unavailable in hardened browser modes; the visual
    // change should still apply for the current session.
  }
}

export function applyFontFamily(id: FontFamilyId) {
  if (typeof document === 'undefined') {
    return;
  }

  const descriptor = FONT_FAMILIES.find((f) => f.id === id);
  if (!descriptor) {
    return;
  }

  if (id === DEFAULT_FONT_FAMILY) {
    document.documentElement.style.removeProperty('--font-sans');
    return;
  }

  document.documentElement.style.setProperty('--font-sans', descriptor.cssValue);
}

export function useFontFamilyPreference() {
  const [family, setFamily] = useState<FontFamilyId>(DEFAULT_FONT_FAMILY);

  useEffect(() => {
    const stored = readStoredFontFamily();
    setFamily(stored);
    applyFontFamily(stored);
  }, []);

  const select = useCallback((nextFamily: FontFamilyId) => {
    setFamily(nextFamily);
    applyFontFamily(nextFamily);
    persistFontFamily(nextFamily);
  }, []);

  return {
    family,
    isDefault: family === DEFAULT_FONT_FAMILY,
    select,
    reset: () => select(DEFAULT_FONT_FAMILY),
  };
}

export function FontFamilyProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyFontFamily(readStoredFontFamily());
  }, []);

  return <>{children}</>;
}
