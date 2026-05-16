import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

// The attachments tab is its own trpc-wired component (Faz 11D); stub it so the
// sidebar test stays presentational.
vi.mock('./card-detail-attachments', () => ({
  CardDetailAttachments: () => <div>Ekler paneli</div>,
}));

import { CardModalSidebar } from './card-modal-sidebar';
import type { CommentView } from './card-detail-comments';
import type { CardActivityEvent } from './activity-summary';

const tabs = strings.card.detail.tabs;
const detailCopy = strings.card.detail;

const nameOf = (id: string) => ({ u1: 'Ada', u2: 'Bora' })[id as 'u1' | 'u2'] ?? null;

const comments: CommentView[] = [
  {
    id: 'c1',
    authorId: 'u1',
    body: 'Yorum bir',
    editedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-02-01'),
  },
];
const activity: CardActivityEvent[] = [
  {
    id: 'a1',
    type: 'card.created',
    actorId: 'u2',
    actorName: 'Bora',
    payload: {},
    createdAt: new Date('2026-02-02'),
  },
];

function setup(overrides: Partial<Parameters<typeof CardModalSidebar>[0]> = {}) {
  const props = {
    cardId: 'card-1',
    comments,
    activity,
    activityPending: false,
    activityError: null,
    attachmentCount: 0,
    nameOf,
    viewerUserId: 'u1',
    viewerName: 'Ada',
    isBoardAdmin: false,
    canComment: true,
    onCreateComment: vi.fn(),
    onEditComment: vi.fn(),
    onDeleteComment: vi.fn(),
    commentPending: false,
    commentError: null,
    ...overrides,
  };
  render(<CardModalSidebar {...props} />);
  return props;
}

describe('<CardModalSidebar>', () => {
  it('shows the tab strip with counts and the comment composer for an editor', () => {
    setup();
    expect(screen.getByRole('tab', { name: new RegExp(tabs.comments) })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: new RegExp(tabs.activity) })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: new RegExp(tabs.attachments) })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: new RegExp(tabs.all) })).toBeInTheDocument();
    expect(screen.getByLabelText(detailCopy.composer.placeholder)).toBeInTheDocument();
  });

  it('hides the composer for a viewer (cannot comment)', () => {
    setup({ canComment: false });
    expect(screen.queryByLabelText(detailCopy.composer.placeholder)).not.toBeInTheDocument();
  });

  it('Yorumlar tab lists comments; Aktivite tab lists activity; Ekler tab is empty', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByText('Yorum bir')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: new RegExp(tabs.activity) }));
    expect(screen.getByText('Bora kartı oluşturdu')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: new RegExp(tabs.activity) })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(screen.getByRole('tab', { name: new RegExp(tabs.attachments) }));
    expect(screen.getByText('Ekler paneli')).toBeInTheDocument();
  });

  it('the activity tab is labelled "Aktivite" (not "İşlemler")', () => {
    setup();
    expect(tabs.activity).toBe('Aktivite');
    expect(screen.getByRole('tab', { name: /Aktivite/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /İşlemler/ })).not.toBeInTheDocument();
  });
});
