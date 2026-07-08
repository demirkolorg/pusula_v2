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

// The item content is now rich text. Stub the read-only Tiptap renderer to a
// plain <div> so the row's behaviour (select / toggle / copy / drag / context
// menu) is tested without mounting a real Tiptap editor in jsdom, and stub the
// editor used in inline-edit mode. Everything else in @pusula/ui stays real.
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
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />
    </ul>,
  );

describe('<ChecklistItemRow> selection', () => {
  it('clicking the item content selects the item (default tab)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderRow({ onSelect });
    await user.click(screen.getByRole('button', { name: copy.itemSelectLabel }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    // No explicit tab — the detail keeps/derives its default tab.
    expect(onSelect).toHaveBeenCalledWith();
  });
});

describe('<ChecklistItemRow> comment badge', () => {
  it('shows the comment-count badge when there are comments', () => {
    renderRow({ item: item({ commentCount: 3 }) });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('selects the item and deep-links to the comments tab on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderRow({ onSelect });
    await user.click(screen.getByRole('button', { name: copy.itemCommentsCountLabel }));
    expect(onSelect).toHaveBeenCalledWith('comments');
  });

  it('hides the comment badge entirely when no comment context is provided', () => {
    renderRow({ comments: undefined });
    expect(
      screen.queryByRole('button', { name: copy.itemCommentsCountLabel }),
    ).not.toBeInTheDocument();
  });

  it('read-only viewer can still select via the badge (canComment=false)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderRow({ comments: { ...commentsContext, canComment: false }, canEdit: false, onSelect });
    await user.click(screen.getByRole('button', { name: copy.itemCommentsCountLabel }));
    expect(onSelect).toHaveBeenCalledWith('comments');
  });
});

describe('<ChecklistItemRow> attachment badge', () => {
  const renderAttachments = (props: Partial<Parameters<typeof ChecklistItemRow>[0]> = {}) =>
    renderRow({ comments: undefined, attachments: attachmentsContext, ...props });

  it('shows the attachment-count badge when there are attachments', () => {
    renderAttachments({ item: item({ attachmentCount: 2 }) });
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('selects the item and deep-links to the attachments tab on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderAttachments({ onSelect });
    await user.click(screen.getByRole('button', { name: copy.itemAttachmentsCountLabel }));
    expect(onSelect).toHaveBeenCalledWith('attachments');
  });

  it('hides the attachment badge entirely when no attachment context is provided', () => {
    renderRow({ comments: undefined, attachments: undefined });
    expect(
      screen.queryByRole('button', { name: copy.itemAttachmentsCountLabel }),
    ).not.toBeInTheDocument();
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

describe('<ChecklistItemRow> context-menu select', () => {
  it('selects the comments tab from the context menu', async () => {
    const onSelect = vi.fn();
    renderRow({ item: item({ content: 'Menü metni' }), canEdit: true, onSelect });
    fireEvent.contextMenu(screen.getByText('Menü metni'));
    const menuItem = await screen.findByRole('menuitem', { name: copy.itemCommentsToggle });
    fireEvent.click(menuItem);
    expect(onSelect).toHaveBeenCalledWith('comments');
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
    expect(screen.queryByRole('button', { name: copy.itemDragHandle })).not.toBeInTheDocument();
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
