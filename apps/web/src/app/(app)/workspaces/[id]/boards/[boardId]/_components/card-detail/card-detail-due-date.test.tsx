import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CardDetailDueDate } from './card-detail-due-date';

const copy = strings.card.detail;

describe('<CardDetailDueDate>', () => {
  it('shows the empty placeholder when there is no due date', () => {
    render(<CardDetailDueDate dueAt={null} canEdit onSave={vi.fn()} />);
    expect(screen.getByText(copy.dueEmpty)).toBeInTheDocument();
  });

  it('member: edit → set a date sends a Date at local midnight', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CardDetailDueDate dueAt={null} canEdit onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: copy.dueAdd }));
    const input = screen.getByLabelText(copy.dueLabel);
    await user.type(input, '2026-06-15');
    await user.click(screen.getByRole('button', { name: copy.dueSave }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const arg = onSave.mock.calls[0]?.[0] as Date;
    expect(arg).toBeInstanceOf(Date);
    expect(arg.getFullYear()).toBe(2026);
    expect(arg.getMonth()).toBe(5);
    expect(arg.getDate()).toBe(15);
  });

  it('member: "clear" sends null', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CardDetailDueDate dueAt={new Date(2026, 5, 15)} canEdit onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: copy.dueEdit }));
    await user.click(screen.getByRole('button', { name: copy.dueClear }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
  });

  it('read-only viewer: shows the date, no edit affordance', () => {
    render(<CardDetailDueDate dueAt={new Date(2026, 5, 15)} canEdit={false} onSave={vi.fn()} />);
    expect(screen.queryByRole('button', { name: copy.dueEdit })).not.toBeInTheDocument();
  });
});
