import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import {
  ChecklistItemRow,
  type ChecklistAttachmentContext,
  type ChecklistCommentContext,
} from './checklist-item-row';
import type { ChecklistItemView } from './checklist-types';

// The thread self-fetches via tRPC — stub it so the row test stays
// provider-free and asserts only the toggle/mount behaviour.
vi.mock('./checklist-item-thread', () => ({
  ChecklistItemThread: ({ checklistItemId }: { checklistItemId: string }) => (
    <div data-testid="thread">thread:{checklistItemId}</div>
  ),
}));

// The attachment gallery + uploader self-fetch via tRPC too — stub it so the
// row test stays provider-free and asserts only the toggle/mount behaviour
// (mirror of the thread stub above).
vi.mock('./checklist-item-attachments', () => ({
  ChecklistItemAttachments: ({ checklistItemId }: { checklistItemId: string }) => (
    <div data-testid="attachments">attachments:{checklistItemId}</div>
  ),
}));

// The item content is now rich text. Stub the read-only Tiptap renderer to a
// plain <div> so the row's behaviour (toggle / copy / drag / context menu) is
// tested without mounting a real Tiptap editor in jsdom, and stub the editor
// used in inline-edit mode. Everything else in @pusula/ui stays real.
vi.mock('@pusula/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pusula/ui')>();
  return {
    ...actual,
    RichTextContent: ({ value }: { value: string | null }) => (
      <div data-slot="rich-text-content">{value}</div>
    ),
    RichTextEditor: ({ ariaLabel }: { ariaLabel?: string }) => (
      <textarea aria-label={ariaLabel} data-slot="rich-text-editor" />
    ),
  };
});

// Copy goes through the shared rich-text helper (HTML + plain-text clipboard,
// not raw JSON). Stub it so we assert the row hands the stored value to the
// helper, independent of ClipboardItem availability in jsdom.
vi.mock('./rich-text-helpers', () => ({
  copyRichTextToClipboard: vi.fn(() => Promise.resolve()),
  isSameRichText: (a: string | null | undefined, b: string | null | undefined) => a === b,
}));

import { copyRichTextToClipboard } from './rich-text-helpers';

const copy = strings.card.checklist;

const item = (overrides: Partial<ChecklistItemView> = {}): ChecklistItemView => ({
  id: 'i1',
  checklistId: 'cl1',
  content: 'Bir madde',
  position: 'a0',
  completed: false,
  completedBy: null,
  commentCount: 0,
  attachmentCount: 0,
  ...overrides,
});

const commentsContext: ChecklistCommentContext = {
  cardId: 'card1',
  canComment: true,
  isBoardAdmin: false,
  viewerUserId: 'u1',
  viewerName: 'Ada',
  viewerImage: null,
};

const attachmentsContext: ChecklistAttachmentContext = {
  cardId: 'card1',
  canEdit: true,
  isBoardAdmin: false,
  viewerUserId: 'u1',
};

const renderRow = (props: Partial<Parameters<typeof ChecklistItemRow>[0]> = {}) =>
  render(
    <ul>
      <ChecklistItemRow
        item={item()}
        canEdit={false}
        pending={false}
        comments={commentsContext}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />
    </ul>,
  );

describe('<ChecklistItemRow> comment thread toggle', () => {
  it('shows the comment-count badge when there are comments', () => {
    renderRow({ item: item({ commentCount: 3 }) });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders the toggle and opens the thread on click', async () => {
    const user = userEvent.setup();
    renderRow();
    expect(screen.queryByTestId('thread')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.itemCommentsToggle }));
    expect(screen.getByTestId('thread')).toHaveTextContent('thread:i1');
    // Second click collapses it (lazy unmount).
    await user.click(screen.getByRole('button', { name: copy.itemCommentsToggleClose }));
    expect(screen.queryByTestId('thread')).not.toBeInTheDocument();
  });

  it('hides the toggle entirely when no comment context is provided', () => {
    renderRow({ comments: undefined });
    expect(
      screen.queryByRole('button', { name: copy.itemCommentsToggle }),
    ).not.toBeInTheDocument();
  });

  it('read-only viewer can still open the thread (canComment=false)', async () => {
    const user = userEvent.setup();
    renderRow({ comments: { ...commentsContext, canComment: false }, canEdit: false });
    await user.click(screen.getByRole('button', { name: copy.itemCommentsToggle }));
    expect(screen.getByTestId('thread')).toBeInTheDocument();
  });
});

describe('<ChecklistItemRow> attachment gallery toggle', () => {
  // Isolate the attachment badge from the comment badge so `getByRole` by the
  // attachment aria-label is unambiguous; the two badges are otherwise siblings.
  const renderAttachments = (props: Partial<Parameters<typeof ChecklistItemRow>[0]> = {}) =>
    renderRow({ comments: undefined, attachments: attachmentsContext, ...props });

  it('shows the attachment-count badge when there are attachments', () => {
    renderAttachments({ item: item({ attachmentCount: 2 }) });
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders the toggle and opens the gallery on click', async () => {
    const user = userEvent.setup();
    renderAttachments();
    expect(screen.queryByTestId('attachments')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.itemAttachmentsToggle }));
    expect(screen.getByTestId('attachments')).toHaveTextContent('attachments:i1');
    // Second click collapses it (lazy unmount).
    await user.click(screen.getByRole('button', { name: copy.itemAttachmentsToggleClose }));
    expect(screen.queryByTestId('attachments')).not.toBeInTheDocument();
  });

  it('hides the toggle entirely when no attachment context is provided', () => {
    renderRow({ comments: undefined, attachments: undefined });
    expect(
      screen.queryByRole('button', { name: copy.itemAttachmentsToggle }),
    ).not.toBeInTheDocument();
  });

  it('read-only viewer can still open the gallery (canEdit=false)', async () => {
    const user = userEvent.setup();
    renderAttachments({ attachments: { ...attachmentsContext, canEdit: false }, canEdit: false });
    await user.click(screen.getByRole('button', { name: copy.itemAttachmentsToggle }));
    expect(screen.getByTestId('attachments')).toBeInTheDocument();
  });
});

describe('<ChecklistItemRow> context-menu copy', () => {
  beforeEach(() => {
    vi.mocked(copyRichTextToClipboard).mockClear();
  });

  it('copies the item content to the clipboard from the context menu', async () => {
    renderRow({ item: item({ content: 'Kopyalanacak metin' }), canEdit: true });
    fireEvent.contextMenu(screen.getByText('Kopyalanacak metin'));
    const copyItem = await screen.findByRole('menuitem', { name: copy.itemContextCopy });
    fireEvent.click(copyItem);
    expect(copyRichTextToClipboard).toHaveBeenCalledWith('Kopyalanacak metin');
  });

  it('exposes the copy action to read-only viewers (canEdit=false)', async () => {
    renderRow({ item: item({ content: 'Salt okunur metin' }), canEdit: false });
    fireEvent.contextMenu(screen.getByText('Salt okunur metin'));
    const copyItem = await screen.findByRole('menuitem', { name: copy.itemContextCopy });
    fireEvent.click(copyItem);
    expect(copyRichTextToClipboard).toHaveBeenCalledWith('Salt okunur metin');
  });
});

describe('<ChecklistItemRow> drag handle', () => {
  it('shows a labelled drag handle when reorder is enabled (canEdit + registerDnd)', () => {
    const registerDnd = vi.fn(() => vi.fn());
    renderRow({ canEdit: true, registerDnd });
    expect(screen.getByRole('button', { name: copy.itemDragHandle })).toBeInTheDocument();
    // Pragmatic DnD kaydı satır + tutamaç ile çağrılır.
    expect(registerDnd).toHaveBeenCalledTimes(1);
  });

  it('hides the drag handle when reorder is disabled (no registerDnd)', () => {
    renderRow({ canEdit: true });
    expect(
      screen.queryByRole('button', { name: copy.itemDragHandle }),
    ).not.toBeInTheDocument();
  });

  it('hides the drag handle for a read-only viewer even if registerDnd is passed', () => {
    const registerDnd = vi.fn(() => vi.fn());
    renderRow({ canEdit: false, registerDnd });
    expect(
      screen.queryByRole('button', { name: copy.itemDragHandle }),
    ).not.toBeInTheDocument();
    expect(registerDnd).not.toHaveBeenCalled();
  });
});
