import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { strings } from '@/lib/strings';
import { NotificationBellPlaceholder } from './notification-bell-placeholder';

describe('<NotificationBellPlaceholder>', () => {
  it('renders a disabled notification button with a coming-soon tooltip', async () => {
    const user = userEvent.setup();
    render(<NotificationBellPlaceholder />);

    const button = screen.getByRole('button', { name: strings.shell.notifications.label });
    expect(button).toBeDisabled();

    await user.hover(button.parentElement ?? button);
    expect((await screen.findAllByText(strings.shell.notifications.soon)).length).toBeGreaterThan(
      0,
    );
  });
});
