/**
 * Faz 13H (DEM-264) — Empty state testleri (3 kind).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyStateRenders } from '../list/empty-state-renders';
import { EmptyStateSaved } from '../list/empty-state-saved';
import { EmptyStateScheduled } from '../list/empty-state-scheduled';

describe('EmptyStateSaved', () => {
  it('canCreate=true + onCreate set → CTA button render + click', async () => {
    const onCreate = vi.fn();
    render(<EmptyStateSaved canCreate onCreate={onCreate} />);
    const cta = screen.getByTestId('reports-empty-saved-cta');
    expect(cta).toBeInTheDocument();
    await userEvent.click(cta);
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('canCreate=false → CTA gizli', () => {
    render(<EmptyStateSaved canCreate={false} onCreate={vi.fn()} />);
    expect(screen.queryByTestId('reports-empty-saved-cta')).toBeNull();
  });

  it('role=status + aria-live=polite (SR duyurusu)', () => {
    render(<EmptyStateSaved canCreate={false} />);
    const region = screen.getByTestId('reports-empty-saved');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });
});

describe('EmptyStateScheduled', () => {
  it('başlık + açıklama görünür', () => {
    render(<EmptyStateScheduled />);
    expect(screen.getByText('Hiç zamanlanmış rapor yok')).toBeInTheDocument();
  });
});

describe('EmptyStateRenders', () => {
  it('başlık + açıklama görünür', () => {
    render(<EmptyStateRenders />);
    expect(screen.getByText('Henüz rapor üretilmedi')).toBeInTheDocument();
  });
});
