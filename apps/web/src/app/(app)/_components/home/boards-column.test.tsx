import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BoardsColumn } from './boards-column';
import type { BoardRow, WorkspaceRow } from './types';

vi.mock('../../workspaces/[id]/_components/create-board-dialog', () => ({
  CreateBoardDialog: () => null,
}));

// Tooltip pass-through (Radix portal'ı testte gürültü çıkarır), useTRPC stub.
vi.mock('@pusula/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pusula/ui')>();
  return {
    ...actual,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      list: { queryKey: () => ['board.list'] },
      update: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
      archive: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
      setFavorite: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
    },
  }),
}));

function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const baseWorkspace: WorkspaceRow = {
  id: 'w1',
  name: 'Pazarlama',
  slug: 'pazarlama',
  icon: null,
  role: 'owner',
  createdAt: new Date('2026-01-01'),
  boardCount: 1,
  memberCount: 4,
  lastActivityAt: null,
};

const baseBoard: BoardRow = {
  id: 'b1',
  title: 'İlk Pano',
  icon: null,
  background: null,
  archivedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  role: 'admin',
  openCount: 0,
  doneCount: 0,
  members: [],
  favorited: false,
  lastActivityAt: null,
};

describe('<BoardsColumn> — sinyal yoğunluğu', () => {
  it('renders open/done summary when counts > 0', () => {
    renderWithProviders(
      <BoardsColumn
        workspace={baseWorkspace}
        boards={[{ ...baseBoard, openCount: 3, doneCount: 8 }]}
        selectedBoardId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('3 açık · 8 bitti')).toBeInTheDocument();
  });

  it('hides open/done summary when both counts are 0', () => {
    renderWithProviders(
      <BoardsColumn
        workspace={baseWorkspace}
        boards={[baseBoard]}
        selectedBoardId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByText(/açık · .* bitti/)).not.toBeInTheDocument();
  });

  it('renders up to 3 member avatars plus a +N overflow pill', () => {
    const board: BoardRow = {
      ...baseBoard,
      members: [
        { userId: 'u1', name: 'Ada Lovelace', image: null, role: 'admin' },
        { userId: 'u2', name: 'Alan Turing', image: null, role: 'member' },
        { userId: 'u3', name: 'Grace Hopper', image: null, role: 'member' },
        { userId: 'u4', name: 'Edsger Dijkstra', image: null, role: 'member' },
        { userId: 'u5', name: 'Linus Torvalds', image: null, role: 'member' },
      ],
    };
    renderWithProviders(
      <BoardsColumn
        workspace={baseWorkspace}
        boards={[board]}
        selectedBoardId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByLabelText('5 pano üyesi')).toBeInTheDocument();
  });

  it('renders no member stack when board has no members', () => {
    renderWithProviders(
      <BoardsColumn
        workspace={baseWorkspace}
        boards={[baseBoard]}
        selectedBoardId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByLabelText(/pano üyesi/)).not.toBeInTheDocument();
  });
});

describe('<BoardsColumn> — sağ tık menüsü', () => {
  it('exposes rename + sabitle + arşivle for a board admin', async () => {
    renderWithProviders(
      <BoardsColumn
        workspace={baseWorkspace}
        boards={[baseBoard]}
        selectedBoardId={null}
        onSelect={() => {}}
      />,
    );
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /İlk Pano/ }),
    });
    expect(
      await screen.findByRole('menuitem', { name: 'Yeniden adlandır' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Sabitle' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Arşivle' }),
    ).toBeInTheDocument();
  });

  it('shows "Sabitlemeyi kaldır" when the board is already favorited', async () => {
    renderWithProviders(
      <BoardsColumn
        workspace={baseWorkspace}
        boards={[{ ...baseBoard, favorited: true }]}
        selectedBoardId={null}
        onSelect={() => {}}
      />,
    );
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /İlk Pano/ }),
    });
    expect(
      await screen.findByRole('menuitem', { name: 'Sabitlemeyi kaldır' }),
    ).toBeInTheDocument();
  });

  it('hides rename + archive for board viewers but keeps the pin toggle', async () => {
    renderWithProviders(
      <BoardsColumn
        workspace={baseWorkspace}
        boards={[{ ...baseBoard, role: 'viewer' }]}
        selectedBoardId={null}
        onSelect={() => {}}
      />,
    );
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /İlk Pano/ }),
    });
    // Viewer için yalnız sabitle açık — favori per-user.
    expect(
      await screen.findByRole('menuitem', { name: 'Sabitle' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Yeniden adlandır' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Arşivle' }),
    ).not.toBeInTheDocument();
  });
});
