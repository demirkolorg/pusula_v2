import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { MoveAllCardsDialog } from './move-all-cards-dialog';

const copy = strings.board.moveAllCards;

const moveMutate = vi.fn();

// board.get verisi test başına ayarlanır.
let boardData:
  | {
      lists: Array<{ id: string; position: string; archivedAt: string | null }>;
      cards: Array<{ listId: string; archivedAt: string | null }>;
    }
  | undefined = undefined;
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: boardData, isPending: false }),
  useMutation: () => ({ mutate: moveMutate, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      get: {
        queryOptions: (input: unknown, opts: unknown) => ({ __q: 'board.get', input, opts }),
        queryFilter: (input: unknown) => ({ queryKey: ['board.get', input] }),
      },
    },
    list: { moveAllCards: { mutationOptions: (o: unknown) => o } },
  }),
}));

function setup(overrides: Record<string, unknown> = {}) {
  const props = {
    boardId: 'b1',
    fromListId: 'l_source',
    open: true,
    onOpenChange: vi.fn(),
    ...overrides,
  };
  render(<MoveAllCardsDialog {...props} />);
  return props;
}

describe('<MoveAllCardsDialog>', () => {
  beforeEach(() => {
    boardData = {
      lists: [
        { id: 'l_source', position: 'a0', archivedAt: null },
        { id: 'l_target', position: 'a1', archivedAt: null },
        { id: 'l_archived', position: 'a2', archivedAt: '2026-01-01' },
      ],
      cards: [{ listId: 'l_source', archivedAt: null }],
    };
    moveMutate.mockClear();
  });

  it('lists only active target lists (source and archived excluded) and keeps submit gated', () => {
    setup();
    expect(screen.getByText(copy.title)).toBeInTheDocument();
    // Hedef seçilene kadar submit kilitli.
    expect(screen.getByRole('button', { name: copy.submit })).toBeDisabled();
    expect(moveMutate).not.toHaveBeenCalled();
  });

  it('shows the empty state when the source list has no active cards', () => {
    boardData = {
      lists: [
        { id: 'l_source', position: 'a0', archivedAt: null },
        { id: 'l_target', position: 'a1', archivedAt: null },
      ],
      cards: [{ listId: 'l_target', archivedAt: null }],
    };
    setup();
    expect(screen.getByText(copy.empty)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.submit })).toBeDisabled();
  });

  it('shows the no-targets state when the board has only the source list', () => {
    boardData = {
      lists: [{ id: 'l_source', position: 'a0', archivedAt: null }],
      cards: [{ listId: 'l_source', archivedAt: null }],
    };
    setup();
    expect(screen.getByText(copy.noTargets)).toBeInTheDocument();
  });
});
