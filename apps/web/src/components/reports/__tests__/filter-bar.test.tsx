/**
 * Faz 13H (DEM-264) — FilterBar testleri (3 kind varyant).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  FilterBar,
  type RendersFilterValue,
  type SavedFilterValue,
  type ScheduledFilterValue,
} from '../list/filter-bar';

describe('FilterBar — saved kind', () => {
  it('search input → onChange tetiklenir, search alanı set edilir', async () => {
    const onChange = vi.fn();
    const value: SavedFilterValue = {};
    render(<FilterBar kind="saved" value={value} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/Başlık veya açıklama/);
    // Controlled input — parent yeniden value vermediği için her keystroke
    // tek karakter geçer; sadece tetiklenmesini doğrula.
    await userEvent.type(input, 'a');
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0]![0]).toMatchObject({ search: 'a' });
  });

  it('arşivlileri göster toggle → onChange', async () => {
    const onChange = vi.fn();
    const value: SavedFilterValue = {};
    render(<FilterBar kind="saved" value={value} onChange={onChange} />);
    const toggle = screen.getByTestId('reports-filter-show-archived');
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeArchived: true }),
    );
  });

  it('search + scopeKind dolu → Temizle butonu görünür ve tıklayınca reset', async () => {
    const onChange = vi.fn();
    const value: SavedFilterValue = { search: 'hello', scopeKind: 'board' };
    render(<FilterBar kind="saved" value={value} onChange={onChange} />);
    const clear = screen.getByRole('button', { name: /Temizle/ });
    await userEvent.click(clear);
    expect(onChange).toHaveBeenLastCalledWith({});
  });
});

describe('FilterBar — scheduled kind', () => {
  it('default state: tümü', () => {
    render(
      <FilterBar
        kind="scheduled"
        value={{} as ScheduledFilterValue}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('reports-filter-bar-scheduled')).toBeInTheDocument();
  });
});

describe('FilterBar — renders kind', () => {
  it('default state: tüm durumlar + tüm formatlar', () => {
    render(
      <FilterBar
        kind="renders"
        value={{} as RendersFilterValue}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('reports-filter-bar-renders')).toBeInTheDocument();
  });
});
