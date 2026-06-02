import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ListsColumn } from './lists-column';
import type { CardRow, ListRow } from './types';

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
    list: {
      update: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
      archive: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
    },
  }),
}));

// useOptimisticBoardMutation kanca, sütun render path'inde hooks (useTRPC,
// useBoardCacheKeys vs.) çağırıyor; stub'lamak invaziv. Test, görsel
// davranışa odaklanır ve mutation tetiklemez.
vi.mock('@/lib/board-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/board-cache')>();
  return {
    ...actual,
    useOptimisticBoardMutation: () => ({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    }),
  };
});

function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const baseList: ListRow = {
  id: 'l1',
  title: 'Hoş geldin',
  color: null,
  icon: null,
  iconColor: null,
  position: 'a',
  archivedAt: null,
};

function card(overrides: Partial<CardRow>): CardRow {
  return {
    id: 'c-default',
    listId: 'l1',
    title: 'Kart',
    completed: false,
    completedAt: null,
    dueAt: null,
    archivedAt: null,
    position: 'a',
    ...overrides,
  };
}

describe('<ListsColumn> — sinyal yoğunluğu', () => {
  it('renders a "0 kart" placeholder for empty lists', () => {
    renderWithProviders(
      <ListsColumn
        workspaceId="w1"
        boardId="b1"
        lists={[baseList]}
        cards={[]}
        selectedListId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('0 kart')).toBeInTheDocument();
  });

  it('renders done/total progress fraction when cards exist', () => {
    const cards: CardRow[] = [
      card({ id: 'c1', completed: true, completedAt: new Date() }),
      card({ id: 'c2', completed: true, completedAt: new Date() }),
      card({ id: 'c3' }),
      card({ id: 'c4' }),
      card({ id: 'c5' }),
    ];
    renderWithProviders(
      <ListsColumn
        workspaceId="w1"
        boardId="b1"
        lists={[baseList]}
        cards={cards}
        selectedListId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('2/5')).toBeInTheDocument();
  });

  it('renders an overdue badge when any non-completed card is past due', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const cards: CardRow[] = [
      card({ id: 'c1', dueAt: yesterday }),
      card({ id: 'c2', dueAt: yesterday }),
      card({ id: 'c3', dueAt: tomorrow }),
      card({ id: 'c4' }),
    ];
    renderWithProviders(
      <ListsColumn
        workspaceId="w1"
        boardId="b1"
        lists={[baseList]}
        cards={cards}
        selectedListId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByLabelText('2 vadesi geçti')).toBeInTheDocument();
  });

  it('does not count completed cards as overdue even if their due date is past', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cards: CardRow[] = [
      card({ id: 'c1', dueAt: yesterday, completed: true, completedAt: yesterday }),
    ];
    renderWithProviders(
      <ListsColumn
        workspaceId="w1"
        boardId="b1"
        lists={[baseList]}
        cards={cards}
        selectedListId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByLabelText(/vadesi geçti/)).not.toBeInTheDocument();
  });

  it('excludes archived cards from all three counters', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cards: CardRow[] = [
      card({ id: 'c1', dueAt: yesterday, archivedAt: yesterday }),
      card({ id: 'c2', completed: true, completedAt: yesterday, archivedAt: yesterday }),
      card({ id: 'c3' }),
    ];
    renderWithProviders(
      <ListsColumn
        workspaceId="w1"
        boardId="b1"
        lists={[baseList]}
        cards={cards}
        selectedListId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('0/1')).toBeInTheDocument();
    expect(screen.queryByLabelText(/vadesi geçti/)).not.toBeInTheDocument();
  });
});

describe('<ListsColumn> — sağ tık menüsü', () => {
  it('exposes open + rename + archive for board members', async () => {
    renderWithProviders(
      <ListsColumn
        workspaceId="w1"
        boardId="b1"
        boardRole="member"
        lists={[baseList]}
        cards={[]}
        selectedListId={null}
        onSelect={() => {}}
      />,
    );
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /Hoş geldin/ }),
    });
    expect(
      await screen.findByRole('menuitem', { name: 'Aç' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Yeniden adlandır' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Arşivle' }),
    ).toBeInTheDocument();
  });

  it('exposes only "Aç" for board viewers (no rename/archive)', async () => {
    renderWithProviders(
      <ListsColumn
        workspaceId="w1"
        boardId="b1"
        boardRole="viewer"
        lists={[baseList]}
        cards={[]}
        selectedListId={null}
        onSelect={() => {}}
      />,
    );
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /Hoş geldin/ }),
    });
    // "Aç" her viewer için (board'u açar); düzenleme eylemleri member+ ister.
    expect(await screen.findByRole('menuitem', { name: 'Aç' })).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Yeniden adlandır' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Arşivle' }),
    ).not.toBeInTheDocument();
  });

  it('exposes only "Aç" on an already archived list (no rename/archive)', async () => {
    const archivedAt = new Date();
    renderWithProviders(
      <ListsColumn
        workspaceId="w1"
        boardId="b1"
        boardRole="member"
        lists={[{ ...baseList, archivedAt }]}
        cards={[]}
        selectedListId={null}
        onSelect={() => {}}
      />,
    );
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /Hoş geldin/ }),
    });
    // Arşivli liste yeniden adlandırılamaz/arşivlenemez (board ekranındaki
    // "restore" akışı tek yol) — ama board'u açmak hâlâ mümkün.
    expect(await screen.findByRole('menuitem', { name: 'Aç' })).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Yeniden adlandır' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Arşivle' }),
    ).not.toBeInTheDocument();
  });
});
