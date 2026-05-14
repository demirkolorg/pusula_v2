import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InfoTooltipButton } from './info-tooltip-button';

describe('<InfoTooltipButton>', () => {
  it('exposes an accessible info button and reveals the tooltip on focus', async () => {
    const user = userEvent.setup();
    render(<InfoTooltipButton label="Rol bilgisi" content="Workspace rolu genel erisimi belirler." />);

    const button = screen.getByRole('button', { name: 'Rol bilgisi' });
    expect(button).toBeInTheDocument();

    await user.tab();
    expect(button).toHaveFocus();
    const matches = await screen.findAllByText('Workspace rolu genel erisimi belirler.');
    expect(matches.length).toBeGreaterThan(0);
  });
});
