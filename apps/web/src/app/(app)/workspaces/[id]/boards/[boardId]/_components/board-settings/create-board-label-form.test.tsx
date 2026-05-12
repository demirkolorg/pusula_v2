import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CreateBoardLabelForm } from './create-board-label-form';

const copy = strings.board.settings;

describe('<CreateBoardLabelForm>', () => {
  it('submits with the default colour and no name when nothing is typed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateBoardLabelForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: copy.labelAdd }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ color: 'green' }));
  });

  it('submits with the chosen colour and trimmed name', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateBoardLabelForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: `${copy.labelColorOf} red` }));
    await user.type(screen.getByLabelText(copy.labelNameLabel), '  Acil  ');
    await user.click(screen.getByRole('button', { name: copy.labelAdd }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ color: 'red', name: 'Acil' }));
  });

  it('surfaces an inline conflict error and disables submit while pending', () => {
    render(<CreateBoardLabelForm onSubmit={vi.fn()} pending error="Bu renk + ad ile etiket zaten var." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Bu renk + ad ile etiket zaten var.');
    expect(screen.getByRole('button', { name: copy.labelAdding })).toBeDisabled();
  });
});
