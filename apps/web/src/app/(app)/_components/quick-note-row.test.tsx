import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import type { QuickNote } from '@/lib/use-quick-note-mutations';
import { QuickNoteRow } from './quick-note-row';

const copy = strings.board.quickNotes;

function makeNote(overrides: Partial<QuickNote> = {}): QuickNote {
  const now = new Date('2026-05-18T10:00:00.000Z');
  return { id: 'qn_1', content: 'süt al', createdAt: now, updatedAt: now, ...overrides };
}

describe('<QuickNoteRow>', () => {
  it('renders the note body with edit + delete actions', () => {
    render(
      <QuickNoteRow note={makeNote()} canConvert onUpdate={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText('süt al')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.editAction })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.deleteAction })).toBeInTheDocument();
  });

  it('shows the convert-by-drag hint only when convert is allowed', () => {
    const { rerender } = render(
      <QuickNoteRow note={makeNote()} canConvert onUpdate={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText(copy.dragHint)).toBeInTheDocument();

    rerender(
      <QuickNoteRow note={makeNote()} canConvert={false} onUpdate={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.queryByText(copy.dragHint)).not.toBeInTheDocument();
  });

  it('edits inline: saving changed text calls onUpdate with the trimmed value', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <QuickNoteRow note={makeNote()} canConvert onUpdate={onUpdate} onDelete={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: copy.editAction }));
    const field = screen.getByLabelText(copy.editPlaceholder);
    await user.clear(field);
    await user.type(field, '  ekmek al  ');
    await user.click(screen.getByRole('button', { name: copy.editSubmit }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('ekmek al'));
  });

  it('does not call onUpdate when the edited text is unchanged', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <QuickNoteRow note={makeNote()} canConvert onUpdate={onUpdate} onDelete={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: copy.editAction }));
    await user.click(screen.getByRole('button', { name: copy.editSubmit }));

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('deletes only after the confirmation dialog is accepted', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <QuickNoteRow note={makeNote()} canConvert onUpdate={vi.fn()} onDelete={onDelete} />,
    );

    await user.click(screen.getByRole('button', { name: copy.deleteAction }));
    // dialog is open, nothing deleted yet
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: copy.deleteConfirmAction }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('disables actions for an optimistic (not-yet-saved) note', () => {
    render(
      <QuickNoteRow
        note={makeNote({ id: 'tmp-abc' })}
        canConvert
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: copy.editAction })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.deleteAction })).toBeDisabled();
    // a pending note is not draggable → no drag hint
    expect(screen.queryByText(copy.dragHint)).not.toBeInTheDocument();
  });
});
