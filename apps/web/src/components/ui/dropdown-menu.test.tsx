import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@pusula/ui/dropdown-menu';

describe('DropdownMenu', () => {
  it('opens on trigger click and invokes the item handler', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Menü</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Yeniden adlandır</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('button', { name: 'Menü' }));
    const item = await screen.findByRole('menuitem', { name: 'Yeniden adlandır' });
    await user.click(item);
    expect(onSelect).toHaveBeenCalled();
  });
});
