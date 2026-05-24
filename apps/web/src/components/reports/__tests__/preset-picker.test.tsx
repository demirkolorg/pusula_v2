/**
 * Faz 13G (DEM-263) — PresetPicker testleri.
 *
 * `getPresetsForScope(scopeKind)` ile filtreli preset listesi, radio
 * semantik (`role="radio"` + `aria-checked`), seçili durum görsel ve
 * click → onChange.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@pusula/ui';
import { PresetPicker } from '../composer/preset-picker';

function renderPicker(value: string | null, onChange = vi.fn(), scopeKind: 'board' | 'card' | 'list' | 'workspace' = 'board') {
  return {
    onChange,
    ...render(
      <TooltipProvider>
        <PresetPicker scopeKind={scopeKind} value={value} onChange={onChange} />
      </TooltipProvider>,
    ),
  };
}

describe('PresetPicker', () => {
  it('board scope için board.* preset\'leri listelenir (radiogroup)', () => {
    renderPicker(null, vi.fn(), 'board');
    const group = screen.getByRole('radiogroup');
    expect(group).toBeInTheDocument();
    // Board preset'lerden en az birkaçını gösterir.
    expect(screen.getByTestId('report-preset-board.health')).toBeInTheDocument();
    expect(screen.getByTestId('report-preset-board.sprint-summary')).toBeInTheDocument();
  });

  it('card scope için card.* preset\'leri listelenir', () => {
    renderPicker(null, vi.fn(), 'card');
    expect(screen.getByTestId('report-preset-card.overview')).toBeInTheDocument();
    // Board preset'leri görünmez.
    expect(screen.queryByTestId('report-preset-board.health')).toBeNull();
  });

  it('seçili preset aria-checked=true', () => {
    renderPicker('board.health', vi.fn(), 'board');
    const btn = screen.getByTestId('report-preset-board.health');
    expect(btn).toHaveAttribute('aria-checked', 'true');
  });

  it('click → onChange(presetId) çağrılır', async () => {
    const onChange = vi.fn();
    renderPicker(null, onChange, 'board');
    await userEvent.click(screen.getByTestId('report-preset-board.health'));
    expect(onChange).toHaveBeenCalledWith('board.health');
  });

  it('disabled iken click no-op', async () => {
    const onChange = vi.fn();
    render(
      <TooltipProvider>
        <PresetPicker scopeKind="board" value={null} onChange={onChange} disabled />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByTestId('report-preset-board.health'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
