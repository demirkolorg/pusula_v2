import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { ThemeToggle } from './theme-toggle';
import { strings } from '@/lib/strings';

/**
 * `next-themes` localStorage'a yazar; her test arası temizliyoruz ki bir önceki
 * testin tercihi sızmasın. Aynı zamanda jsdom'da `<html class="dark">` kalmasın.
 */
function resetTheme() {
  window.localStorage.clear();
  document.documentElement.classList.remove('dark', 'light');
  document.documentElement.style.colorScheme = '';
}

function renderToggle() {
  return render(
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      themes={['light', 'dark']}
      storageKey="pusula-theme"
      disableTransitionOnChange
    >
      <ThemeToggle />
    </NextThemesProvider>,
  );
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    resetTheme();
  });

  afterEach(() => {
    resetTheme();
  });

  it('mount sonrası default light teması için "koyuya geç" etiketini gösterir', async () => {
    renderToggle();

    const button = await screen.findByRole('button', {
      name: strings.shell.themeToggleToDark,
    });
    expect(button).toBeInTheDocument();
    // Default light → `<html>` üstünde `.dark` class'ı olmamalı.
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('tıklayınca dark moda geçer, <html class="dark"> uygulanır ve etiket flip eder', async () => {
    const user = userEvent.setup();
    renderToggle();

    const toggleToDark = await screen.findByRole('button', {
      name: strings.shell.themeToggleToDark,
    });
    await user.click(toggleToDark);

    // `<html>` üzerinde `.dark` class'ı görünmeli.
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Etiket "Açık temaya geç"e dönmeli.
    const toggleToLight = await screen.findByRole('button', {
      name: strings.shell.themeToggleToLight,
    });
    expect(toggleToLight).toBeInTheDocument();

    // Persistence: namespaced storage key'e yazılmalı.
    expect(window.localStorage.getItem('pusula-theme')).toBe('dark');
  });

  it('dark → light geri dönüşünde class kaldırılır ve light persist eder', async () => {
    const user = userEvent.setup();
    renderToggle();

    const toggleToDark = await screen.findByRole('button', {
      name: strings.shell.themeToggleToDark,
    });
    await user.click(toggleToDark);

    const toggleToLight = await screen.findByRole('button', {
      name: strings.shell.themeToggleToLight,
    });
    await user.click(toggleToLight);

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('pusula-theme')).toBe('light');
  });
});
