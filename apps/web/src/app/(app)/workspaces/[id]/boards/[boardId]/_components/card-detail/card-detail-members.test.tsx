import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { cardRoleLabels, strings } from '@/lib/strings';
import { CardDetailMembers, type BoardMemberOption, type CardMember } from './card-detail-members';

const copy = strings.card.members;

const boardMembers: BoardMemberOption[] = [
  { userId: 'u1', name: 'Ada', image: null },
  { userId: 'u2', name: 'Bora', image: null },
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
    expect(screen.getByRole('button', { name: 'Kart üyesi bilgisi' })).toBeInTheDocument();

    const members: CardMember[] = [
      { userId: 'u2', name: 'Bora', image: null, role: 'assignee' },
    ];
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

  it('viewer (canEdit=false): no add form and no self-watch toggle (DEM-298)', () => {
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
    expect(screen.queryByRole('button', { name: copy.addAction })).not.toBeInTheDocument();
  });

  it('viewer already watching: row-level "Çıkar" still removes own watcher row (self-leave is allowed — DEM-298)', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <CardDetailMembers
        members={[{ userId: 'u1', name: 'Ada', image: null, role: 'watcher' }]}
        boardMembers={boardMembers}
        viewerUserId="u1"
        canEdit={false}
        onAdd={vi.fn()}
        onRemove={onRemove}
      />,
    );
    await user.click(screen.getByRole('button', { name: copy.remove }));
    expect(onRemove).toHaveBeenCalledWith({ userId: 'u1', role: 'watcher' });
  });

  it('add form filters the caller out of the board-member picker (DEM-298)', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <CardDetailMembers
        members={[]}
        // u1 = caller, u2 = someone else; the picker must hide u1.
        boardMembers={boardMembers}
        viewerUserId="u1"
        canEdit
        onAdd={onAdd}
        onRemove={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: copy.addAction }));
    await user.click(screen.getByRole('combobox', { name: copy.memberLabel }));
    expect(screen.queryByRole('option', { name: /Ada/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Bora/ })).toBeInTheDocument();
  });

  it('member: remove on a row calls onRemove with that (userId, role)', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <CardDetailMembers
        members={[{ userId: 'u2', name: 'Bora', image: null, role: 'assignee' }]}
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
