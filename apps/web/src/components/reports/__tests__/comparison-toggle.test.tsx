/**
 * Faz 13G (DEM-263) — ComparisonToggle testleri.
 *
 * Switch davranışı + onChange'in `{ enabled, mode: 'previousPeriod' }`
 * şeklinde dönmesi.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@pusula/ui';
import type { ComparisonConfig, ReportRange } from '@pusula/domain';
import { ComparisonToggle } from '../composer/comparison-toggle';

const RANGE_LAST30: ReportRange = { kind: 'preset', preset: 'last30d' };

function renderToggle(
  value: ComparisonConfig,
  onChange = vi.fn(),
  range = RANGE_LAST30,
) {
  return {
    onChange,
    ...render(
      <TooltipProvider>
        <ComparisonToggle value={value} onChange={onChange} range={range} />
      </TooltipProvider>,
    ),
  };
}

describe('ComparisonToggle', () => {
  it('initial enabled=false → switch checked değil', () => {
    renderToggle({ enabled: false, mode: 'previousPeriod' });
    expect(screen.getByTestId('report-comparison-switch')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('Switch tıklanınca onChange({enabled:true, mode:"previousPeriod"})', async () => {
    const onChange = vi.fn();
    renderToggle({ enabled: false, mode: 'previousPeriod' }, onChange);
    await userEvent.click(screen.getByTestId('report-comparison-switch'));
    expect(onChange).toHaveBeenCalledWith({
      enabled: true,
      mode: 'previousPeriod',
    });
  });

  it('preset range "last30d" → toggleLabel period placeholder doldurulur', () => {
    renderToggle({ enabled: false, mode: 'previousPeriod' });
    // "Önceki Son 30 gün ile karşılaştır" — period substring var.
    expect(screen.getByText(/Son 30 gün/)).toBeInTheDocument();
  });
});
