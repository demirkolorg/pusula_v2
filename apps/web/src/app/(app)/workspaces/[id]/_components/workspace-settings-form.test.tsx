import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceSettingsForm } from './workspace-settings-form';

describe('<WorkspaceSettingsForm>', () => {
  it('renders name and slug fields pre-filled with the current values', () => {
    render(
      <WorkspaceSettingsForm
        name="Pazarlama Ekibi"
        slug="pazarlama-ekibi"
        icon="briefcase"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Workspace adı')).toHaveValue('Pazarlama Ekibi');
    expect(screen.getByLabelText('Adres (slug)')).toHaveValue('pazarlama-ekibi');
  });

  it('disables submit until something changed', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSettingsForm name="Ekip" slug="ekip" icon="briefcase" onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled();

    await user.type(screen.getByLabelText('Workspace adı'), ' v2');
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeEnabled();
  });

  it('blocks submit and shows field errors on an invalid name and slug', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<WorkspaceSettingsForm name="Ekip" slug="ekip" icon="briefcase" onSubmit={onSubmit} />);

    await user.clear(screen.getByLabelText('Workspace adı'));
    await user.type(screen.getByLabelText('Adres (slug)'), 'X'); // uppercase → fails the slug regex/min

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(onSubmit).not.toHaveBeenCalled();
    // Two distinct field errors (name required + slug invalid).
    const adInput = screen.getByLabelText('Workspace adı');
    const slugInput = screen.getByLabelText('Adres (slug)');
    expect(adInput).toHaveAttribute('aria-invalid', 'true');
    expect(slugInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('calls onSubmit with the trimmed values when valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <WorkspaceSettingsForm
        name="Ekip"
        slug="ekip"
        icon="briefcase"
        onSubmit={onSubmit}
      />,
    );

    const adInput = screen.getByLabelText('Workspace adı');
    await user.clear(adInput);
    await user.type(adInput, '  Yeni Ekip  ');
    const slugInput = screen.getByLabelText('Adres (slug)');
    await user.clear(slugInput);
    await user.type(slugInput, '  yeni-ekip  ');
    await user.click(screen.getByRole('button', { name: 'Hedef' }));

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Yeni Ekip',
      slug: 'yeni-ekip',
      icon: 'target',
    });
  });

  it('shows an inline server error and a pending submit label', () => {
    render(
      <WorkspaceSettingsForm
        name="Ekip"
        slug="ekip"
        icon="briefcase"
        onSubmit={vi.fn()}
        pending
        error="Bu slug zaten kullanımda."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Bu slug zaten kullanımda.');
    expect(screen.getByRole('button', { name: 'Kaydediliyor…' })).toBeDisabled();
  });
});
