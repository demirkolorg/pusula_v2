import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { EditCardForm, type EditCardFormCard } from './edit-card-dialog';

const baseCard: EditCardFormCard = {
  title: 'İlk kart',
  description: 'Bir açıklama',
  dueAt: null,
};

describe('<EditCardForm>', () => {
  it('pre-fills the title and description from the card', () => {
    render(<EditCardForm card={baseCard} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(strings.board.card.titleLabel)).toHaveValue('İlk kart');
    expect(screen.getByLabelText(strings.board.card.descriptionLabel)).toHaveValue('Bir açıklama');
  });

  it('blocks submit and marks the title invalid when cleared', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EditCardForm card={baseCard} onSubmit={onSubmit} />);

    await user.clear(screen.getByLabelText(strings.board.card.titleLabel));
    await user.click(screen.getByRole('button', { name: strings.board.card.save }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(strings.board.card.titleLabel)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('submits only the changed fields', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EditCardForm card={baseCard} onSubmit={onSubmit} />);

    const title = screen.getByLabelText(strings.board.card.titleLabel);
    await user.clear(title);
    await user.type(title, 'Güncellenmiş kart');
    await user.click(screen.getByRole('button', { name: strings.board.card.save }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Güncellenmiş kart' });
  });

  it('clearing the description sends an empty string', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EditCardForm card={baseCard} onSubmit={onSubmit} />);

    await user.clear(screen.getByLabelText(strings.board.card.descriptionLabel));
    await user.click(screen.getByRole('button', { name: strings.board.card.save }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ description: '' });
  });

  it('calls onNoChange (not onSubmit) when nothing changed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onNoChange = vi.fn();
    render(<EditCardForm card={baseCard} onSubmit={onSubmit} onNoChange={onNoChange} />);

    await user.click(screen.getByRole('button', { name: strings.board.card.save }));

    await waitFor(() => expect(onNoChange).toHaveBeenCalledTimes(1));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('read-only mode: inputs disabled, no save button, close button instead', () => {
    render(<EditCardForm card={baseCard} onSubmit={vi.fn()} onCancel={vi.fn()} readOnly />);
    expect(screen.getByLabelText(strings.board.card.titleLabel)).toBeDisabled();
    expect(screen.getByLabelText(strings.board.card.descriptionLabel)).toBeDisabled();
    expect(screen.queryByRole('button', { name: strings.board.card.save })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.board.card.close })).toBeInTheDocument();
  });

  it('surfaces an inline server error and a pending submit label', () => {
    render(
      <EditCardForm card={baseCard} onSubmit={vi.fn()} pending error="Arşivli panoda düzenlenemez." />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Arşivli panoda düzenlenemez.');
    expect(screen.getByRole('button', { name: strings.board.card.saving })).toBeDisabled();
  });
});
