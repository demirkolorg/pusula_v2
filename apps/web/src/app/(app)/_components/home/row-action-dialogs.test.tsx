import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RowArchiveDialog, RowRenameDialog } from './row-action-dialogs';

describe('<RowRenameDialog>', () => {
  it('pre-fills the input with the current value and disables submit until changed', () => {
    const onSubmit = vi.fn();
    render(
      <RowRenameDialog
        open
        onOpenChange={() => {}}
        entityLabel="Pano"
        currentValue="İlk Pano"
        isPending={false}
        onSubmit={onSubmit}
      />,
    );
    const input = screen.getByLabelText('Yeni ad') as HTMLInputElement;
    expect(input.value).toBe('İlk Pano');
    const save = screen.getByRole('button', { name: 'Kaydet' });
    // Aynı değer → no-op submit'i blokla.
    expect(save).toBeDisabled();
    expect(screen.getByText(/Ad değişmedi/)).toBeInTheDocument();
  });

  it('enables submit and surfaces the trimmed value when the input changes', async () => {
    const onSubmit = vi.fn();
    render(
      <RowRenameDialog
        open
        onOpenChange={() => {}}
        entityLabel="Pano"
        currentValue="İlk Pano"
        isPending={false}
        onSubmit={onSubmit}
      />,
    );
    const input = screen.getByLabelText('Yeni ad');
    await userEvent.clear(input);
    await userEvent.type(input, '  Yenilenmiş Pano  ');
    const save = screen.getByRole('button', { name: 'Kaydet' });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onSubmit).toHaveBeenCalledWith('Yenilenmiş Pano');
  });

  it('keeps submit disabled while empty and shows the empty-error hint', async () => {
    const onSubmit = vi.fn();
    render(
      <RowRenameDialog
        open
        onOpenChange={() => {}}
        entityLabel="Liste"
        currentValue="Hoş geldin"
        isPending={false}
        onSubmit={onSubmit}
      />,
    );
    const input = screen.getByLabelText('Yeni ad');
    await userEvent.clear(input);
    expect(screen.getByText('Ad boş olamaz.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled();
  });

  it('shows the pending label while the mutation is in flight', () => {
    render(
      <RowRenameDialog
        open
        onOpenChange={() => {}}
        entityLabel="Çalışma alanı"
        currentValue="Pazarlama"
        isPending
        onSubmit={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Kaydediliyor…' }),
    ).toBeDisabled();
  });

  it('surfaces a server-side error message inside the dialog', () => {
    render(
      <RowRenameDialog
        open
        onOpenChange={() => {}}
        entityLabel="Kart"
        currentValue="x"
        isPending={false}
        errorMessage="Bu ad alınmış."
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText('Bu ad alınmış.')).toBeInTheDocument();
  });
});

describe('<RowArchiveDialog>', () => {
  it('calls onConfirm when the destructive button is clicked', async () => {
    const onConfirm = vi.fn();
    render(
      <RowArchiveDialog
        open
        onOpenChange={() => {}}
        entityLabel="Liste"
        isPending={false}
        onConfirm={onConfirm}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Arşivle' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows a pending label and disables the destructive button while in flight', () => {
    render(
      <RowArchiveDialog
        open
        onOpenChange={() => {}}
        entityLabel="Pano"
        isPending
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Arşivleniyor…' }),
    ).toBeDisabled();
  });

  it('reflects the entity label in the dialog title', () => {
    render(
      <RowArchiveDialog
        open
        onOpenChange={() => {}}
        entityLabel="Çalışma alanı"
        isPending={false}
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Çalışma alanı arşivlensin mi?' }),
    ).toBeInTheDocument();
  });
});
