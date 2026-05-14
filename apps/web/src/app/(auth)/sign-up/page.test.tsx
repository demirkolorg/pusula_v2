import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

vi.mock('@/lib/auth-client', () => ({
  authClient: { signUp: { email: vi.fn() } },
}));

import SignUpPage from './page';

describe('<SignUpPage>', () => {
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
});
