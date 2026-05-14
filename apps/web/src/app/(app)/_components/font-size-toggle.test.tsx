import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FontSizeProvider, FONT_SCALE_STORAGE_KEY } from '../../_components/font-size-provider';
import { FontSizeToggle } from './font-size-toggle';
import { strings } from '@/lib/strings';

function resetFontScale() {
  window.localStorage.clear();
  document.documentElement.style.fontSize = '';
}

function renderToggle() {
  return render(
    <FontSizeProvider>
      <FontSizeToggle />
    </FontSizeProvider>,
  );
}

describe('FontSizeToggle', () => {
  beforeEach(() => {
    resetFontScale();
  });

  afterEach(() => {
    resetFontScale();
  });

  it('starts at the current UI size and stores/apply changes from the dropdown', async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole('button', { name: strings.shell.fontSize.trigger }));

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
    await user.click(screen.getByRole('button', { name: strings.shell.fontSize.trigger }));

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
