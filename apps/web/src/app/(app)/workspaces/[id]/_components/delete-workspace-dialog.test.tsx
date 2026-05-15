import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeleteWorkspaceForm } from './delete-workspace-dialog';

const WORKSPACE_NAME = 'Pazarlama Ekibi';

describe('<DeleteWorkspaceForm>', () => {
  it('renders the name-match input and the confirm button', () => {
    render(<DeleteWorkspaceForm workspaceName={WORKSPACE_NAME} onConfirm={vi.fn()} />);
    expect(screen.getByLabelText('Workspace adı')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kalıcı sil' })).toBeInTheDocument();
  });

  it('confirm button is disabled when the input is empty', () => {
    render(<DeleteWorkspaceForm workspaceName={WORKSPACE_NAME} onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Kalıcı sil' })).toBeDisabled();
  });

  it('confirm button is disabled when input does not match workspace name', async () => {
    const user = userEvent.setup();
    render(<DeleteWorkspaceForm workspaceName={WORKSPACE_NAME} onConfirm={vi.fn()} />);

    await user.type(screen.getByLabelText('Workspace adı'), 'Yanlış İsim');
    expect(screen.getByRole('button', { name: 'Kalıcı sil' })).toBeDisabled();
  });

  it('confirm button becomes enabled when input matches the workspace name exactly', async () => {
    const user = userEvent.setup();
    render(<DeleteWorkspaceForm workspaceName={WORKSPACE_NAME} onConfirm={vi.fn()} />);

    await user.type(screen.getByLabelText('Workspace adı'), WORKSPACE_NAME);
    expect(screen.getByRole('button', { name: 'Kalıcı sil' })).toBeEnabled();
  });

  it('calls onConfirm with trimmed name when the form is submitted with a matching name', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DeleteWorkspaceForm workspaceName={WORKSPACE_NAME} onConfirm={onConfirm} />);

    await user.type(screen.getByLabelText('Workspace adı'), WORKSPACE_NAME);
    await user.click(screen.getByRole('button', { name: 'Kalıcı sil' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(WORKSPACE_NAME);
  });

  it('does not call onConfirm when names do not match', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DeleteWorkspaceForm workspaceName={WORKSPACE_NAME} onConfirm={onConfirm} />);

    await user.type(screen.getByLabelText('Workspace adı'), 'Farkli İsim');
    await user.click(screen.getByRole('button', { name: 'Kalıcı sil' })).catch(() => {
      // button is disabled — click won't fire the form
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows a destructive Alert when error prop is provided', () => {
    render(
      <DeleteWorkspaceForm
        workspaceName={WORKSPACE_NAME}
        onConfirm={vi.fn()}
        error="Workspace bulunamadı."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Workspace bulunamadı.');
  });

  it('disables input and shows pending label when pending', () => {
    render(<DeleteWorkspaceForm workspaceName={WORKSPACE_NAME} onConfirm={vi.fn()} pending />);
    expect(screen.getByLabelText('Workspace adı')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siliniyor…' })).toBeDisabled();
  });
});
