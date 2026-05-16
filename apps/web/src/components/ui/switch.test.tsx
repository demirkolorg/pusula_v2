import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from '@pusula/ui/switch';

describe('Switch', () => {
  it('toggles state and fires onCheckedChange', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="E-posta bildirimleri" onCheckedChange={onCheckedChange} />);
    const switchEl = screen.getByRole('switch', { name: 'E-posta bildirimleri' });
    expect(switchEl).toHaveAttribute('data-state', 'unchecked');
    expect(switchEl).toHaveAttribute('aria-checked', 'false');

    await user.click(switchEl);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(switchEl).toHaveAttribute('data-state', 'checked');
    expect(switchEl).toHaveAttribute('aria-checked', 'true');
  });

  it('respects disabled prop and does not toggle', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Push" disabled onCheckedChange={onCheckedChange} />);
    const switchEl = screen.getByRole('switch', { name: 'Push' });
    expect(switchEl).toBeDisabled();

    await user.click(switchEl);
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(switchEl).toHaveAttribute('data-state', 'unchecked');
  });
});
