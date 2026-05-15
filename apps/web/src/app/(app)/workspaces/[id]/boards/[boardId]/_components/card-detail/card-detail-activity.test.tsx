import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { strings } from '@/lib/strings';
import { CardDetailActivity } from './card-detail-activity';
import type { CardActivityEvent } from './activity-summary';

const copy = strings.card.activity;

const events: CardActivityEvent[] = [
  {
    id: 'a1',
    type: 'card.created',
    actorId: 'u1',
    actorName: 'Ada',
    payload: {},
    createdAt: new Date('2026-01-01'),
  },
  {
    id: 'a2',
    type: 'comment.created',
    actorId: 'u2',
    actorName: 'Bora',
    payload: {},
    createdAt: new Date('2026-01-02'),
  },
];

describe('<CardDetailActivity>', () => {
  it('renders readable summary lines for each event', () => {
    render(<CardDetailActivity events={events} />);
    expect(screen.getByText('Ada kartı oluşturdu')).toBeInTheDocument();
    expect(screen.getByText('Bora yorum ekledi')).toBeInTheDocument();
  });

  it('empty placeholder when there is no activity', () => {
    render(<CardDetailActivity events={[]} />);
    expect(screen.getByText(copy.empty)).toBeInTheDocument();
  });

  it('shows a busy skeleton when pending', () => {
    const { container } = render(<CardDetailActivity events={[]} pending />);
    expect(container.querySelector('[aria-busy]')).toBeInTheDocument();
  });

  it('shows the error message when the feed failed to load', () => {
    render(<CardDetailActivity events={[]} error="boom" />);
    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});
