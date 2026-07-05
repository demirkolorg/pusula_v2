import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

import { CardModalSidebar } from './card-modal-sidebar';
import type { CommentView } from './card-detail-comments';
import type { CardActivityEvent } from './activity-summary';

const tabs = strings.card.detail.tabs;
const detailCopy = strings.card.detail;

const nameOf = (id: string) => ({ u1: 'Ada', u2: 'Bora' })[id as 'u1' | 'u2'] ?? null;
const imageOf = () => null;

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
    actorImage: null,
    payload: {},
    createdAt: new Date('2026-02-02'),
  },
];

function setup(overrides: Partial<Parameters<typeof CardModalSidebar>[0]> = {}) {
  const props = {
    comments,
    activity,
    activityPending: false,
    activityError: null,
    nameOf,
    imageOf,
    viewerUserId: 'u1',
    viewerName: 'Ada',
    viewerImage: null,
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
  it('shows the tab strip (Yorumlar / Aktivite) with the comment composer for an editor', () => {
    setup();
    expect(screen.getByRole('tab', { name: new RegExp(tabs.comments) })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: new RegExp(tabs.activity) })).toBeInTheDocument();
    expect(screen.getByLabelText(detailCopy.composer.placeholder)).toBeInTheDocument();
  });

  it('no longer renders an "Ekler" or "Tümü" tab', () => {
    setup();
    expect(
      screen.queryByRole('tab', { name: new RegExp(tabs.attachments) }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Tümü/ })).not.toBeInTheDocument();
  });

  it('hides the composer for a viewer (cannot comment)', () => {
    setup({ canComment: false });
    expect(screen.queryByLabelText(detailCopy.composer.placeholder)).not.toBeInTheDocument();
  });

  it('Yorumlar tab lists comments; Aktivite tab lists activity', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByText('Yorum bir')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: new RegExp(tabs.activity) }));
    expect(screen.getByText('Bora kartı oluşturdu')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: new RegExp(tabs.activity) })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('the comment composer lives only in the Yorumlar tab', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByLabelText(detailCopy.composer.placeholder)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: new RegExp(tabs.activity) }));
    expect(screen.queryByLabelText(detailCopy.composer.placeholder)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: new RegExp(tabs.comments) }));
    expect(screen.getByLabelText(detailCopy.composer.placeholder)).toBeInTheDocument();
  });

  it('the activity tab is labelled "Aktivite" (not "İşlemler")', () => {
    setup();
    expect(tabs.activity).toBe('Aktivite');
    expect(screen.getByRole('tab', { name: /Aktivite/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /İşlemler/ })).not.toBeInTheDocument();
  });
});
