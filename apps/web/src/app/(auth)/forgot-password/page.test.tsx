import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { requestPasswordReset: h.requestPasswordReset },
}));

import ForgotPasswordPage from './page';

const copy = strings.auth.forgotPassword;

describe('<ForgotPasswordPage>', () => {
  beforeEach(() => {
    h.requestPasswordReset.mockReset();
  });

  it('renders the request form', () => {
    h.requestPasswordReset.mockResolvedValue({ error: null });
    render(<ForgotPasswordPage />);
    expect(screen.getByText(copy.title)).toBeInTheDocument();
    expect(screen.getByLabelText(strings.auth.emailLabel)).toBeInTheDocument();
  });

  it('on a successful request: calls requestPasswordReset and shows the neutral success state', async () => {
    const user = userEvent.setup();
    h.requestPasswordReset.mockResolvedValue({ error: null });
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(strings.auth.emailLabel), 'aria@example.com');
    await user.click(screen.getByRole('button', { name: copy.submit }));

    await waitFor(() =>
      expect(h.requestPasswordReset).toHaveBeenCalledWith({
        email: 'aria@example.com',
        // Absolute URL on the web app's origin (Better Auth resolves `redirectTo`
        // server-side against its own `baseURL`, which is the API server here, so
        // a relative path wouldn't work). In jsdom `window.location.origin` is
        // `http://localhost`.
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    );
    expect(await screen.findByText(copy.successTitle)).toBeInTheDocument();
    // The submitted email is echoed back, but no account-existence claim is made.
    expect(screen.getByText('aria@example.com')).toBeInTheDocument();
  });

  it('on a failed request: still shows the same success state (no account-existence oracle)', async () => {
    const user = userEvent.setup();
    h.requestPasswordReset.mockRejectedValue(new Error('network'));
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(strings.auth.emailLabel), 'ghost@example.com');
    await user.click(screen.getByRole('button', { name: copy.submit }));

    expect(await screen.findByText(copy.successTitle)).toBeInTheDocument();
    expect(screen.getByText('ghost@example.com')).toBeInTheDocument();
  });

  it('"resend" goes back to the form', async () => {
    const user = userEvent.setup();
    h.requestPasswordReset.mockResolvedValue({ error: null });
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(strings.auth.emailLabel), 'aria@example.com');
    await user.click(screen.getByRole('button', { name: copy.submit }));
    await screen.findByText(copy.successTitle);

    await user.click(screen.getByRole('button', { name: copy.resend }));
    expect(screen.getByText(copy.title)).toBeInTheDocument();
    expect(screen.getByLabelText(strings.auth.emailLabel)).toBeInTheDocument();
  });
});
