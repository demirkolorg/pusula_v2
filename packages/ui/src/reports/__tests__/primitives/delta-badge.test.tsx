import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { DeltaBadge } from '../../primitives/delta-badge';
import { renderUi, t, TEST_LOCALE } from '../test-utils';

describe('DeltaBadge', () => {
  it('renders up direction with positive pct', () => {
    renderUi(
      <DeltaBadge
        delta={{ abs: 20, pct: 20, direction: 'up' }}
        t={t}
        locale={TEST_LOCALE}
      />,
    );
    const badge = screen.getByRole('status');
    expect(badge.dataset.direction).toBe('up');
    // pct formatlanır: %20 (tr-TR)
    expect(badge.textContent ?? '').toMatch(/%/);
  });

  it('renders neutral as fallback', () => {
    renderUi(
      <DeltaBadge
        delta={{ abs: 0, pct: 0, direction: 'neutral' }}
        t={t}
        locale={TEST_LOCALE}
      />,
    );
    expect(screen.getByRole('status').dataset.direction).toBe('neutral');
  });

  it('renders "new" with i18n label when pct null', () => {
    renderUi(
      <DeltaBadge
        delta={{ abs: null, pct: null, direction: 'new' }}
        t={t}
        locale={TEST_LOCALE}
      />,
    );
    const badge = screen.getByRole('status');
    expect(badge.dataset.direction).toBe('new');
    // pct null → direction key görünür
    expect(badge.textContent).toContain('reports.delta.new');
  });

  it('renders down direction', () => {
    renderUi(
      <DeltaBadge
        delta={{ abs: -10, pct: -10, direction: 'down' }}
        t={t}
        locale={TEST_LOCALE}
      />,
    );
    expect(screen.getByRole('status').dataset.direction).toBe('down');
  });

  it('print mode adds data attribute', () => {
    renderUi(
      <DeltaBadge
        delta={{ abs: 5, pct: 5, direction: 'up' }}
        t={t}
        locale={TEST_LOCALE}
        mode="print"
      />,
    );
    expect(screen.getByRole('status').dataset.mode).toBe('print');
  });

  it('inverse semantics flips color (data-direction yine yön, sınıflar differ)', () => {
    const { container } = renderUi(
      <DeltaBadge
        delta={{ abs: 20, pct: 20, direction: 'up' }}
        t={t}
        locale={TEST_LOCALE}
        semantics="inverse"
      />,
    );
    // Inverse + up → kırmızı sınıf (text-rose-700 hint)
    expect(container.querySelector('[data-slot="delta-badge"]')?.className ?? '').toMatch(
      /rose/,
    );
  });
});
