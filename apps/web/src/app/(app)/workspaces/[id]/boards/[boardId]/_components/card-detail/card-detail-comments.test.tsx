import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('author opens edit + delete from the row context menu', async () => {
    const [first] = comments;
    if (!first) throw new Error('fixture missing');
    render(
      <CardDetailComments
        comments={[first]}
        nameOf={nameOf}
        viewerUserId="u1"
        isBoardAdmin={false}
        canComment
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.contextMenu(screen.getByText('İlk yorum'));
    expect(await screen.findByRole('menuitem', { name: copy.edit })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: copy.delete })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: copy.copy })).toBeInTheDocument();
  });

  it('a non-author viewer sees only copy — no edit/delete in the context menu', async () => {
    const [first] = comments;
    if (!first) throw new Error('fixture missing');
    render(
      <CardDetailComments
        comments={[first]}
        nameOf={nameOf}
        viewerUserId="u2"
        isBoardAdmin={false}
        canComment
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.contextMenu(screen.getByText('İlk yorum'));
    expect(await screen.findByRole('menuitem', { name: copy.copy })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: copy.edit })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: copy.delete })).not.toBeInTheDocument();
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
    fireEvent.contextMenu(screen.getByText('Eski düz metin'));
    await user.click(await screen.findByRole('menuitem', { name: copy.edit }));
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
    fireEvent.contextMenu(screen.getByText('Eski düz metin'));
    await user.click(await screen.findByRole('menuitem', { name: copy.edit }));
    const region = await screen.findByLabelText(copy.edit);
    await user.click(region);
    await user.keyboard(' güncel');
    await user.click(screen.getByRole('button', { name: copy.editSave }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    const { commentId, body } = onEdit.mock.calls[0]?.[0] as { commentId: string; body: string };
    expect(commentId).toBe(first.id);
    expect(JSON.parse(body)).toMatchObject({ type: 'doc' });
  });

  it('deleting a comment goes through the confirm dialog', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const [first] = comments;
    if (!first) throw new Error('fixture missing');
    render(
      <CardDetailComments
        comments={[first]}
        nameOf={nameOf}
        viewerUserId="u1"
        isBoardAdmin={false}
        canComment
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.contextMenu(screen.getByText('İlk yorum'));
    await user.click(await screen.findByRole('menuitem', { name: copy.delete }));
    // The context-menu "Sil" only opens the confirm dialog — no mutation yet.
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: copy.deleteConfirm }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('a soft-deleted comment exposes no row context menu (disabled trigger)', () => {
    const deleted = comments[1];
    if (!deleted) throw new Error('fixture missing');
    render(
      <CardDetailComments
        comments={[deleted]}
        nameOf={nameOf}
        viewerUserId="u2"
        isBoardAdmin={false}
        canComment
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // Trigger `disabled` (deleted) — right-click must not open the menu.
    fireEvent.contextMenu(screen.getByText(copy.deletedPlaceholder));
    expect(screen.queryByRole('menuitem', { name: copy.copy })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: copy.edit })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: copy.delete })).not.toBeInTheDocument();
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

describe('<CardDetailComments> context-menu copy', () => {
  const writeText = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('copies the comment body to the clipboard from the context menu', async () => {
    const [first] = comments;
    if (!first) throw new Error('fixture missing');
    render(
      <CardDetailComments
        comments={[{ ...first, body: 'Kopyalanacak yorum' }]}
        nameOf={nameOf}
        viewerUserId="u1"
        isBoardAdmin={false}
        canComment
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.contextMenu(screen.getByText('Kopyalanacak yorum'));
    fireEvent.click(await screen.findByRole('menuitem', { name: copy.copy }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Kopyalanacak yorum'));
  });

  it('exposes the copy action to read-only viewers (canComment=false)', async () => {
    const [first] = comments;
    if (!first) throw new Error('fixture missing');
    render(
      <CardDetailComments
        comments={[{ ...first, body: 'Salt okunur yorum' }]}
        nameOf={nameOf}
        viewerUserId="u1"
        isBoardAdmin={false}
        canComment={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.contextMenu(screen.getByText('Salt okunur yorum'));
    fireEvent.click(await screen.findByRole('menuitem', { name: copy.copy }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Salt okunur yorum'));
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
