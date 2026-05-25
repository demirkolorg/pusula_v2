import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  FONT_FAMILY_STORAGE_KEY,
  FontFamilyProvider,
} from '../../_components/font-family-provider';
import { FontSizeProvider, FONT_SCALE_STORAGE_KEY } from '../../_components/font-size-provider';
import { FontToggle } from './font-toggle';
import { strings } from '@/lib/strings';

function resetPreferences() {
  window.localStorage.clear();
  document.documentElement.style.removeProperty('--font-sans');
  document.documentElement.style.fontSize = '';
}

function renderToggle() {
  return render(
    <FontFamilyProvider>
      <FontSizeProvider>
        <FontToggle />
      </FontSizeProvider>
    </FontFamilyProvider>,
  );
}

describe('FontToggle', () => {
  beforeEach(() => {
    resetPreferences();
  });

  afterEach(() => {
    resetPreferences();
  });

  it('starts on the default family and persists a new choice from the dropdown', async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole('button', { name: strings.shell.fontToggle.trigger }));

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
    await user.click(screen.getByRole('button', { name: strings.shell.fontToggle.trigger }));

    expect(document.documentElement.style.getPropertyValue('--font-sans')).toContain(
      '--font-jetbrains-mono',
    );

    await user.click(screen.getByRole('menuitem', { name: strings.shell.fontFamily.reset }));

    expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('');
    expect(window.localStorage.getItem(FONT_FAMILY_STORAGE_KEY)).toBe('poppins');
  });

  it('falls back to the default when a stored family value is not in the supported set', async () => {
    window.localStorage.setItem(FONT_FAMILY_STORAGE_KEY, 'comic-sans');

    renderToggle();

    expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('');
  });

  it('exposes font size controls in the same dropdown and persists changes', async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole('button', { name: strings.shell.fontToggle.trigger }));

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(document.documentElement.style.fontSize).toBe('');

    await user.click(screen.getByRole('menuitem', { name: strings.shell.fontSize.increase }));

    expect(screen.getByText('105%')).toBeInTheDocument();
    expect(document.documentElement.style.fontSize).toBe('105%');
    expect(window.localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe('1.05');

    await user.click(screen.getByRole('menuitem', { name: strings.shell.fontSize.reset }));

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(document.documentElement.style.fontSize).toBe('');
    expect(window.localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe('1');
  });

  it('loads a persisted font scale and clamps menu actions at the supported limits', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, '1.2');

    renderToggle();
    await user.click(screen.getByRole('button', { name: strings.shell.fontToggle.trigger }));

    expect(screen.getByText('120%')).toBeInTheDocument();
    expect(document.documentElement.style.fontSize).toBe('120%');
    expect(screen.getByRole('menuitem', { name: strings.shell.fontSize.increase })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await user.click(screen.getByRole('menuitem', { name: strings.shell.fontSize.decrease }));

    expect(screen.getByText('115%')).toBeInTheDocument();
    expect(document.documentElement.style.fontSize).toBe('115%');
  });
});
