import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { ForgotPasswordForm } from './forgot-password-form';

const copy = strings.auth.forgotPassword;

describe('<ForgotPasswordForm>', () => {
  it('renders an email field and the submit button', () => {
    render(<ForgotPasswordForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(strings.auth.emailLabel)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.submit })).toBeInTheDocument();
  });

  it('blocks submit and shows an inline error on an invalid email', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ForgotPasswordForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(strings.auth.emailLabel), 'not-an-email');
    await user.click(screen.getByRole('button', { name: copy.submit }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Geçerli bir e-posta girin')).toBeInTheDocument();
  });

  it('calls onSubmit with the normalized email when valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ForgotPasswordForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(strings.auth.emailLabel), '  Aria@Example.COM ');
    await user.click(screen.getByRole('button', { name: copy.submit }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith('aria@example.com');
  });

  it('disables the input and button while pending', () => {
    render(<ForgotPasswordForm onSubmit={vi.fn()} pending />);
    expect(screen.getByLabelText(strings.auth.emailLabel)).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.submitting })).toBeDisabled();
  });
});
