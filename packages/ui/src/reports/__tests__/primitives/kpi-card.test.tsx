import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { KpiCard } from '../../primitives/kpi-card';
import { renderUi, t, TEST_LOCALE } from '../test-utils';

describe('KpiCard', () => {
  it('formats number with locale', () => {
    renderUi(
      <KpiCard labelKey="reports.x.label" value={12345} t={t} locale={TEST_LOCALE} />,
    );
    // 12.345 (tr-TR)
    expect(screen.getByText(/12[.,]345/)).toBeInTheDocument();
  });

  it('formats percent', () => {
    renderUi(
      <KpiCard
        labelKey="reports.x.label"
        value={42}
        format="percent"
        t={t}
        locale={TEST_LOCALE}
      />,
    );
    expect(screen.getByText(/%/)).toBeInTheDocument();
  });

  it('formats duration with `g` suffix', () => {
    renderUi(
      <KpiCard
        labelKey="reports.x.label"
        value={4.2}
        format="duration"
        t={t}
        locale={TEST_LOCALE}
      />,
    );
    expect(screen.getByText(/4[.,]2g/)).toBeInTheDocument();
  });

  it('null value renders em-dash', () => {
    renderUi(
      <KpiCard labelKey="reports.x.label" value={null} t={t} locale={TEST_LOCALE} />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows previous value when given', () => {
    renderUi(
      <KpiCard
        labelKey="reports.x.label"
        value={100}
        previousValue={80}
        t={t}
        locale={TEST_LOCALE}
      />,
    );
    expect(screen.getByText(/reports.kpi.previousLabel/)).toBeInTheDocument();
    expect(screen.getByText(/80/)).toBeInTheDocument();
  });

  it('shows delta badge when delta passed', () => {
    renderUi(
      <KpiCard
        labelKey="reports.x.label"
        value={100}
        delta={{ abs: 20, pct: 25, direction: 'up' }}
        t={t}
        locale={TEST_LOCALE}
      />,
    );
    // delta badge role=status — kpi card aria-label da var; en az 1 status öğesi
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(1);
  });

  it('size=lg applies bigger text class', () => {
    const { container } = renderUi(
      <KpiCard
        labelKey="reports.x.label"
        value={1}
        size="lg"
        t={t}
        locale={TEST_LOCALE}
      />,
    );
    expect(container.querySelector('[data-slot="kpi-card"]')?.getAttribute('data-size')).toBe('lg');
  });
});
