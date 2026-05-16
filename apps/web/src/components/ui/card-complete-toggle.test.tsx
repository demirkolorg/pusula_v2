import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CardCompleteToggle } from '@pusula/ui/card-complete-toggle';

describe('CardCompleteToggle', () => {
  it('renders as a checkbox role reflecting the checked state', () => {
    render(<CardCompleteToggle checked={false} aria-label="Tamamla" />);
    const toggle = screen.getByRole('checkbox', { name: 'Tamamla' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('shows the checked styling and an icon when checked', () => {
    render(<CardCompleteToggle checked aria-label="Tamamla" />);
    const toggle = screen.getByRole('checkbox', { name: 'Tamamla' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle.className).toContain('bg-success');
    expect(toggle.querySelector('svg')).toBeInTheDocument();
  });

  it('calls onCheckedChange with the toggled value on click', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <CardCompleteToggle checked={false} onCheckedChange={onCheckedChange} aria-label="Tamamla" />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Tamamla' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('stays visible when alwaysVisible is set', () => {
    render(<CardCompleteToggle checked={false} alwaysVisible aria-label="Tamamla" />);
    const toggle = screen.getByRole('checkbox', { name: 'Tamamla' });
    expect(toggle.className).not.toContain('opacity-0');
  });

  it('plays the completion action when checked flips false -> true', () => {
    const { rerender } = render(<CardCompleteToggle checked={false} aria-label="Tamamla" />);
    const toggle = screen.getByRole('checkbox', { name: 'Tamamla' });
    expect(toggle.className).not.toContain('animate-card-complete-pop');

    rerender(<CardCompleteToggle checked aria-label="Tamamla" />);
    expect(toggle.className).toContain('animate-card-complete-pop');
    expect(toggle.querySelector('[data-slot="card-complete-burst"]')).toBeInTheDocument();
  });

  it('does not animate a card that is already complete on mount', () => {
    render(<CardCompleteToggle checked aria-label="Tamamla" />);
    const toggle = screen.getByRole('checkbox', { name: 'Tamamla' });
    expect(toggle.className).not.toContain('animate-card-complete-pop');
    expect(toggle.querySelector('[data-slot="card-complete-burst"]')).not.toBeInTheDocument();
  });
});
