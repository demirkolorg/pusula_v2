import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => h.searchParams,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { email: vi.fn() } },
}));

import SignInPage from './page';

describe('<SignInPage>', () => {
  beforeEach(() => {
    h.searchParams = new URLSearchParams();
  });

  it('renders the sign-in form with a "forgot password" link', async () => {
    render(<SignInPage />);
    expect(await screen.findByRole('button', { name: strings.auth.signIn.submit })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: strings.auth.signIn.forgotPassword })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('does not show the reset flash by default', async () => {
    render(<SignInPage />);
    await screen.findByRole('button', { name: strings.auth.signIn.submit });
    expect(screen.queryByText(strings.auth.signIn.resetDone)).not.toBeInTheDocument();
  });

  it('shows the reset flash when ?reset=1 is present', async () => {
    h.searchParams = new URLSearchParams('reset=1');
    render(<SignInPage />);
    expect(await screen.findByText(strings.auth.signIn.resetDone)).toBeInTheDocument();
  });
});
