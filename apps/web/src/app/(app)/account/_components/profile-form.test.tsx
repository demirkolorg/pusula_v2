import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { ProfileForm } from './profile-form';

const copy = strings.account.profile;

function renderForm(overrides: Partial<React.ComponentProps<typeof ProfileForm>> = {}) {
  const onSubmit = vi.fn();
  render(
    <ProfileForm
      initialName="Aria Chen"
      initialImage={null}
      email="aria@example.com"
      pending={false}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { onSubmit };
}

describe('<ProfileForm>', () => {
  it('prefills name + email and renders the avatar URL field', () => {
    renderForm();
    expect(screen.getByLabelText(copy.nameLabel)).toHaveValue('Aria Chen');
    expect(screen.getByLabelText(copy.emailLabel)).toHaveValue('aria@example.com');
    expect(screen.getByLabelText(copy.emailLabel)).toBeDisabled();
    expect(screen.getByLabelText(copy.imageLabel)).toHaveValue('');
  });

  it('blocks submit and shows an error when the name is empty', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.clear(screen.getByLabelText(copy.nameLabel));
    await user.click(screen.getByRole('button', { name: copy.save }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Ad gerekli')).toBeInTheDocument();
  });

  it('blocks submit and shows an error when the avatar URL is invalid', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(copy.imageLabel), 'not-a-url');
    await user.click(screen.getByRole('button', { name: copy.save }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Geçerli bir bağlantı girin')).toBeInTheDocument();
  });

  it('reports "no change" instead of submitting when nothing changed', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(screen.getByRole('button', { name: copy.save }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(copy.noChange)).toBeInTheDocument();
  });

  it('submits trimmed name + a valid URL; empty URL becomes null', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm({ initialImage: 'https://old.example/a.png' });

    await user.clear(screen.getByLabelText(copy.nameLabel));
    await user.type(screen.getByLabelText(copy.nameLabel), '  Aria  ');
    await user.clear(screen.getByLabelText(copy.imageLabel));
    await user.click(screen.getByRole('button', { name: copy.save }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Aria', image: null });
  });

  it('submits a new avatar URL when changed', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(copy.imageLabel), 'https://cdn.example/avatar.png');
    await user.click(screen.getByRole('button', { name: copy.save }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Aria Chen',
      image: 'https://cdn.example/avatar.png',
    });
  });

  it('shows the saved notice and a server error, and disables the button while pending', () => {
    renderForm({ pending: true, error: 'Sunucu hatası.', success: false });
    expect(screen.getByRole('alert')).toHaveTextContent('Sunucu hatası.');
    expect(screen.getByRole('button', { name: copy.saving })).toBeDisabled();
  });

  it('shows the saved notice on success', () => {
    renderForm({ success: true });
    expect(screen.getByText(copy.saved)).toBeInTheDocument();
  });
});
