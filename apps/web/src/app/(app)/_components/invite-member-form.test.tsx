import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InviteMemberForm } from './invite-member-form';

describe('<InviteMemberForm>', () => {
  it('renders an e-mail field and a submit button', () => {
    render(<InviteMemberForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('E-posta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Davet gönder' })).toBeInTheDocument();
  });

  it('blocks submit and shows a field error on an invalid e-mail', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InviteMemberForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('E-posta'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Davet gönder' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Geçerli bir e-posta girin')).toBeInTheDocument();
  });

  it('calls onSubmit with the normalized e-mail when valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InviteMemberForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('E-posta'), '  Aria@Example.COM ');
    await user.click(screen.getByRole('button', { name: 'Davet gönder' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith('aria@example.com');
  });

  it('shows an inline server error and disables the submit button while pending', () => {
    render(
      <InviteMemberForm onSubmit={vi.fn()} pending error="Bu kullanıcı zaten workspace üyesi." />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Bu kullanıcı zaten workspace üyesi.');
    expect(screen.getByRole('button', { name: 'Gönderiliyor…' })).toBeDisabled();
  });

  it('wires the cancel button to onCancel when provided', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<InviteMemberForm onSubmit={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'İptal' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('rejects self-invite inline when the typed e-mail matches currentUserEmail (DEM-298)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InviteMemberForm onSubmit={onSubmit} currentUserEmail="me@example.com" />);

    // Same address, different case + surrounding whitespace — must still match
    // after normalization and block the mutation before it leaves the form.
    await user.type(screen.getByLabelText('E-posta'), '  Me@Example.COM ');
    await user.click(screen.getByRole('button', { name: 'Davet gönder' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Kendinizi davet edemezsiniz.')).toBeInTheDocument();
  });
});
