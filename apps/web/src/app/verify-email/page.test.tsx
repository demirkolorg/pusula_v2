import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  assign: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => h.searchParams,
}));

vi.mock('@/env', () => ({
  env: { NEXT_PUBLIC_API_URL: 'http://localhost:3001' },
}));

import VerifyEmailPage, { buildVerifyEmailUrl } from './page';

describe('<VerifyEmailPage>', () => {
  beforeEach(() => {
    h.searchParams = new URLSearchParams();
    h.assign.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'http://localhost:3000', assign: h.assign },
    });
  });

  it('shows success when Better Auth redirects back without an error', async () => {
    render(<VerifyEmailPage />);
    expect(await screen.findByText(strings.auth.verifyEmail.successTitle)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: strings.auth.verifyEmail.goToApp })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('shows an invalid link state when Better Auth redirects back with error', async () => {
    h.searchParams = new URLSearchParams('error=invalid_token');
    render(<VerifyEmailPage />);
    expect(await screen.findByText(strings.auth.verifyEmail.invalidTitle)).toBeInTheDocument();
  });

  it('redirects direct web token links to the API verify endpoint', async () => {
    h.searchParams = new URLSearchParams('token=tok_verify');
    render(<VerifyEmailPage />);

    expect(await screen.findByText(strings.auth.verifyEmail.pendingTitle)).toBeInTheDocument();
    await waitFor(() =>
      expect(h.assign).toHaveBeenCalledWith(
        'http://localhost:3001/api/auth/verify-email?token=tok_verify&callbackURL=http%3A%2F%2Flocalhost%3A3000%2Fverify-email',
      ),
    );
  });
});

describe('buildVerifyEmailUrl', () => {
  it('encodes token and callback URL', () => {
    expect(
      buildVerifyEmailUrl({
        apiUrl: 'http://localhost:3001',
        token: 'a b+c',
        callbackURL: 'http://localhost:3000/verify-email',
      }),
    ).toBe(
      'http://localhost:3001/api/auth/verify-email?token=a%20b%2Bc&callbackURL=http%3A%2F%2Flocalhost%3A3000%2Fverify-email',
    );
  });
});
