import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CardDetailTitle } from './card-detail-title';

const copy = strings.card.detail;

describe('<CardDetailTitle>', () => {
  it('read-only viewer: shows the heading, no edit affordance', () => {
    render(<CardDetailTitle title="Kart A" canEdit={false} onSave={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Kart A' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.editTitle })).not.toBeInTheDocument();
  });

  it('member: edit → input + save sends the trimmed title only when changed', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CardDetailTitle title="Kart A" canEdit onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: copy.editTitle }));
    const input = screen.getByLabelText(copy.titleLabel);
    await user.clear(input);
    await user.type(input, '  Kart B  ');
    await user.click(screen.getByRole('button', { name: copy.titleSave }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Kart B'));
  });

  it('member: a no-op save just closes the editor', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CardDetailTitle title="Kart A" canEdit onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: copy.editTitle }));
    await user.click(screen.getByRole('button', { name: copy.titleSave }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Kart A' })).toBeInTheDocument();
  });

  it('blocks submit and marks invalid when the title is cleared', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CardDetailTitle title="Kart A" canEdit onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: copy.editTitle }));
    await user.clear(screen.getByLabelText(copy.titleLabel));
    await user.click(screen.getByRole('button', { name: copy.titleSave }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText(copy.titleLabel)).toHaveAttribute('aria-invalid', 'true');
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
