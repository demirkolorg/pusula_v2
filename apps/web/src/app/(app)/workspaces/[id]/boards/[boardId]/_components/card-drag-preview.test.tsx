import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardDragPreview } from './card-drag-preview';
import type { BoardCard } from './card-item';

const card: BoardCard = {
  id: 'card1',
  listId: 'l1',
  boardId: 'b1',
  title: 'Bir kart',
  description: null,
  position: 'a0',
  dueAt: null,
  archivedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  completed: false,
  coverColor: 'mavi',
  coverImageAttachmentId: null,
  coverImage: null,
  labels: [],
  checklistTotal: 0,
  checklistDone: 0,
  commentCount: 0,
  members: [],
};

describe('<CardDragPreview>', () => {
  it('renders the cover-colour stripe at the same height as the list accent', () => {
    const { container } = render(<CardDragPreview card={card} width={272} />);

    expect(screen.getByText('Bir kart')).toBeInTheDocument();
    const stripe = container.querySelector('.bg-palet-mavi');
    expect(stripe).not.toBeNull();
    expect(stripe).toHaveClass('h-1');
  });
});
