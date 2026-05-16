import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  push: vi.fn(),
  clipboardWriteText: vi.fn(),
  archivedCards: {
    data: [] as unknown[],
    isPending: false,
    isError: false,
    error: null,
  },
  searchCalls: [] as Array<{ input: Record<string, unknown>; enabled?: boolean }>,
  searchQuery: {
    data: {
      items: [
        {
          id: 'search-1',
          entityType: 'card',
          entityId: 'c1',
          workspaceId: 'w1',
          workspaceTitle: 'Ürün',
          boardId: 'b1',
          boardTitle: 'Sprint',
          cardId: 'c1',
          cardTitle: 'Etiket kartı',
          title: 'Etiket kartı',
          snippet: 'Etiketli kart açıklaması',
          rank: 1,
          targetUrl: '/workspaces/w1/boards/b1?card=c1',
          updatedAt: new Date('2026-05-14T10:00:00.000Z'),
        },
      ],
      nextCursor: null,
    },
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey?: unknown[]; enabled?: boolean }) => {
    if (options.queryKey?.[0] === 'search.query') {
      h.searchCalls.push({
        input: (options.queryKey?.[1] ?? {}) as Record<string, unknown>,
        enabled: options.enabled,
      });
      return h.searchQuery;
    }
    return h.archivedCards;
  },
  useMutation: () => ({
    mutate: h.mutate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('./board-settings/board-members-section', () => ({
  BoardMembersSection: () => <div>Üyeler paneli</div>,
}));

vi.mock('./board-settings/board-invitations-section', () => ({
  BoardInvitationsSection: () => <div>Davetler paneli</div>,
}));

vi.mock('./board-settings/background-picker', () => ({
  BoardBackgroundPicker: () => <div>Arka plan paneli</div>,
}));

vi.mock('./board-settings/board-icon-picker', () => ({
  BoardIconPicker: ({ icon }: { icon: string }) => (
    <div data-testid="board-icon-picker">Pano ikon paneli: {icon}</div>
  ),
}));

vi.mock('./board-activity-dropdown', () => ({
  BoardActivityDropdown: () => (
    <button type="button">{strings.board.topBar.activity}</button>
  ),
}));

// DEM-154 — üyelik bağlamı ayrı `BoardMembersDropdown`'a taşındı. Top bar testi
// onun iç davranışını (rozet, sekmeler) test etmez — kendi test dosyası var.
vi.mock('./board-settings/board-members-dropdown', () => ({
  BoardMembersDropdown: () => (
    <button type="button">{strings.board.topBar.members}</button>
  ),
}));

// Etiket paleti ayrı `BoardLabelsDropdown` ikon-butonuna taşındı — iç davranışı
// kendi test dosyasında doğrulanır.
vi.mock('./board-settings/board-labels-dropdown', () => ({
  BoardLabelsDropdown: () => (
    <button type="button">{strings.board.topBar.labels}</button>
  ),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      update: { mutationOptions: (o: unknown) => o },
      archive: { mutationOptions: (o: unknown) => o },
      get: { queryFilter: () => ({}) },
    },
    card: {
      archive: { mutationOptions: (o: unknown) => o },
      moveToList: { mutationOptions: (o: unknown) => o },
      listArchived: { queryOptions: (o: unknown) => o, queryFilter: () => ({}) },
    },
    list: {
      archive: { mutationOptions: (o: unknown) => o },
    },
    search: {
      query: {
        queryOptions: (input: unknown, options?: { enabled?: boolean }) => ({
          queryKey: ['search.query', input],
          enabled: options?.enabled,
        }),
      },
    },
  }),
}));

import { BoardTopBar } from './board-top-bar';

const topCopy = strings.board.topBar;
const iconMenuLabel = strings.board.settings.iconTitle;
const filterCopy = strings.board.filter;
const oldInviteShareCopy = 'Davet et / paylaş';
const actionCopy = {
  invite: 'Davet et',
  share: 'Paylaş',
  settings: 'Ayarlar',
  settingsMembers: 'Üyeler',
  settingsInvitations: 'Davetler',
  settingsLabels: 'Etiketler',
  settingsBackground: 'Arka plan',
  settingsActions: 'Pano işlemleri',
  settingsIcon: 'İkon',
};

const filterProps = {
  labels: [
    { id: 'l1', name: 'Acil', color: 'red' },
    { id: 'l2', name: 'Beklemede', color: 'blue' },
  ],
  selectedLabelIds: new Set<string>(['l1']),
  onToggleLabel: vi.fn(),
  onClearLabels: vi.fn(),
  dueDateFilter: 'all' as const,
  onDueDateFilterChange: vi.fn(),
};

describe('<BoardTopBar>', () => {
  beforeEach(() => {
    h.mutate.mockReset();
    h.archivedCards = {
      data: [],
      isPending: false,
      isError: false,
      error: null,
    };
    filterProps.onToggleLabel.mockReset();
    filterProps.onClearLabels.mockReset();
    filterProps.onDueDateFilterChange.mockReset();
    h.push.mockReset();
    h.searchCalls = [];
    h.clipboardWriteText.mockRestore?.();
    const clipboard =
      window.navigator.clipboard ??
      ({
        writeText: vi.fn(),
      } as unknown as Clipboard);
    if (!window.navigator.clipboard) {
      Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        get: () => clipboard,
      });
    }
    h.clipboardWriteText = vi.spyOn(clipboard, 'writeText').mockResolvedValue(undefined);
  });

  it('renders the board icon menu before the board title without the old workspace identity or favorite action', () => {
    const { container } = render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint Panosu"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );
    const iconMenuButton = screen.getByRole('button', { name: iconMenuLabel });
    const title = screen.getByRole('heading', { name: 'Sprint Panosu' });
    expect(title).toHaveClass('text-base');
    expect(iconMenuButton.compareDocumentPosition(title)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(container.querySelector('.uppercase')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: strings.board.detail.backToWorkspace }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: topCopy.favorite })).not.toBeInTheDocument();
  });

  it('uses the board chrome background token for the top bar surface', () => {
    const { container } = render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint Panosu"
        background="solid:mavi"
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );

    expect(container.querySelector('header')?.className).toContain('bg-board-topbar');
  });

  it('shows the archived badge beside the title when the board is archived', () => {
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Eski Pano"
        background={null}
        archived
        isBoardAdmin
        filter={filterProps}
      />,
    );
    const title = screen.getByRole('heading', { name: 'Eski Pano' });
    const badge = screen.getByText(topCopy.archivedBadge);
    expect(title.compareDocumentPosition(badge)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('non-admin: no invite control, settings are viewable, share is still available, and title is not editable', () => {
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin={false}
        filter={filterProps}
      />,
    );
    expect(screen.queryByRole('button', { name: oldInviteShareCopy })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: actionCopy.invite })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: actionCopy.settings })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: actionCopy.share })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: topCopy.more })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sprint' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sprint' })).toHaveClass('text-base');
  });

  it('opens an icon-only picker dropdown from the board icon button', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );

    expect(screen.queryByRole('tablist', { name: topCopy.eyebrow })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: iconMenuLabel }));
    expect(await screen.findByTestId('board-icon-picker')).toBeInTheDocument();
  });

  it('opens filters from the top bar action area', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );

    await user.click(screen.getByRole('button', { name: filterCopy.labelsTitle }));
    expect(await screen.findByRole('menuitemcheckbox', { name: /Acil/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Beklemede/ }));
    expect(filterProps.onToggleLabel).toHaveBeenCalledWith('l2');
    expect(
      screen.queryByRole('menuitemcheckbox', { name: filterCopy.archivedListsToggle }),
    ).not.toBeInTheDocument();
  });

  it('renders the "assigned to me" toggle and reports its pressed state', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
        assignedToMe={{ active: false, onToggle }}
      />,
    );

    const toggle = screen.getByRole('button', { name: topCopy.assignedToMe });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
        assignedToMe={{ active: true, onToggle }}
      />,
    );
    expect(screen.getByRole('button', { name: topCopy.assignedToMe })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('omits the "assigned to me" toggle when the prop is not provided', () => {
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );
    expect(
      screen.queryByRole('button', { name: topCopy.assignedToMe }),
    ).not.toBeInTheDocument();
  });

  it('opens board-scoped search from the top bar and follows result targetUrl', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );

    await user.click(screen.getByRole('button', { name: topCopy.search }));
    const input = await screen.findByRole('searchbox', { name: 'Arama sorgusu' });

    await user.type(input, 'etiket');

    await waitFor(() => {
      expect(h.searchCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            enabled: true,
            input: expect.objectContaining({
              query: 'etiket',
              workspaceId: 'w1',
              boardId: 'b1',
              limit: 10,
            }),
          }),
        ]),
      );
    });

    await user.click(screen.getByRole('button', { name: /Etiket kartı/ }));
    expect(h.push).toHaveBeenCalledWith('/workspaces/w1/boards/b1?card=c1');
  });

  it('admin active board: share/settings controls replace the old invite/share and more menu', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );
    expect(screen.queryByRole('button', { name: oldInviteShareCopy })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: topCopy.more })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: actionCopy.invite })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: actionCopy.share })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: actionCopy.settings })).toBeInTheDocument();

    // Üyelik bağlamı ayrı "Üyeler" butonunda, etiket paleti ayrı "Etiketler"
    // ikon-butonunda; ayarlar dropdown'u yalnız arka plan / pano işlemleri
    // sekmelerini taşır.
    expect(screen.getByRole('button', { name: actionCopy.settingsMembers })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: actionCopy.settingsLabels })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: actionCopy.settings }));
    expect(
      await screen.findByRole('tab', { name: actionCopy.settingsBackground }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: actionCopy.settingsActions })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: actionCopy.settingsLabels })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: actionCopy.settingsMembers })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: actionCopy.settingsInvitations }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: actionCopy.settingsIcon })).not.toBeInTheDocument();
  });

  it('admin can change the board icon from the settings actions tab', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        icon="rocket"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );

    await user.click(screen.getByRole('button', { name: actionCopy.settings }));
    await user.click(await screen.findByRole('tab', { name: actionCopy.settingsActions }));

    expect(await screen.findByTestId('board-icon-picker')).toHaveTextContent(
      'Pano ikon paneli: rocket',
    );
  });

  it('uses a horizontally scrollable settings tab row to avoid crowded tab labels', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );

    await user.click(screen.getByRole('button', { name: actionCopy.settings }));
    const tabList = await screen.findByRole('tablist');

    expect(tabList.className).toContain('w-max');
    expect(tabList.className).toContain('gap-1');
    expect(tabList.className).not.toContain('grid-cols-6');

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).toContain('shrink-0');
      expect(tab.className).toContain('px-3');
    }
  });

  it('keeps right-side board actions transparent on colored board chrome', () => {
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );

    for (const name of [actionCopy.share, actionCopy.settings]) {
      const action = screen.getByRole('button', { name });
      expect(action.className).not.toContain('bg-background');
      expect(action.className).toContain('text-[color:var(--board-chrome-fg)]');
    }
    expect(screen.queryByRole('button', { name: actionCopy.invite })).not.toBeInTheDocument();
  });

  it('admin can rename the board from the settings actions tab', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );

    await user.click(screen.getByRole('button', { name: actionCopy.settings }));
    await user.click(await screen.findByRole('tab', { name: actionCopy.settingsActions }));
    await user.click(await screen.findByRole('menuitem', { name: topCopy.menuRename }));
    const input = await screen.findByLabelText(strings.board.detail.renamePlaceholder);
    await user.clear(input);
    await user.type(input, 'Yeni Sprint');
    await user.tab();

    expect(h.mutate).toHaveBeenCalledWith(
      {
        boardId: 'b1',
        title: 'Yeni Sprint',
        clientMutationId: expect.any(String),
      },
      undefined,
    );
  });

  it('admin can rename the board inline by clicking the title', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Sprint' }));
    const input = await screen.findByLabelText(strings.board.detail.renamePlaceholder);
    expect(input).toHaveClass('text-base');
    await user.clear(input);
    await user.type(input, 'Inline Sprint');
    await user.tab();

    expect(h.mutate).toHaveBeenCalledWith(
      {
        boardId: 'b1',
        title: 'Inline Sprint',
        clientMutationId: expect.any(String),
      },
      undefined,
    );
  });

  it('admin archived board: the settings actions tab offers restore and no rename', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived
        isBoardAdmin
        filter={filterProps}
      />,
    );
    await user.click(screen.getByRole('button', { name: actionCopy.settings }));
    await user.click(await screen.findByRole('tab', { name: actionCopy.settingsActions }));
    expect(await screen.findByRole('menuitem', { name: topCopy.menuRestore })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: topCopy.menuArchive })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: topCopy.menuRename })).not.toBeInTheDocument();
  });

  it('exposes a separate Üyeler button alongside settings (DEM-154)', () => {
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );
    // Üyelik bağlamı artık "Pano ayarları"ndan ayrı kendi butonunda.
    expect(screen.getByRole('button', { name: actionCopy.settingsMembers })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: actionCopy.settings })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: actionCopy.invite })).not.toBeInTheDocument();
  });

  it('copies the canonical board link from the share button', async () => {
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: actionCopy.share }));
    await waitFor(() => {
      expect(h.clipboardWriteText).toHaveBeenCalledWith(
        `${window.location.origin}/workspaces/w1/boards/b1`,
      );
    });
  });

  it('renders the board activity dropdown trigger', () => {
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
      />,
    );

    expect(screen.getByRole('button', { name: topCopy.activity })).toBeInTheDocument();
  });

  it('opens archived items as a dropdown and exposes list and card board toggles', async () => {
    const user = userEvent.setup();
    const onToggleArchivedLists = vi.fn();
    const onToggleArchivedCards = vi.fn();
    h.archivedCards = {
      data: [
        {
          id: 'c-archived',
          boardId: 'b1',
          listId: 'l-active',
          title: 'Eski kart',
          archivedAt: new Date('2026-05-03T10:00:00.000Z'),
          listTitle: 'Aktif liste',
          listArchivedAt: null,
        },
      ],
      isPending: false,
      isError: false,
      error: null,
    };

    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
        archive={{
          canEdit: true,
          showArchivedLists: true,
          onToggleArchivedLists,
          showArchivedCards: false,
          onToggleArchivedCards,
          archivedListCount: 1,
          lists: [
            { id: 'l-active', title: 'Aktif liste', archivedAt: null },
            {
              id: 'l-archived',
              title: 'Eski liste',
              archivedAt: new Date('2026-05-01T10:00:00.000Z'),
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Arşivli öğeler' }));

    expect(screen.queryByRole('dialog', { name: 'Arşivli öğeler' })).not.toBeInTheDocument();
    expect(
      await screen.findByRole('menuitemcheckbox', { name: /Ar.ivli listeleri g.ster/ }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Eski liste')).toBeInTheDocument();
    expect(screen.getByText('Eski kart')).toBeInTheDocument();

    const cardsToggle = screen.getByRole('menuitemcheckbox', {
      name: /Ar.ivli kartlar. g.ster/,
    });
    expect(cardsToggle).toHaveAttribute('aria-checked', 'false');

    expect(screen.getAllByRole('button', { name: 'Geri yükle' })).toHaveLength(2);
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Ar.ivli listeleri g.ster/ }));
    expect(onToggleArchivedLists).toHaveBeenCalledTimes(1);
    await user.click(cardsToggle);
    expect(onToggleArchivedCards).toHaveBeenCalledTimes(1);
  });
});
