import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { ChangePasswordForm } from './change-password-form';

const copy = strings.account.password;

function renderForm(overrides: Partial<React.ComponentProps<typeof ChangePasswordForm>> = {}) {
  const onSubmit = vi.fn();
  render(<ChangePasswordForm pending={false} onSubmit={onSubmit} {...overrides} />);
  return { onSubmit };
}

describe('<ChangePasswordForm>', () => {
  it('renders current / new / confirm fields', () => {
    renderForm();
    expect(screen.getByLabelText(copy.currentLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.newLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.confirmLabel)).toBeInTheDocument();
  });

  it('blocks submit and shows errors on a missing current password / short new password', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(copy.newLabel), 'short');
    await user.type(screen.getByLabelText(copy.confirmLabel), 'short');
    await user.click(screen.getByRole('button', { name: copy.save }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Mevcut parolanızı girin')).toBeInTheDocument();
    expect(screen.getByText('Parola en az 8 karakter olmalı')).toBeInTheDocument();
  });

  it('blocks submit when the new password equals the current one', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(copy.currentLabel), 'supersecret');
    await user.type(screen.getByLabelText(copy.newLabel), 'supersecret');
    await user.type(screen.getByLabelText(copy.confirmLabel), 'supersecret');
    await user.click(screen.getByRole('button', { name: copy.save }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Yeni parola eskisinden farklı olmalı')).toBeInTheDocument();
  });

  it('blocks submit when the confirmation does not match', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(copy.currentLabel), 'supersecret');
    await user.type(screen.getByLabelText(copy.newLabel), 'newsecret123');
    await user.type(screen.getByLabelText(copy.confirmLabel), 'newsecret124');
    await user.click(screen.getByRole('button', { name: copy.save }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(copy.mismatch)).toBeInTheDocument();
  });

  it('calls onSubmit with current + new password when valid', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(copy.currentLabel), 'supersecret');
    await user.type(screen.getByLabelText(copy.newLabel), 'newsecret123');
    await user.type(screen.getByLabelText(copy.confirmLabel), 'newsecret123');
    await user.click(screen.getByRole('button', { name: copy.save }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      currentPassword: 'supersecret',
      newPassword: 'newsecret123',
    });
  });

  it('shows a server error and disables the button while pending', () => {
    renderForm({ pending: true, error: 'Mevcut parola hatalı.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Mevcut parola hatalı.');
    expect(screen.getByRole('button', { name: copy.saving })).toBeDisabled();
  });

  it('shows the success notice', () => {
    renderForm({ success: true });
    expect(screen.getByText(copy.saved)).toBeInTheDocument();
  });
});
