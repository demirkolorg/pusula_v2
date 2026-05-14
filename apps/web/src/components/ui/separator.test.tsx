import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Separator } from '@pusula/ui';

describe('Separator', () => {
  it('renders a decorative horizontal separator by default', () => {
    const { container } = render(<Separator />);
    const root = container.querySelector('[data-slot="separator"]');
    expect(root).toHaveAttribute('data-orientation', 'horizontal');
    expect(root).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders a non-decorative vertical separator when requested', () => {
    render(<Separator decorative={false} orientation="vertical" />);
    const separator = screen.getByRole('separator');
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('data-orientation', 'vertical');
  });
});
