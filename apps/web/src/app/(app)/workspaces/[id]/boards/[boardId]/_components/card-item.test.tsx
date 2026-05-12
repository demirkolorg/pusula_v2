import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Hoisted mocks so the factories below can reference them.
const h = vi.hoisted(() => ({
  routerPush: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.routerPush, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/workspaces/w1/boards/b1',
  useSearchParams: () => h.searchParams,
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({ card: { archive: { mutationOptions: (o: unknown) => o } }, board: { get: { queryFilter: () => ({}) } } }),
}));

import { CardItem, type BoardCard } from './card-item';

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
  labels: [],
};

describe('<CardItem>', () => {
  it('clicking the title navigates to ?card=<id> (shallow), preserving the pathname', async () => {
    const user = userEvent.setup();
    h.routerPush.mockReset();
    render(<CardItem boardId="b1" card={card} canEdit={false} />);

    await user.click(screen.getByRole('button', { name: 'Bir kart' }));

    expect(h.routerPush).toHaveBeenCalledWith('/workspaces/w1/boards/b1?card=card1', { scroll: false });
  });

  it('viewer (canEdit=false): no quick archive button', () => {
    render(<CardItem boardId="b1" card={card} canEdit={false} />);
    expect(screen.queryByRole('button', { name: /arşivle/i })).not.toBeInTheDocument();
  });

  it('renders label chips for the card labels', () => {
    render(
      <CardItem
        boardId="b1"
        card={{ ...card, labels: [{ labelId: 'l1', name: 'Acil', color: 'red' }] }}
        canEdit={false}
      />,
    );
    expect(screen.getByText('Acil')).toBeInTheDocument();
  });
});
