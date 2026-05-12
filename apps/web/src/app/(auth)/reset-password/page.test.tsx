import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  routerPush: vi.fn(),
  searchParams: new URLSearchParams(),
  resetPassword: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.routerPush, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => h.searchParams,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { resetPassword: h.resetPassword },
}));

import ResetPasswordPage from './page';

const copy = strings.auth.resetPassword;

describe('<ResetPasswordPage>', () => {
  beforeEach(() => {
    h.routerPush.mockReset();
    h.resetPassword.mockReset();
    h.searchParams = new URLSearchParams();
  });

  it('with no ?token: shows the "invalid link" state + a link to /forgot-password', async () => {
    render(<ResetPasswordPage />);
    expect(await screen.findByText(copy.missingTokenTitle)).toBeInTheDocument();
    expect(screen.getByText(copy.missingTokenBody)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.requestNewLink })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('with a blank ?token (whitespace): still treated as missing', async () => {
    h.searchParams = new URLSearchParams('token=%20%20');
    render(<ResetPasswordPage />);
    expect(await screen.findByText(copy.missingTokenTitle)).toBeInTheDocument();
  });

  it('with a ?token: renders the new-password form', async () => {
    h.searchParams = new URLSearchParams('token=tok_abc');
    render(<ResetPasswordPage />);
    expect(await screen.findByLabelText(copy.newPasswordLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.confirmPasswordLabel)).toBeInTheDocument();
  });

  it('blocks submit on a short / mismatched password', async () => {
    const user = userEvent.setup();
    h.searchParams = new URLSearchParams('token=tok_abc');
    render(<ResetPasswordPage />);

    await user.type(await screen.findByLabelText(copy.newPasswordLabel), 'short');
    await user.type(screen.getByLabelText(copy.confirmPasswordLabel), 'different');
    await user.click(screen.getByRole('button', { name: copy.submit }));

    expect(h.resetPassword).not.toHaveBeenCalled();
    expect(screen.getByText('Parola en az 8 karakter olmalı')).toBeInTheDocument();
  });

  it('on a valid submit: calls resetPassword with the token and redirects to /sign-in?reset=1', async () => {
    const user = userEvent.setup();
    h.searchParams = new URLSearchParams('token=tok_abc');
    h.resetPassword.mockResolvedValue({ error: null });
    render(<ResetPasswordPage />);

    await user.type(await screen.findByLabelText(copy.newPasswordLabel), 'newsecret123');
    await user.type(screen.getByLabelText(copy.confirmPasswordLabel), 'newsecret123');
    await user.click(screen.getByRole('button', { name: copy.submit }));

    await waitFor(() =>
      expect(h.resetPassword).toHaveBeenCalledWith({ newPassword: 'newsecret123', token: 'tok_abc' }),
    );
    await waitFor(() => expect(h.routerPush).toHaveBeenCalledWith('/sign-in?reset=1'));
  });

  it('on a Better Auth error: shows the message inline + a "request new link" link, no redirect', async () => {
    const user = userEvent.setup();
    h.searchParams = new URLSearchParams('token=tok_expired');
    h.resetPassword.mockResolvedValue({ error: { message: 'Bu bağlantının süresi dolmuş.' } });
    render(<ResetPasswordPage />);

    await user.type(await screen.findByLabelText(copy.newPasswordLabel), 'newsecret123');
    await user.type(screen.getByLabelText(copy.confirmPasswordLabel), 'newsecret123');
    await user.click(screen.getByRole('button', { name: copy.submit }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu bağlantının süresi dolmuş.');
    expect(h.routerPush).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: copy.requestNewLink })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });
});
