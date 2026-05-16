import { AVATAR_IMAGE_MAX_BYTES } from '@pusula/domain';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { ProfileForm } from './profile-form';

const copy = strings.account.profile;

type ProfileFormUpload = React.ComponentProps<typeof ProfileForm>['onUploadAvatar'];

function renderForm(overrides: Partial<React.ComponentProps<typeof ProfileForm>> = {}) {
  const onSubmit = vi.fn();
  const onUploadAvatar = vi.fn<ProfileFormUpload>(async () => 'https://cdn.example/uploaded.png');
  const view = render(
    <ProfileForm
      initialName="Aria Chen"
      initialImage={null}
      email="aria@example.com"
      pending={false}
      onSubmit={onSubmit}
      onUploadAvatar={onUploadAvatar}
      {...overrides}
    />,
  );
  return { onSubmit, onUploadAvatar, view };
}

/** The avatar `<input type="file">` is `sr-only` (a button proxies the click). */
function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('file input not found');
  return input;
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

  // --- Avatar upload (DEM-160) ----------------------------------------------

  it('renders the upload button', () => {
    renderForm();
    expect(screen.getByRole('button', { name: copy.avatarUploadButton })).toBeInTheDocument();
  });

  it('rejects a non-image file without calling onUploadAvatar', async () => {
    const { onUploadAvatar, view } = renderForm();

    // `userEvent.upload` filters files by the input's `accept` attribute, so a
    // raw `change` event is fired to exercise the component's own MIME guard
    // (the defensive check still matters — `accept` is only a hint).
    const file = new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput(view.container), { target: { files: [file] } });

    expect(onUploadAvatar).not.toHaveBeenCalled();
    expect(await screen.findByText(copy.avatarTypeError)).toBeInTheDocument();
  });

  it('rejects a file over the size limit without calling onUploadAvatar', async () => {
    const user = userEvent.setup();
    const { onUploadAvatar, view } = renderForm();

    const tooBig = new File([new Uint8Array(AVATAR_IMAGE_MAX_BYTES + 1)], 'big.png', {
      type: 'image/png',
    });
    await user.upload(fileInput(view.container), tooBig);

    expect(onUploadAvatar).not.toHaveBeenCalled();
    expect(await screen.findByText(copy.avatarSizeError)).toBeInTheDocument();
  });

  it('uploads a valid image and fills the avatar URL with the public URL', async () => {
    const user = userEvent.setup();
    const { onUploadAvatar, view } = renderForm();

    const file = new File(['img'], 'me.png', { type: 'image/png' });
    await user.upload(fileInput(view.container), file);

    await waitFor(() => expect(onUploadAvatar).toHaveBeenCalledTimes(1));
    expect(onUploadAvatar.mock.calls[0]![0]).toBe(file);
    await waitFor(() =>
      expect(screen.getByLabelText(copy.imageLabel)).toHaveValue(
        'https://cdn.example/uploaded.png',
      ),
    );
    // After an upload the button flips to "change".
    expect(screen.getByRole('button', { name: copy.avatarChangeButton })).toBeInTheDocument();
  });

  it('submits the uploaded avatar URL after a successful upload', async () => {
    const user = userEvent.setup();
    const { onSubmit, onUploadAvatar, view } = renderForm();

    const file = new File(['img'], 'me.png', { type: 'image/png' });
    await user.upload(fileInput(view.container), file);
    await waitFor(() => expect(onUploadAvatar).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByLabelText(copy.imageLabel)).toHaveValue(
        'https://cdn.example/uploaded.png',
      ),
    );

    await user.click(screen.getByRole('button', { name: copy.save }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Aria Chen',
      image: 'https://cdn.example/uploaded.png',
    });
  });

  it('shows an error when the upload fails', async () => {
    const user = userEvent.setup();
    const onUploadAvatar = vi.fn<ProfileFormUpload>(async () => {
      throw new Error('network');
    });
    const { view } = renderForm({ onUploadAvatar });

    const file = new File(['img'], 'me.png', { type: 'image/png' });
    await user.upload(fileInput(view.container), file);

    expect(await screen.findByText(copy.avatarUploadError)).toBeInTheDocument();
  });
});
