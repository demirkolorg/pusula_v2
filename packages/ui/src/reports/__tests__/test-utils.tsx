/**
 * Faz 13F test helper'lar — basit i18n mock + render wrapper.
 */
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

/** Stub i18n çözümleyici — key + params'ı görünür şekilde döner. */
export function t(key: string, params?: Record<string, unknown>): string {
  if (!params) return key;
  const flat = Object.entries(params)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(', ');
  return `${key}(${flat})`;
}

/** Default locale tüm test'lerde tr-TR. */
export const TEST_LOCALE = 'tr-TR';

/** Mode helper'ları. */
export type Mode = 'panel' | 'print';

/** RTL render wrapper'ı — default options döner; gerekirse genişletilebilir. */
export function renderUi(ui: ReactElement, options?: RenderOptions): RenderResult {
  return render(ui, options);
}
