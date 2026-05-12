import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { cardRoleLabels, strings } from '@/lib/strings';
import { CardDetailMembers, type BoardMemberOption, type CardMember } from './card-detail-members';

const copy = strings.card.members;

const boardMembers: BoardMemberOption[] = [
  { userId: 'u1', name: 'Ada' },
  { userId: 'u2', name: 'Bora' },
];

describe('<CardDetailMembers>', () => {
  it('lists members with their role badges; empty placeholder when none', () => {
    const { rerender } = render(
      <CardDetailMembers
        members={[]}
        boardMembers={boardMembers}
        viewerUserId="u1"
        canEdit
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText(copy.empty)).toBeInTheDocument();

    const members: CardMember[] = [{ userId: 'u2', name: 'Bora', role: 'assignee' }];
    rerender(
      <CardDetailMembers
        members={members}
        boardMembers={boardMembers}
        viewerUserId="u1"
        canEdit
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('Bora')).toBeInTheDocument();
    expect(screen.getByText(cardRoleLabels.assignee)).toBeInTheDocument();
  });

  it('viewer (canEdit=false): only a "watch this card" toggle for self, no add form', () => {
    render(
      <CardDetailMembers
        members={[]}
        boardMembers={boardMembers}
        viewerUserId="u1"
        canEdit={false}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: copy.watchSelf })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.addAction })).not.toBeInTheDocument();
  });

  it('viewer already watching: the toggle reads "unwatch" and removes the watcher row', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <CardDetailMembers
        members={[{ userId: 'u1', name: 'Ada', role: 'watcher' }]}
        boardMembers={boardMembers}
        viewerUserId="u1"
        canEdit={false}
        onAdd={vi.fn()}
        onRemove={onRemove}
      />,
    );
    await user.click(screen.getByRole('button', { name: copy.unwatchSelf }));
    expect(onRemove).toHaveBeenCalledWith({ userId: 'u1', role: 'watcher' });
  });

  it('member: remove on a row calls onRemove with that (userId, role)', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <CardDetailMembers
        members={[{ userId: 'u2', name: 'Bora', role: 'assignee' }]}
        boardMembers={boardMembers}
        viewerUserId="u1"
        canEdit
        onAdd={vi.fn()}
        onRemove={onRemove}
      />,
    );
    await user.click(screen.getByRole('button', { name: copy.remove }));
    expect(onRemove).toHaveBeenCalledWith({ userId: 'u2', role: 'assignee' });
  });
});
