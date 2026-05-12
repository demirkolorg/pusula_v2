import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CardDetailComments, type CommentView } from './card-detail-comments';

const copy = strings.card.comments;

const nameOf = (id: string) => ({ u1: 'Ada', u2: 'Bora' })[id as 'u1' | 'u2'] ?? null;

const comments: CommentView[] = [
  {
    id: 'c1',
    authorId: 'u1',
    body: 'İlk yorum',
    editedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
  },
  {
    id: 'c2',
    authorId: 'u2',
    body: '',
    editedAt: null,
    deletedAt: new Date('2026-01-02'),
    createdAt: new Date('2026-01-02'),
  },
];

describe('<CardDetailComments>', () => {
  it('empty placeholder when there are no comments', () => {
    render(
      <CardDetailComments
        comments={[]}
        nameOf={nameOf}
        viewerUserId="u1"
        isBoardAdmin={false}
        canComment
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(copy.empty)).toBeInTheDocument();
  });

  it('renders comments with author names; a soft-deleted one shows the placeholder', () => {
    render(
      <CardDetailComments
        comments={comments}
        nameOf={nameOf}
        viewerUserId="u1"
        isBoardAdmin={false}
        canComment={false}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('İlk yorum')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText(copy.deletedPlaceholder)).toBeInTheDocument();
    // No "add comment" form for a viewer.
    expect(screen.queryByRole('button', { name: copy.addSubmit })).not.toBeInTheDocument();
  });

  it('member: adding a comment submits the trimmed body', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <CardDetailComments
        comments={[]}
        nameOf={nameOf}
        viewerUserId="u1"
        isBoardAdmin={false}
        canComment
        onCreate={onCreate}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(copy.addPlaceholder), '  Merhaba  ');
    await user.click(screen.getByRole('button', { name: copy.addSubmit }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Merhaba'));
  });

  it('author may edit/delete their own comment; not others', () => {
    render(
      <CardDetailComments
        comments={comments}
        nameOf={nameOf}
        viewerUserId="u1"
        isBoardAdmin={false}
        canComment
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // c1 is u1's (the viewer's) → has edit. c2 is deleted → no actions.
    expect(screen.getByRole('button', { name: copy.edit })).toBeInTheDocument();
  });

  it('falls back to a generic name when the author cannot be resolved', () => {
    const [first] = comments;
    if (!first) throw new Error('fixture missing');
    render(
      <CardDetailComments
        comments={[{ ...first, authorId: 'ghost' }]}
        nameOf={() => null}
        viewerUserId="u1"
        isBoardAdmin={false}
        canComment={false}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // Falls back to the userId (then the generic label if even that is empty).
    expect(screen.getByText('ghost')).toBeInTheDocument();
  });
});
