import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CardCommentComposer, CardDetailComments, type CommentView } from './card-detail-comments';

const copy = strings.card.comments;
const detailCopy = strings.card.detail;

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
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('İlk yorum')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText(copy.deletedPlaceholder)).toBeInTheDocument();
  });

  it('author may edit/delete their own comment; not others', () => {
    render(
      <CardDetailComments
        comments={comments}
        nameOf={nameOf}
        viewerUserId="u1"
        isBoardAdmin={false}
        canComment
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: copy.edit })).toBeInTheDocument();
  });

  it('editing a legacy plain-text comment and saving without a semantic change is a no-op', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const [first] = comments;
    if (!first) throw new Error('fixture missing');
    render(
      <CardDetailComments
        comments={[{ ...first, body: 'Eski düz metin' }]}
        nameOf={nameOf}
        viewerUserId="u1"
        isBoardAdmin={false}
        canComment
        onEdit={onEdit}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: copy.edit }));
    // Editor seeded from the legacy plain text (now a Tiptap JSON serialisation).
    const region = await screen.findByLabelText(copy.edit);
    // Touch the editor so its `onChange` fires with the JSON serialisation, then
    // restore the original text — body is JSON now but semantically unchanged.
    await user.click(region);
    await user.keyboard('X{Backspace}');
    await user.click(screen.getByRole('button', { name: copy.editSave }));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('editing a comment and saving a real change fires the mutation', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const [first] = comments;
    if (!first) throw new Error('fixture missing');
    render(
      <CardDetailComments
        comments={[{ ...first, body: 'Eski düz metin' }]}
        nameOf={nameOf}
        viewerUserId="u1"
        isBoardAdmin={false}
        canComment
        onEdit={onEdit}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: copy.edit }));
    const region = await screen.findByLabelText(copy.edit);
    await user.click(region);
    await user.keyboard(' güncel');
    await user.click(screen.getByRole('button', { name: copy.editSave }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    const { commentId, body } = onEdit.mock.calls[0]?.[0] as { commentId: string; body: string };
    expect(commentId).toBe(first.id);
    expect(JSON.parse(body)).toMatchObject({ type: 'doc' });
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
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('ghost')).toBeInTheDocument();
  });
});

describe('<CardCommentComposer>', () => {
  it('Gönder is disabled until the editor has content, then submits a JSON body', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CardCommentComposer viewerName="Ada" onSubmit={onSubmit} />);

    const send = screen.getByRole('button', { name: new RegExp(detailCopy.composer.submit) });
    expect(send).toBeDisabled();

    await user.click(screen.getByLabelText(detailCopy.composer.placeholder));
    await user.keyboard('Merhaba');
    expect(send).toBeEnabled();

    await user.click(send);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const body = onSubmit.mock.calls[0]?.[0] as string;
    expect(() => JSON.parse(body)).not.toThrow();
    expect(JSON.parse(body)).toMatchObject({ type: 'doc' });
  });
});
