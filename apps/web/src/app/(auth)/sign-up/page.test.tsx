import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  signUpEmail: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { signUp: { email: h.signUpEmail } },
}));

import SignUpPage from './page';

describe('<SignUpPage>', () => {
  beforeEach(() => {
    h.signUpEmail.mockReset();
  });

  it('renders the sign-up form in the public auth page structure', async () => {
    render(<SignUpPage />);

    expect(
      await screen.findByRole('heading', { level: 1, name: strings.auth.signUp.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.auth.signUp.submit })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: strings.auth.signUp.goToSignIn })).toHaveAttribute(
      'href',
      '/sign-in',
    );
  });

  it('passes the web verify-email callback URL to Better Auth on submit', async () => {
    const user = userEvent.setup();
    h.signUpEmail.mockResolvedValue({ error: null });
    render(<SignUpPage />);

    await user.type(screen.getByLabelText(strings.auth.nameLabel), 'Aria Chen');
    await user.type(screen.getByLabelText(strings.auth.emailLabel), 'aria@example.com');
    await user.type(screen.getByLabelText(strings.auth.passwordLabel), 'supersecret');
    await user.click(screen.getByRole('button', { name: strings.auth.signUp.submit }));

    await waitFor(() =>
      expect(h.signUpEmail).toHaveBeenCalledWith({
        name: 'Aria Chen',
        email: 'aria@example.com',
        password: 'supersecret',
        callbackURL: `${window.location.origin}/verify-email`,
      }),
    );
  });
});
