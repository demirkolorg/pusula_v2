/**
 * Faz 7N — bileşen testleri için ince render sarmalayıcısı.
 *
 * `react-native` → `react-native-web` alias'ı sayesinde RN bileşenleri
 * gerçek DOM ağacına render edilir; bu yüzden sorgu/etkileşim katmanı
 * `@testing-library/react`'tir.
 *
 * §13.7.7 (Faz 3): merkezi `Text` artık font ailesi + boyutu için
 * `useThemePreference()` okur → `ThemeProvider` olmadan render edilirse hata
 * atar. Bu yüzden `render` burada özelleştirilir ve tüm test ağacı
 * `ThemeProvider` ile sarılır. `ThemeProvider` `AsyncStorage`'tan async yükler;
 * varsayılanlarla (system + poppins + 1.0) anında render eder, test senkron
 * sorguları varsayılan değerleri görür.
 */
import type { ReactElement, ReactNode } from 'react';
import {
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  within,
  type RenderOptions,
} from '@testing-library/react';
import { ThemeProvider } from '@/theme/theme-provider';

function AllProviders({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

/** `@testing-library/react` `render` — tüm ağacı `ThemeProvider` ile sarar. */
function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return rtlRender(ui, { wrapper: AllProviders, ...options });
}

export { cleanup, fireEvent, render, screen, within };
