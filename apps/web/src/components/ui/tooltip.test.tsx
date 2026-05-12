import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tooltip, TooltipContent, TooltipTrigger } from '@pusula/ui/tooltip';

describe('Tooltip', () => {
  it('reveals its content when the trigger receives focus', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip>
        <TooltipTrigger>Bilgi</TooltipTrigger>
        <TooltipContent>Açıklama metni</TooltipContent>
      </Tooltip>,
    );

    await user.tab();
    expect(screen.getByText('Bilgi')).toHaveFocus();
    // Radix renders the content (visible node + an a11y mirror); assert at least one.
    const matches = await screen.findAllByText('Açıklama metni');
    expect(matches.length).toBeGreaterThan(0);
  });
});
