import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  FONT_FAMILY_STORAGE_KEY,
  FontFamilyProvider,
} from '../../_components/font-family-provider';
import { FontFamilyToggle } from './font-family-toggle';
import { strings } from '@/lib/strings';

function resetFontFamily() {
  window.localStorage.clear();
  document.documentElement.style.removeProperty('--font-sans');
}

function renderToggle() {
  return render(
    <FontFamilyProvider>
      <FontFamilyToggle />
    </FontFamilyProvider>,
  );
}

describe('FontFamilyToggle', () => {
  beforeEach(() => {
    resetFontFamily();
  });

  afterEach(() => {
    resetFontFamily();
  });

  it('starts on the default family and persists a new choice from the dropdown', async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole('button', { name: strings.shell.fontFamily.trigger }));

    // Default state: no inline --font-sans override and no stored preference.
    expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('');
    expect(window.localStorage.getItem(FONT_FAMILY_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('menuitem', { name: strings.shell.fontFamily.reset })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await user.click(screen.getByRole('menuitem', { name: strings.shell.fontFamily.options.inter }));

    expect(window.localStorage.getItem(FONT_FAMILY_STORAGE_KEY)).toBe('inter');
    expect(document.documentElement.style.getPropertyValue('--font-sans')).toContain('--font-inter');
  });

  it('loads a persisted family and clears it via the reset action', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(FONT_FAMILY_STORAGE_KEY, 'jetbrains-mono');

    renderToggle();
    await user.click(screen.getByRole('button', { name: strings.shell.fontFamily.trigger }));

    expect(document.documentElement.style.getPropertyValue('--font-sans')).toContain(
      '--font-jetbrains-mono',
    );

    await user.click(screen.getByRole('menuitem', { name: strings.shell.fontFamily.reset }));

    expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('');
    expect(window.localStorage.getItem(FONT_FAMILY_STORAGE_KEY)).toBe('poppins');
  });

  it('falls back to the default when a stored value is not in the supported set', async () => {
    window.localStorage.setItem(FONT_FAMILY_STORAGE_KEY, 'comic-sans');

    renderToggle();

    // No override applied because the stored value is not a recognized family.
    expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('');
  });
});
