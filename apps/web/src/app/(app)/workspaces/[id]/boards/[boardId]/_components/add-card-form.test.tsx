import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { AddCardForm } from './add-card-form';

describe('<AddCardForm>', () => {
  it('renders a card-title input and a submit button', () => {
    render(<AddCardForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(strings.board.card.addCardPlaceholder)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: strings.board.card.addCardSubmit }),
    ).toBeInTheDocument();
  });

  it('blocks submit and marks the input invalid on an empty title', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AddCardForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: strings.board.card.addCardSubmit }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(strings.board.card.addCardPlaceholder)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('calls onSubmit with the trimmed title and clears the field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AddCardForm onSubmit={onSubmit} />);

    const input = screen.getByLabelText(strings.board.card.addCardPlaceholder);
    await user.type(input, '  Login akışını tasarla  ');
    await user.click(screen.getByRole('button', { name: strings.board.card.addCardSubmit }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith('Login akışını tasarla');
    expect(input).toHaveValue('');
  });

  it('disables the input and shows the pending label while a mutation is in flight', () => {
    render(<AddCardForm onSubmit={vi.fn()} pending />);
    expect(screen.getByLabelText(strings.board.card.addCardPlaceholder)).toBeDisabled();
    expect(
      screen.getByRole('button', { name: strings.board.card.addCardSubmitting }),
    ).toBeDisabled();
  });
});
