import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthForm } from './auth-form';

describe('<AuthForm>', () => {
  it('sign-in: renders email + password, no name field', () => {
    render(<AuthForm variant="sign-in" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('E-posta')).toBeInTheDocument();
    expect(screen.getByLabelText('Parola')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ad')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
  });

  it('sign-up: also renders the name field', () => {
    render(<AuthForm variant="sign-up" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Ad')).toBeInTheDocument();
    expect(screen.getByLabelText('E-posta')).toBeInTheDocument();
    expect(screen.getByLabelText('Parola')).toBeInTheDocument();
  });

  it('blocks submit and shows field errors on an invalid email / short password', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AuthForm variant="sign-in" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('E-posta'), 'not-an-email');
    await user.type(screen.getByLabelText('Parola'), 'short');
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Geçerli bir e-posta girin')).toBeInTheDocument();
    expect(screen.getByText('Parola en az 8 karakter olmalı')).toBeInTheDocument();
  });

  it('calls onSubmit with normalized values when valid (sign-in)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AuthForm variant="sign-in" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('E-posta'), '  Aria@Example.COM ');
    await user.type(screen.getByLabelText('Parola'), 'supersecret');
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ email: 'aria@example.com', password: 'supersecret' });
  });

  it('calls onSubmit with name + email + password when valid (sign-up)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AuthForm variant="sign-up" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Ad'), '  Aria Chen ');
    await user.type(screen.getByLabelText('E-posta'), 'aria@example.com');
    await user.type(screen.getByLabelText('Parola'), 'supersecret');
    await user.click(screen.getByRole('button', { name: 'Kayıt ol' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Aria Chen',
      email: 'aria@example.com',
      password: 'supersecret',
    });
  });

  it('shows an inline server error and disables the submit button while pending', () => {
    render(
      <AuthForm variant="sign-in" onSubmit={vi.fn()} pending error="E-posta veya parola hatalı." />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('E-posta veya parola hatalı.');
    expect(screen.getByRole('button', { name: 'Giriş yapılıyor…' })).toBeDisabled();
  });
});
