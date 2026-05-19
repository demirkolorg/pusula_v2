import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Hoisted mocks so the factories below can reference them.
const h = vi.hoisted(() => ({
  routerPush: vi.fn(),
  searchParams: new URLSearchParams(),
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  registerCard: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.routerPush, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/workspaces/w1/boards/b1',
  useSearchParams: () => h.searchParams,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { url: 'https://storage.test/card-cover.png' } }),
  useMutation: () => ({
    mutate: h.mutate,
    mutateAsync: h.mutateAsync,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    attachment: {
      // Faz 11B (DEM-148) — cover upload migrated to `initiate` + `commit`.
      initiate: { mutationOptions: (o: unknown) => o },
      commit: { mutationOptions: (o: unknown) => o },
      list: { mutationOptions: (o: unknown) => o, queryOptions: () => ({}) },
      update: { mutationOptions: (o: unknown) => o },
      delete: { mutationOptions: (o: unknown) => o },
      // DEM-227 — kart kapağı artık `attachment.getDownloadUrl` query'si yapmaz;
      // presigned URL `board.get` yanıtındaki `coverImageUrl` ile gelir.
    },
    card: {
      archive: { mutationOptions: (o: unknown) => o },
      complete: { mutationOptions: (o: unknown) => o },
      uncomplete: { mutationOptions: (o: unknown) => o },
      update: { mutationOptions: (o: unknown) => o },
      get: { queryFilter: () => ({}) },
      members: {
        add: { mutationOptions: (o: unknown) => o },
        remove: { mutationOptions: (o: unknown) => o },
        list: { queryFilter: () => ({}) },
      },
      labels: {
        add: { mutationOptions: (o: unknown) => o },
        remove: { mutationOptions: (o: unknown) => o },
        list: { queryFilter: () => ({}) },
      },
    },
    board: { get: { queryFilter: () => ({}) } },
    // Faz 9D (DEM-130) — kart context menüsü artık ShareDialog'u render ediyor;
    // dialog kapalı iken `share.list` query `enabled: false` olsa da hooks mount edilir.
    share: {
      list: {
        queryOptions: (input: unknown, options?: Record<string, unknown>) => ({
          input,
          ...(options ?? {}),
        }),
        queryKey: (input: unknown) => ['share', 'list', input],
      },
      create: { mutationOptions: (o: unknown) => o },
      revoke: { mutationOptions: (o: unknown) => o },
    },
  }),
}));

import { CardItem, type BoardCard } from './card-item';
import { BoardDndProvider } from './board-dnd-context';
import type { BoardDnd } from './use-board-dnd';

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
  coverImageAttachmentId: null,
  coverImage: null,
  coverImageUrl: null,
  labels: [],
  checklistTotal: 0,
  checklistDone: 0,
  commentCount: 0,
  members: [],
};

const card = (over: Partial<BoardCard>): BoardCard => ({ ...baseCard, ...over });

const lists = [
  {
    id: 'l1',
    title: 'Yapılacak',
    position: 'a0',
    color: null,
    icon: null,
    iconColor: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  {
    id: 'l2',
    title: 'Devam Eden',
    position: 'b0',
    color: null,
    icon: null,
    iconColor: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
];

const labels = [
  { id: 'label-urgent', name: 'Acil', color: 'red' },
  { id: 'label-health', name: 'Sağlık', color: 'green' },
];

const boardMembers = [
  { userId: 'u1', name: 'Ayşe Çelik' },
  { userId: 'u2', name: 'Mehmet Yıldız' },
];

const makeDnd = (over: Partial<BoardDnd> = {}): BoardDnd => ({
  enabled: true,
  dragState: { kind: 'idle' },
  cardPlaceholder: null,
  listPlaceholder: null,
  registerCard: h.registerCard,
  registerListCardsArea: () => () => {},
  registerColumn: () => () => {},
  moveCardToListEnd: vi.fn(),
  moveColumnByOne: vi.fn(),
  ...over,
});

describe('<CardItem>', () => {
  // Pin "now" so the due-state thresholds (overdue / soon ≤ 72h) are deterministic.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-12T12:00:00Z'));
    h.mutate.mockReset();
    h.mutateAsync.mockReset();
    h.registerCard.mockReset();
    h.registerCard.mockReturnValue(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  it('canEdit=true: separate quick move/archive buttons are not rendered on the card', () => {
    render(
      <BoardDndProvider value={makeDnd()}>
        <CardItem
          boardId="b1"
          card={baseCard}
          canEdit
          allLists={lists}
          boardLabels={labels}
          boardMembers={boardMembers}
        />
      </BoardDndProvider>,
    );

    expect(screen.queryByRole('button', { name: /taşı/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /kartı arşivle/i })).not.toBeInTheDocument();
  });

  it('canEdit=true: right-click opens the card context menu without opening the card', async () => {
    const user = userEvent.setup();
    h.routerPush.mockReset();
    render(
      <BoardDndProvider value={makeDnd()}>
        <CardItem
          boardId="b1"
          card={baseCard}
          canEdit
          allLists={lists}
          boardLabels={labels}
          boardMembers={boardMembers}
        />
      </BoardDndProvider>,
    );

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Bir kart' }));

    expect(await screen.findByRole('menuitem', { name: /^kapak$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /etiketler/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /sorumlular/i })).toBeInTheDocument();
    expect(screen.queryByText(/yetkililer/i)).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /son tarih/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /taşı/i })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: /kartı arşivle/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(h.routerPush).not.toHaveBeenCalled();
  });

  it('can upload a cover photo from the cover context menu (Faz 11B two-phase commit)', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    // Faz 11B (DEM-148) — cover upload now triggers three mutateAsync calls:
    // (1) attachment.initiate → presigned PUT + attachmentId (draft).
    // (2) attachment.commit → stamps committed_at + returns the full row.
    // (3) card.update → links the committed attachment as the cover.
    h.mutateAsync
      .mockResolvedValueOnce({
        attachmentId: 'att-new',
        upload: {
          url: 'https://storage.test/put',
          headers: { 'content-type': 'image/png' },
        },
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      })
      .mockResolvedValueOnce({
        id: 'att-new',
        fileName: 'cover.png',
        mimeType: 'image/png',
        size: 5,
        kind: 'image',
        description: null,
        uploader: { id: 'u1', name: 'u1', image: null },
        createdAt: new Date(),
        committedAt: new Date(),
        isCover: false,
      })
      .mockResolvedValueOnce(undefined);

    render(
      <BoardDndProvider value={makeDnd()}>
        <CardItem
          boardId="b1"
          card={baseCard}
          canEdit
          allLists={lists}
          boardLabels={labels}
          boardMembers={boardMembers}
        />
      </BoardDndProvider>,
    );

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Bir kart' }));
    const coverMenu = await screen.findByRole('menuitem', { name: /^kapak$/i });
    await user.hover(coverMenu);

    expect(
      await screen.findByRole('menuitem', { name: /^kapak fotoğrafı yükle$/i }),
    ).toBeInTheDocument();

    const file = new File(['cover'], 'cover.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/^kapak fotoğrafı yükle$/i), {
      target: { files: [file] },
    });

    await vi.waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(3));
    // (1) initiate carries the file metadata + a clientMutationId.
    expect(h.mutateAsync.mock.calls[0]?.[0]).toMatchObject({
      cardId: 'card1',
      fileName: 'cover.png',
      mimeType: 'image/png',
      size: file.size,
    });
    expect(fetchMock).toHaveBeenCalledWith('https://storage.test/put', {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: file,
    });
    // (2) commit confirms the upload by attachmentId.
    expect(h.mutateAsync.mock.calls[1]?.[0]).toMatchObject({
      attachmentId: 'att-new',
    });
    // (3) card.update links the cover.
    expect(h.mutateAsync.mock.calls[2]?.[0]).toMatchObject({
      cardId: 'card1',
      coverImageAttachmentId: 'att-new',
    });
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

  it('renders labels in the bottom-right metadata group with the other card signals', () => {
    render(
      <CardItem
        boardId="b1"
        card={card({
          labels: [
            { labelId: 'l1', name: 'Acil', color: 'red' },
            { labelId: 'l2', name: 'Sağlık', color: 'green' },
          ],
          commentCount: 5,
          members: [{ userId: 'u1', name: 'Ada Lovelace', image: null, role: 'assignee' }],
        })}
        canEdit={false}
      />,
    );

    const article = screen.getByRole('button', { name: 'Bir kart' });
    const bottomMeta = article.querySelector('[data-slot="card-bottom-meta"]');
    expect(bottomMeta).not.toBeNull();

    const members = bottomMeta!.querySelector('[data-slot="card-meta-members"]');
    const actions = bottomMeta!.querySelector('[data-slot="card-meta-actions"]');
    expect(members).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(actions).toHaveClass('ml-auto');
    expect(within(actions as HTMLElement).getByText('2')).toBeInTheDocument();
    expect(within(actions as HTMLElement).getByText('5')).toBeInTheDocument();
    expect(actions).not.toHaveTextContent('AL');
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

  it('shows checklist progress as a separate card section with a progress bar', () => {
    render(
      <CardItem
        boardId="b1"
        card={card({ checklistTotal: 3, checklistDone: 2 })}
        canEdit={false}
      />,
    );

    const article = screen.getByRole('button', { name: 'Bir kart' });
    const checklist = article.querySelector('[data-slot="card-checklist-progress"]');
    expect(checklist).not.toBeNull();
    expect(checklist).toHaveTextContent('Yapılacaklar');
    expect(within(checklist as HTMLElement).getByText('2/3')).toBeInTheDocument();
    const progress = within(checklist as HTMLElement).getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow', '2');
    expect(progress).toHaveAttribute('aria-valuemax', '3');
  });

  it('shows the comment count', () => {
    render(<CardItem boardId="b1" card={card({ commentCount: 5 })} canEdit={false} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows up to three assignee avatars plus a "+N" badge, excluding watchers', () => {
    const members = [
      { userId: 'u1', name: 'Ada Lovelace', image: null, role: 'assignee' as const },
      { userId: 'u2', name: 'Alan Turing', image: null, role: 'assignee' as const },
      { userId: 'u3', name: 'Grace Hopper', image: null, role: 'assignee' as const },
      { userId: 'u4', name: 'Edsger Dijkstra', image: null, role: 'assignee' as const },
      { userId: 'u5', name: 'Margaret Hamilton', image: null, role: 'watcher' as const },
    ];
    render(<CardItem boardId="b1" card={card({ members })} canEdit={false} />);
    // Four assignees → three avatars rendered (initials) plus a "+1" overflow badge.
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument(); // Ada Lovelace
    // The watcher is a card relationship, not a card-face avatar.
    expect(screen.queryByText('MH')).not.toBeInTheDocument(); // Margaret Hamilton
  });

  it('renders the cover-colour stripe at the same height as the list accent', () => {
    render(<CardItem boardId="b1" card={card({ coverColor: 'mavi' })} canEdit={false} />);
    const article = screen.getByRole('button', { name: 'Bir kart' });
    const stripe = article.querySelector('.bg-palet-mavi');
    expect(stripe).not.toBeNull();
    expect(stripe).toHaveClass('h-1');
  });

  it('renders the cover image before the colour stripe when a cover image is set', () => {
    render(
      <CardItem
        boardId="b1"
        card={card({
          coverColor: 'mavi',
          coverImageAttachmentId: 'att1',
          coverImage: {
            attachmentId: 'att1',
            fileName: 'cover.png',
            mimeType: 'image/png',
            size: 1234,
          },
          coverImageUrl: 'https://storage.test/card-cover.png',
        })}
        canEdit={false}
      />,
    );
    const article = screen.getByRole('button', { name: 'Bir kart' });
    const image = article.querySelector('img');
    expect(image).toHaveAttribute('src', 'https://storage.test/card-cover.png');
    expect(article.querySelector('.bg-palet-mavi')).toBeNull();
  });

  it('marks cover images as non-draggable so card drags can start from the image', () => {
    render(
      <CardItem
        boardId="b1"
        card={card({
          coverImageAttachmentId: 'att1',
          coverImage: {
            attachmentId: 'att1',
            fileName: 'cover.png',
            mimeType: 'image/png',
            size: 1234,
          },
          coverImageUrl: 'https://storage.test/card-cover.png',
        })}
        canEdit
      />,
    );

    expect(screen.getByRole('img', { name: 'Bir kart — kapak görseli' })).toHaveAttribute(
      'draggable',
      'false',
    );
  });

  it('no cover stripe when the cover colour is unknown', () => {
    render(<CardItem boardId="b1" card={card({ coverColor: 'not-a-colour' })} canEdit={false} />);
    const article = screen.getByRole('button', { name: 'Bir kart' });
    expect(article.querySelector('[class*="bg-palet-"]')).toBeNull();
  });

  it('keeps the source card in placeholder mode after a settling drop until card props move', async () => {
    render(
      <BoardDndProvider value={makeDnd()}>
        <CardItem boardId="b1" card={baseCard} canEdit />
      </BoardDndProvider>,
    );

    const args = (h.registerCard as Mock).mock.calls[0]?.[0] as
      | Parameters<BoardDnd['registerCard']>[0]
      | undefined;
    expect(args).toBeDefined();

    act(() => args!.onDraggingChange(true));
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bir kart' })).toHaveAttribute('data-dragging');
    });

    act(() => args!.onDraggingChange(false, { settleUntilCacheUpdate: true }));

    const article = screen.getByRole('button', { name: 'Bir kart' });
    expect(article).toHaveAttribute('data-dragging');
    expect(article.firstElementChild).toHaveClass('invisible');
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
