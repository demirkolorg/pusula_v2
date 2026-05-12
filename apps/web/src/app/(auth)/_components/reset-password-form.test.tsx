import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { ResetPasswordForm } from './reset-password-form';

const copy = strings.auth.resetPassword;

function renderForm(overrides: Partial<React.ComponentProps<typeof ResetPasswordForm>> = {}) {
  const onSubmit = vi.fn();
  render(<ResetPasswordForm token="tok_abc" onSubmit={onSubmit} {...overrides} />);
  return { onSubmit };
}

describe('<ResetPasswordForm>', () => {
  it('renders new + confirm password fields', () => {
    renderForm();
    expect(screen.getByLabelText(copy.newPasswordLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.confirmPasswordLabel)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.submit })).toBeInTheDocument();
  });

  it('blocks submit and shows an error on a short password', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(copy.newPasswordLabel), 'short');
    await user.type(screen.getByLabelText(copy.confirmPasswordLabel), 'short');
    await user.click(screen.getByRole('button', { name: copy.submit }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Parola en az 8 karakter olmalı')).toBeInTheDocument();
  });

  it('blocks submit when the confirmation does not match', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(copy.newPasswordLabel), 'newsecret123');
    await user.type(screen.getByLabelText(copy.confirmPasswordLabel), 'newsecret124');
    await user.click(screen.getByRole('button', { name: copy.submit }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(copy.passwordMismatch)).toBeInTheDocument();
  });

  it('calls onSubmit with the new password when valid', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(copy.newPasswordLabel), 'newsecret123');
    await user.type(screen.getByLabelText(copy.confirmPasswordLabel), 'newsecret123');
    await user.click(screen.getByRole('button', { name: copy.submit }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith('newsecret123');
  });

  it('surfaces an inline server error and disables the button while pending', () => {
    renderForm({ pending: true, error: 'Bu bağlantının süresi dolmuş.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Bu bağlantının süresi dolmuş.');
    expect(screen.getByRole('button', { name: copy.submitting })).toBeDisabled();
  });
});
