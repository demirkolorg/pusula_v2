'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

export const FONT_SCALE_STORAGE_KEY = 'pusula-font-scale';
export const DEFAULT_FONT_SCALE = 1;
export const MIN_FONT_SCALE = 0.9;
export const MAX_FONT_SCALE = 1.2;
export const FONT_SCALE_STEP = 0.05;

function normalizeFontScale(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_FONT_SCALE;
  }

  const clamped = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, value));
  const stepsFromDefault = Math.round((clamped - DEFAULT_FONT_SCALE) / FONT_SCALE_STEP);
  return Number((DEFAULT_FONT_SCALE + stepsFromDefault * FONT_SCALE_STEP).toFixed(2));
}

function serializeFontScale(value: number) {
  return String(Number(value.toFixed(2)));
}

function readStoredFontScale() {
  if (typeof window === 'undefined') {
    return DEFAULT_FONT_SCALE;
  }

  try {
    const stored = window.localStorage.getItem(FONT_SCALE_STORAGE_KEY);
    return stored === null ? DEFAULT_FONT_SCALE : normalizeFontScale(Number(stored));
  } catch {
    return DEFAULT_FONT_SCALE;
  }
}

function persistFontScale(value: number) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, serializeFontScale(value));
  } catch {
    // localStorage can be unavailable in hardened browser modes; the visual
    // change should still apply for the current session.
  }
}

export function fontScalePercent(value: number) {
  return Math.round(value * 100);
}

export function applyFontScale(value: number) {
  if (typeof document === 'undefined') {
    return;
  }

  const normalized = normalizeFontScale(value);
  if (normalized === DEFAULT_FONT_SCALE) {
    document.documentElement.style.removeProperty('font-size');
    return;
  }

  document.documentElement.style.fontSize = `${fontScalePercent(normalized)}%`;
}

export function useFontScalePreference() {
  const [scale, setScale] = useState(DEFAULT_FONT_SCALE);

  useEffect(() => {
    const storedScale = readStoredFontScale();
    setScale(storedScale);
    applyFontScale(storedScale);
  }, []);

  const commitScale = useCallback((nextScale: number) => {
    const normalized = normalizeFontScale(nextScale);
    setScale(normalized);
    applyFontScale(normalized);
    persistFontScale(normalized);
  }, []);

  return {
    scale,
    percent: fontScalePercent(scale),
    canDecrease: scale > MIN_FONT_SCALE,
    canIncrease: scale < MAX_FONT_SCALE,
    decrease: () => commitScale(scale - FONT_SCALE_STEP),
    increase: () => commitScale(scale + FONT_SCALE_STEP),
    reset: () => commitScale(DEFAULT_FONT_SCALE),
  };
}

export function FontSizeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyFontScale(readStoredFontScale());
  }, []);

  return <>{children}</>;
}
