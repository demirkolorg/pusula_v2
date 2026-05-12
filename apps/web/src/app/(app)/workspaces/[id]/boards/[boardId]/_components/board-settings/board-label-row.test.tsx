import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { BoardLabelRow, type BoardLabelRowLabel } from './board-label-row';

const copy = strings.board.settings;

const label: BoardLabelRowLabel = { id: 'l1', name: 'Acil', color: 'red' };
const unnamed: BoardLabelRowLabel = { id: 'l2', name: '', color: 'blue' };

describe('<BoardLabelRow>', () => {
  it('renders the colour swatch + name; unnamed shows the placeholder', () => {
    const { rerender } = render(<BoardLabelRow label={label} canEdit={false} />);
    expect(screen.getByText('Acil')).toBeInTheDocument();
    rerender(<BoardLabelRow label={unnamed} canEdit={false} />);
    expect(screen.getByText(copy.labelUnnamed)).toBeInTheDocument();
  });

  it('viewer (canEdit=false): no edit / delete buttons', () => {
    render(<BoardLabelRow label={label} canEdit={false} />);
    expect(screen.queryByRole('button', { name: copy.labelEdit })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.labelDelete })).not.toBeInTheDocument();
  });

  it('member: editing → changing name/colour → save calls onUpdate with the diff only', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<BoardLabelRow label={label} canEdit onUpdate={onUpdate} />);
    await user.click(screen.getByRole('button', { name: copy.labelEdit }));
    const nameInput = screen.getByLabelText(copy.labelNameLabel);
    await user.clear(nameInput);
    await user.type(nameInput, 'Acele');
    await user.click(screen.getByRole('button', { name: copy.labelSave }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ name: 'Acele' }));
  });

  it('member: editing with no change → save is a no-op (no onUpdate)', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<BoardLabelRow label={label} canEdit onUpdate={onUpdate} />);
    await user.click(screen.getByRole('button', { name: copy.labelEdit }));
    await user.click(screen.getByRole('button', { name: copy.labelSave }));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('member: delete → confirm dialog → onConfirm calls onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<BoardLabelRow label={label} canEdit onDelete={onDelete} />);
    await user.click(screen.getByRole('button', { name: copy.labelDelete }));
    await user.click(screen.getByRole('button', { name: copy.labelDeleteConfirm }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('surfaces an inline error (e.g. colour+name conflict)', () => {
    render(<BoardLabelRow label={label} canEdit error="Bu renk + ad ile etiket zaten var." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Bu renk + ad ile etiket zaten var.');
  });
});
