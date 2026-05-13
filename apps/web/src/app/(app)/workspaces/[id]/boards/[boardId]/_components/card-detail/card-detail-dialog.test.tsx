import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// --- Hoisted state the mocks below read from -------------------------------
const h = vi.hoisted(() => ({
  // The card row returned by `trpc.card.get` (index 0 of the `useQueries` array).
  card: {
    id: 'card1',
    boardId: 'b1',
    listId: 'l1',
    title: 'Kart başlığı',
    description: null as string | null,
    position: 'a0',
    dueAt: null as Date | null,
    completed: false,
    completedAt: null as Date | null,
    completedBy: null as string | null,
    coverColor: null as string | null,
    archivedAt: null as Date | null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  // Effective board role for the viewer (`board.members.list`).
  boardRole: 'member' as 'member' | 'viewer',
}));

// A resolved query result with `data`.
const ok = (data: unknown) => ({ data, isPending: false, isError: false, error: null });

vi.mock('@tanstack/react-query', () => ({
  useQueries: ({ queries }: { queries: unknown[] }) => {
    // Order matches the dialog: card.get, card.members, card.labels, checklist.list,
    // comment.list, card.activity.list, board.members.list, label.list, board.get.
    const boardMembers = [{ userId: 'u1', name: 'Ada', role: h.boardRole }];
    const results = [
      ok({ card: h.card, relations: [] }),
      ok([]), // card members
      ok([]), // card labels
      ok([]), // checklists
      ok([]), // comments
      ok([]), // activity
      ok(boardMembers),
      ok([]), // board labels
      ok({
        board: { title: 'Pano', role: h.boardRole, archivedAt: null },
        lists: [{ id: 'l1', title: 'Liste' }],
      }),
    ];
    return results.slice(0, queries.length);
  },
  useMutation: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// A thin tRPC stub — every `*.queryOptions` / `*.queryFilter` / `*.mutationOptions`
// just returns an opaque token; the mocked react-query hooks ignore it anyway.
// A recursive proxy: any property access (and any call) yields the same proxy,
// so arbitrarily deep paths like `card.members.add.mutationOptions(...)` resolve.
const deepProxy: unknown = new Proxy(function () {} as object, {
  get: (_t, prop) => (prop === 'then' ? undefined : deepProxy),
  apply: () => deepProxy,
});
vi.mock('@/trpc/client', () => ({ useTRPC: () => deepProxy }));

import { CardDetailDialog } from './card-detail-dialog';

function renderDialog() {
  return render(
    <CardDetailDialog boardId="b1" cardId="card1" viewerUserId="u1" onClose={vi.fn()} />,
  );
}

describe('<CardDetailDialog>', () => {
  it('the modal surface uses the v1 wide layout and a column shell', () => {
    renderDialog();
    const content = document.querySelector('[data-slot="dialog-content"]')!;
    expect(content).toHaveClass('w-[min(1200px,92vw)]');
    expect(content).toHaveClass('lg:w-[70vw]');
    expect(content).toHaveClass('h-[85vh]');
    expect(content).toHaveClass('sm:max-w-none');
    expect(content).toHaveClass('max-w-none');
    expect(content).toHaveClass('flex', 'flex-col', 'overflow-hidden', 'p-0');
  });

  it('the content area is a [1fr_360px] two-column grid on md+', () => {
    renderDialog();
    const grid = document.querySelector('.md\\:grid-cols-\\[1fr_360px\\]');
    expect(grid).not.toBeNull();
    expect(grid).toHaveClass('grid');
  });

  it('renders the card title and the modal chrome', () => {
    renderDialog();
    expect(screen.getAllByText('Kart başlığı').length).toBeGreaterThan(0);
    // The sidebar tab strip is present (right column rendered).
    expect(screen.getByRole('tab', { name: /Aktivite/ })).toBeInTheDocument();
  });

  it('shows the cover-colour picker when its meta chip is opened', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: /Kapak rengi/ }));
    // The picker swatch grid (12 buttons labelled "Kapak rengi: <name>").
    expect(screen.getAllByRole('button', { name: /Kapak rengi:/ }).length).toBe(12);
  });
});
