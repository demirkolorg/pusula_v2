import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks so the factories below can reference them.
const h = vi.hoisted(() => ({
  routerPush: vi.fn(),
  searchParams: new URLSearchParams(),
  mutate: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.routerPush, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/workspaces/w1/boards/b1',
  useSearchParams: () => h.searchParams,
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutate: h.mutate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    card: {
      archive: { mutationOptions: (o: unknown) => o },
      complete: { mutationOptions: (o: unknown) => o },
      uncomplete: { mutationOptions: (o: unknown) => o },
    },
    board: { get: { queryFilter: () => ({}) } },
  }),
}));

import { CardItem, type BoardCard } from './card-item';

const baseCard: BoardCard = {
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
  coverColor: null,
  labels: [],
  checklistTotal: 0,
  checklistDone: 0,
  commentCount: 0,
  members: [],
};

const card = (over: Partial<BoardCard>): BoardCard => ({ ...baseCard, ...over });

describe('<CardItem>', () => {
  // Pin "now" so the due-state thresholds (overdue / soon ≤ 72h) are deterministic.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-12T12:00:00Z'));
    h.mutate.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clicking the card navigates to ?card=<id> (shallow), preserving the pathname', async () => {
    const user = userEvent.setup();
    h.routerPush.mockReset();
    render(<CardItem boardId="b1" card={baseCard} canEdit={false} />);

    await user.click(screen.getByRole('button', { name: 'Bir kart' }));

    expect(h.routerPush).toHaveBeenCalledWith('/workspaces/w1/boards/b1?card=card1', {
      scroll: false,
    });
  });

  it('pressing Enter on the card opens the card detail', async () => {
    const user = userEvent.setup();
    h.routerPush.mockReset();
    render(<CardItem boardId="b1" card={baseCard} canEdit={false} />);
    const article = screen.getByRole('button', { name: 'Bir kart' });
    article.focus();
    await user.keyboard('{Enter}');
    expect(h.routerPush).toHaveBeenCalledWith('/workspaces/w1/boards/b1?card=card1', {
      scroll: false,
    });
  });

  it('viewer (canEdit=false): no quick archive button', () => {
    render(<CardItem boardId="b1" card={baseCard} canEdit={false} />);
    expect(screen.queryByRole('button', { name: /arşivle/i })).not.toBeInTheDocument();
  });

  it('canEdit=true: quick archive opens a confirm dialog (and does not also open the card)', async () => {
    const user = userEvent.setup();
    h.routerPush.mockReset();
    render(<CardItem boardId="b1" card={baseCard} canEdit />);
    await user.click(screen.getByRole('button', { name: /kartı arşivle/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(h.routerPush).not.toHaveBeenCalled();
  });

  it('canEdit=true: clicking the card title still opens the detail modal', async () => {
    const user = userEvent.setup();
    h.routerPush.mockReset();
    render(<CardItem boardId="b1" card={baseCard} canEdit />);

    await user.click(screen.getByText('Bir kart'));

    expect(h.routerPush).toHaveBeenCalledWith('/workspaces/w1/boards/b1?card=card1', {
      scroll: false,
    });
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it('renders the v1-style label count in the metadata row', () => {
    render(
      <CardItem
        boardId="b1"
        card={card({ labels: [{ labelId: 'l1', name: 'Acil', color: 'red' }] })}
        canEdit={false}
      />,
    );
    expect(screen.queryByText('Acil')).not.toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows the due chip with the "GECİKTİ" badge when the due date is in the past', () => {
    render(
      <CardItem
        boardId="b1"
        card={card({ dueAt: new Date('2026-05-01T12:00:00Z') })}
        canEdit={false}
      />,
    );
    // The metadata row component uses Date.now() by default — the date is well in
    // the past relative to 2026-05-12, so the overdue badge is shown.
    expect(screen.getByText(/gecikti/i)).toBeInTheDocument();
  });

  it('shows the checklist progress; complete checklists are styled with text-success', () => {
    const { rerender } = render(
      <CardItem
        boardId="b1"
        card={card({ checklistTotal: 3, checklistDone: 2 })}
        canEdit={false}
      />,
    );
    expect(screen.getByText('2/3')).toBeInTheDocument();
    rerender(
      <CardItem
        boardId="b1"
        card={card({ checklistTotal: 3, checklistDone: 3 })}
        canEdit={false}
      />,
    );
    const chip = screen.getByText('3/3');
    // The MetaChip wrapper carries the success colour class when complete.
    expect(chip.closest('[data-slot="meta-chip"]')).toHaveClass('text-success');
  });

  it('shows the comment count', () => {
    render(<CardItem boardId="b1" card={card({ commentCount: 5 })} canEdit={false} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows up to three member avatars plus a "+N" badge for the rest', () => {
    const members = [
      { userId: 'u1', name: 'Ada Lovelace', image: null, role: 'assignee' as const },
      { userId: 'u2', name: 'Alan Turing', image: null, role: 'watcher' as const },
      { userId: 'u3', name: 'Grace Hopper', image: null, role: 'watcher' as const },
      { userId: 'u4', name: 'Edsger Dijkstra', image: null, role: 'watcher' as const },
    ];
    render(<CardItem boardId="b1" card={card({ members })} canEdit={false} />);
    // Three avatars rendered (initials), and a "+1" overflow badge.
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument(); // Ada Lovelace
  });

  it('renders a cover-colour stripe when a cover colour is set', () => {
    render(<CardItem boardId="b1" card={card({ coverColor: 'mavi' })} canEdit={false} />);
    const article = screen.getByRole('button', { name: 'Bir kart' });
    const stripe = article.querySelector('.bg-palet-mavi');
    expect(stripe).not.toBeNull();
    expect(stripe).toHaveClass('h-3');
  });

  it('no cover stripe when the cover colour is unknown', () => {
    render(<CardItem boardId="b1" card={card({ coverColor: 'not-a-colour' })} canEdit={false} />);
    const article = screen.getByRole('button', { name: 'Bir kart' });
    expect(article.querySelector('[class*="bg-palet-"]')).toBeNull();
  });

  it('a completed card: title struck through; the complete toggle is visible and checked', () => {
    render(<CardItem boardId="b1" card={card({ completed: true })} canEdit />);
    expect(screen.getByText('Bir kart')).toHaveClass('line-through');
    const toggle = screen.getByRole('checkbox', { name: /tamamlandı/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('a not-completed card: title not struck through; toggle is unchecked', () => {
    render(<CardItem boardId="b1" card={baseCard} canEdit />);
    expect(screen.getByText('Bir kart')).not.toHaveClass('line-through');
    expect(screen.getByRole('checkbox', { name: /tamamlandı/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});
