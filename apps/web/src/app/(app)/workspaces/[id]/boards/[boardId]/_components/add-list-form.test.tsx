import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { AddListForm } from './add-list-form';

describe('<AddListForm>', () => {
  it('renders a list-title input and a submit button', () => {
    render(<AddListForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(strings.board.column.addListPlaceholder)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: strings.board.column.addListSubmit }),
    ).toBeInTheDocument();
  });

  it('blocks submit and shows a field error on an empty title', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AddListForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: strings.board.column.addListSubmit }));

    expect(onSubmit).not.toHaveBeenCalled();
    const input = screen.getByLabelText(strings.board.column.addListPlaceholder);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('calls onSubmit with the trimmed title and clears the field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AddListForm onSubmit={onSubmit} />);

    const input = screen.getByLabelText(strings.board.column.addListPlaceholder);
    await user.type(input, '  Yapılacaklar  ');
    await user.click(screen.getByRole('button', { name: strings.board.column.addListSubmit }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith('Yapılacaklar');
    expect(input).toHaveValue('');
  });

  it('disables the input and shows the pending label while a mutation is in flight', () => {
    render(<AddListForm onSubmit={vi.fn()} pending />);
    expect(screen.getByLabelText(strings.board.column.addListPlaceholder)).toBeDisabled();
    expect(
      screen.getByRole('button', { name: strings.board.column.addListSubmitting }),
    ).toBeDisabled();
  });

  it('surfaces a server-side error inline', () => {
    render(<AddListForm onSubmit={vi.fn()} error="Arşivli panoya liste eklenemez." />);
    expect(screen.getByText('Arşivli panoya liste eklenemez.')).toBeInTheDocument();
  });
});
