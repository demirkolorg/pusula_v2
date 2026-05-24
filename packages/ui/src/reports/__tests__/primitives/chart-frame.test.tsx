import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { ChartFrame } from '../../primitives/chart-frame';
import { renderUi, t } from '../test-utils';

describe('ChartFrame', () => {
  it('renders title when titleKey + t provided', () => {
    renderUi(
      <ChartFrame titleKey="reports.chart.title" t={t} mode="panel">
        chart
      </ChartFrame>,
    );
    expect(screen.getByText('reports.chart.title')).toBeInTheDocument();
  });

  it('omits title when titleKey absent', () => {
    renderUi(<ChartFrame mode="panel">chart</ChartFrame>);
    expect(screen.queryByText(/reports\.chart\.title/)).toBeNull();
  });

  it('applies print mode data attr + transition-none', () => {
    const { container } = renderUi(<ChartFrame mode="print">chart</ChartFrame>);
    const frame = container.querySelector('[data-slot="chart-frame"]');
    expect(frame?.getAttribute('data-mode')).toBe('print');
    expect(frame?.className).toMatch(/transition-none/);
  });

  it('respects custom height', () => {
    const { container } = renderUi(
      <ChartFrame mode="panel" height={400}>
        chart
      </ChartFrame>,
    );
    const inner = container.querySelector('[data-slot="chart-frame"] > div');
    expect((inner as HTMLElement | null)?.style.height).toBe('400px');
  });
});
