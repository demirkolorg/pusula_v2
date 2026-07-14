import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { MoveListToBoardDialog } from './move-list-to-board-dialog';

const copy = strings.board.moveListToBoard;

// Optimistic mutation wrapper — mutate'i casusla (MoveCardToBoardDialog test deseni).
const moveMutate = vi.fn();
vi.mock('@/lib/board-cache', () => ({
  useOptimisticBoardMutation: () => ({ mutate: moveMutate, isPending: false }),
  applyListRemove: (data: unknown) => data,
}));

// react-query useQuery — hangi tRPC query'si olduğunu `__q` etiketinden ayırt
// eder. board.list çalışma alanı seçilmeden `enabled:false` olduğundan bu
// testlerde `undefined` döner (adım hint gösterir).
let workspacesData: Array<{ id: string; name: string }> = [{ id: 'ws1', name: 'Alan 1' }];
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { __q?: string }) => {
    if (options?.__q === 'workspace.list') return { data: workspacesData, isPending: false };
    return { data: undefined, isPending: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    workspace: {
      list: { queryOptions: (_input: unknown, opts: unknown) => ({ __q: 'workspace.list', opts }) },
    },
    board: {
      list: {
        queryOptions: (input: unknown, opts: unknown) => ({ __q: 'board.list', input, opts }),
      },
      get: {
        queryFilter: (input: unknown) => ({ queryKey: ['board.get', input] }),
      },
    },
    list: { moveToBoard: { mutationOptions: (o: unknown) => o } },
  }),
}));

function setup(overrides: Record<string, unknown> = {}) {
  const props = {
    listId: 'l1',
    currentBoardId: 'b_current',
    open: true,
    onOpenChange: vi.fn(),
    ...overrides,
  };
  render(<MoveListToBoardDialog {...props} />);
  return props;
}

describe('<MoveListToBoardDialog>', () => {
  beforeEach(() => {
    workspacesData = [{ id: 'ws1', name: 'Alan 1' }];
    moveMutate.mockClear();
  });

  it('renders the two-step scaffold with the board step gated behind workspace selection', () => {
    setup();
    expect(screen.getByText(copy.title)).toBeInTheDocument();
    // Çalışma alanı seçilene kadar pano adımı kilitli.
    expect(screen.getByText(copy.boardDisabledHint)).toBeInTheDocument();
  });

  it('keeps submit disabled until a board is chosen', () => {
    setup();
    expect(screen.getByRole('button', { name: copy.submit })).toBeDisabled();
    expect(moveMutate).not.toHaveBeenCalled();
  });

  it('shows an empty state when the user has no workspaces', () => {
    workspacesData = [];
    setup();
    expect(screen.getByText(copy.workspacesEmpty)).toBeInTheDocument();
  });
});
