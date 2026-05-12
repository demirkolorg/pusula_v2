import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Progress } from '@pusula/ui/progress';

describe('Progress', () => {
  it('exposes value/max via ARIA and sets the fill width', () => {
    render(<Progress value={3} max={6} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '6');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('uses the success colour once complete', () => {
    render(<Progress value={6} max={6} />);
    const bar = screen.getByRole('progressbar');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.className).toContain('bg-success');
  });

  it('uses the primary colour while in progress', () => {
    render(<Progress value={1} max={6} />);
    const bar = screen.getByRole('progressbar');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.className).toContain('bg-primary');
  });

  it('honours an explicit complete flag', () => {
    render(<Progress value={1} max={6} complete />);
    const bar = screen.getByRole('progressbar');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.className).toContain('bg-success');
  });
});
