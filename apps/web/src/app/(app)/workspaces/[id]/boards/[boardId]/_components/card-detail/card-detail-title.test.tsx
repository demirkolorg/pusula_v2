import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CardDetailTitle } from './card-detail-title';

const copy = strings.card.detail;

describe('<CardDetailTitle>', () => {
  it('read-only viewer: shows the heading, no textarea', () => {
    render(<CardDetailTitle title="Kart A" canEdit={false} onSave={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Kart A' })).toBeInTheDocument();
    expect(screen.queryByLabelText(copy.titleLabel)).not.toBeInTheDocument();
  });

  it('member: blur saves the trimmed title only when changed', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CardDetailTitle title="Kart A" canEdit onSave={onSave} />);

    const input = screen.getByLabelText(copy.titleLabel);
    await user.clear(input);
    await user.type(input, '  Kart B  ');
    // Blur triggers submit (the modal commits on blur, not on a separate button).
    fireEvent.blur(input);

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Kart B'));
  });

  it('member: a no-op blur does not call onSave', () => {
    const onSave = vi.fn();
    render(<CardDetailTitle title="Kart A" canEdit onSave={onSave} />);

    // Same value → blur should be a no-op.
    const input = screen.getByLabelText(copy.titleLabel);
    fireEvent.blur(input);

    expect(onSave).not.toHaveBeenCalled();
  });

  it('blocks submit and marks invalid when the title is cleared', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CardDetailTitle title="Kart A" canEdit onSave={onSave} />);

    const input = screen.getByLabelText(copy.titleLabel);
    await user.clear(input);
    fireEvent.blur(input);

    expect(onSave).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('a completed card renders the heading struck through', () => {
    render(<CardDetailTitle title="Kart A" completed canEdit={false} onSave={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Kart A' })).toHaveClass('line-through');
  });

  it('a not-completed card heading is not struck through', () => {
    render(<CardDetailTitle title="Kart A" completed={false} canEdit={false} onSave={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Kart A' })).not.toHaveClass('line-through');
  });
});
