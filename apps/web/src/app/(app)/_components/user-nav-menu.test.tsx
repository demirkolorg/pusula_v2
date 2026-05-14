import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: h.signOut },
}));

import { UserNavMenu } from './user-nav-menu';

describe('<UserNavMenu>', () => {
  beforeEach(() => {
    h.push.mockReset();
    h.replace.mockReset();
    h.signOut.mockReset();
    h.signOut.mockResolvedValue(undefined);
  });

  it('opens the avatar dropdown with account settings and sign out actions', async () => {
    const user = userEvent.setup();
    render(<UserNavMenu userName="Aria Chen" userEmail="aria@example.com" />);

    await user.click(screen.getByRole('button', { name: strings.shell.userMenu.ariaLabel }));

    expect(await screen.findByText('Aria Chen')).toBeInTheDocument();
    expect(screen.getByText('aria@example.com')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: strings.shell.userMenu.account })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: strings.shell.signOut })).toBeInTheDocument();
  });

  it('signs out and redirects to sign-in', async () => {
    const user = userEvent.setup();
    render(<UserNavMenu userName="Aria Chen" userEmail="aria@example.com" />);

    await user.click(screen.getByRole('button', { name: strings.shell.userMenu.ariaLabel }));
    await user.click(await screen.findByRole('menuitem', { name: strings.shell.signOut }));

    await waitFor(() => expect(h.signOut).toHaveBeenCalledTimes(1));
    expect(h.replace).toHaveBeenCalledWith('/sign-in');
  });
});
