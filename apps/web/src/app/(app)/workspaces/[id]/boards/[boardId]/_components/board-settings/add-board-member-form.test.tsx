import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { AddBoardMemberForm } from './add-board-member-form';

const copy = strings.board.settings;

describe('<AddBoardMemberForm>', () => {
  it('renders an e-mail field, a role select and a submit button', () => {
    render(<AddBoardMemberForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(copy.addEmailLabel)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: copy.addRoleLabel })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.addSubmit })).toBeInTheDocument();
  });

  it('blocks submit and shows a field error on an invalid e-mail', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AddBoardMemberForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(copy.addEmailLabel), 'not-an-email');
    await user.click(screen.getByRole('button', { name: copy.addSubmit }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Geçerli bir e-posta girin')).toBeInTheDocument();
  });

  it('calls onSubmit with the normalized e-mail + default role (member) when valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AddBoardMemberForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(copy.addEmailLabel), '  Aria@Example.COM ');
    await user.click(screen.getByRole('button', { name: copy.addSubmit }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ email: 'aria@example.com', role: 'member' });
  });

  it('respects the chosen role', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AddBoardMemberForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('combobox', { name: copy.addRoleLabel }));
    await user.click(screen.getByRole('option', { name: 'İzleyici' }));
    await user.type(screen.getByLabelText(copy.addEmailLabel), 'v@example.com');
    await user.click(screen.getByRole('button', { name: copy.addSubmit }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ email: 'v@example.com', role: 'viewer' }),
    );
  });

  it('shows an inline server error (e.g. CONFLICT) and disables submit while pending', () => {
    render(<AddBoardMemberForm onSubmit={vi.fn()} pending error="Bu kişi zaten board üyesi." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Bu kişi zaten board üyesi.');
    expect(screen.getByRole('button', { name: copy.addSubmitting })).toBeDisabled();
  });

  it('shows a success notice when provided', () => {
    render(
      <AddBoardMemberForm
        onSubmit={vi.fn()}
        notice="aria@example.com e-posta adresine davet gönderildi."
      />,
    );
    expect(
      screen.getByText('aria@example.com e-posta adresine davet gönderildi.'),
    ).toBeInTheDocument();
  });

  it('rejects self-invite inline when the typed e-mail matches currentUserEmail (DEM-298)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AddBoardMemberForm onSubmit={onSubmit} currentUserEmail="me@example.com" />);

    await user.type(screen.getByLabelText(copy.addEmailLabel), '  Me@Example.COM ');
    await user.click(screen.getByRole('button', { name: copy.addSubmit }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Kendinizi davet edemezsiniz.')).toBeInTheDocument();
  });
});
