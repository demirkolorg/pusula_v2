import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { ChecklistItemRow, type ChecklistCommentContext } from './checklist-item-row';
import type { ChecklistItemView } from './checklist-types';

// The thread self-fetches via tRPC — stub it so the row test stays
// provider-free and asserts only the toggle/mount behaviour.
vi.mock('./checklist-item-thread', () => ({
  ChecklistItemThread: ({ checklistItemId }: { checklistItemId: string }) => (
    <div data-testid="thread">thread:{checklistItemId}</div>
  ),
}));

const copy = strings.card.checklist;

const item = (overrides: Partial<ChecklistItemView> = {}): ChecklistItemView => ({
  id: 'i1',
  checklistId: 'cl1',
  content: 'Bir madde',
  position: 'a0',
  completed: false,
  completedBy: null,
  commentCount: 0,
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
