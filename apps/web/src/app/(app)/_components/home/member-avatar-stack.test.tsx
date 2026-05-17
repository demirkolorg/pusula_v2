import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { strings } from '@/lib/strings';
import { MemberAvatarStack, type StackMember } from './member-avatar-stack';

const member = (id: string, name: string): StackMember => ({ userId: id, name });

describe('<MemberAvatarStack>', () => {
  it('renders nothing when there are no members', () => {
    const { container } = render(<MemberAvatarStack members={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('labels the stack with the total member count', () => {
    render(<MemberAvatarStack members={[member('u1', 'Ada Lovelace'), member('u2', 'Alan Turing')]} />);
    expect(
      screen.getByRole('img', { name: strings.home.boards.memberStackLabel(2) }),
    ).toBeInTheDocument();
  });

  it('collapses members beyond `max` into a +N overflow chip', () => {
    const members = [
      member('u1', 'Ada Lovelace'),
      member('u2', 'Alan Turing'),
      member('u3', 'Grace Hopper'),
      member('u4', 'Edsger Dijkstra'),
      member('u5', 'Donald Knuth'),
    ];
    render(<MemberAvatarStack members={members} max={3} />);
    expect(screen.getByText(strings.home.boards.memberOverflow(2))).toBeInTheDocument();
  });
});
