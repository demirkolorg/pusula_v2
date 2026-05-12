import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { DeleteAccountSection } from './delete-account-section';

const copy = strings.account.danger;

function renderSection(overrides: Partial<React.ComponentProps<typeof DeleteAccountSection>> = {}) {
  const onDelete = vi.fn();
  render(
    <DeleteAccountSection
      ownedWorkspaceCount={0}
      pending={false}
      onDelete={onDelete}
      {...overrides}
    />,
  );
  return { onDelete };
}

describe('<DeleteAccountSection>', () => {
  it('shows the blocked notice and no delete button when the user owns a workspace', () => {
    renderSection({ ownedWorkspaceCount: 2 });
    expect(screen.getByText(copy.blockedOwnerTitle)).toBeInTheDocument();
    expect(screen.getByText(copy.blockedOwnerDescription)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.goToWorkspaces })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.deleteAction })).not.toBeInTheDocument();
  });

  it('opens a password-confirmation dialog when the user owns no workspace', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole('button', { name: copy.deleteAction }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(copy.passwordLabel)).toBeInTheDocument();
  });

  it('blocks confirmation and shows an error when the password is empty', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderSection();

    await user.click(screen.getByRole('button', { name: copy.deleteAction }));
    await user.click(await screen.findByRole('button', { name: copy.confirm }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Parolanızı girin')).toBeInTheDocument();
  });

  it('calls onDelete with the password when confirmed', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderSection();

    await user.click(screen.getByRole('button', { name: copy.deleteAction }));
    await user.type(await screen.findByLabelText(copy.passwordLabel), 'supersecret');
    await user.click(screen.getByRole('button', { name: copy.confirm }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(onDelete).toHaveBeenCalledWith('supersecret');
  });

  it('surfaces a server error inside the dialog', async () => {
    const user = userEvent.setup();
    renderSection({ error: 'Parola hatalı.' });

    await user.click(screen.getByRole('button', { name: copy.deleteAction }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Parola hatalı.');
  });
});
