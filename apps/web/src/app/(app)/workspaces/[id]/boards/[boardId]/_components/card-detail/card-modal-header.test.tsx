import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CardModalHeader } from './card-modal-header';

// Faz 10H (DEM-142) — CardDetailSnooze artık header içinde render ediliyor;
// preferences.get + snooze/unsnooze mutation'larını mock'lamamız gerek.
// Ek olarak ShareDialog (DEM-130) header'a taşındığından `share.list` query'si
// mount aşamasında çağrılır; deepProxy ile karşılanır.
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { url: 'https://storage.test/modal-cover.png' },
    isPending: false,
    isError: false,
  }),
  useMutation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    variables: undefined,
    reset: vi.fn(),
  }),
  useQueryClient: () => ({
    cancelQueries: vi.fn(),
    invalidateQueries: vi.fn(),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  }),
}));

// Recursive proxy — any property access / call returns itself. Mirrors the
// pattern used in card-detail-dialog.test.tsx so deep tRPC paths resolve.
const deepProxy: unknown = new Proxy(function () {} as object, {
  get: (_t, prop) => (prop === 'then' ? undefined : deepProxy),
  apply: () => deepProxy,
});

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    // DEM-227 — kart kapağı artık `attachment.getDownloadUrl` query'si yapmaz;
    // presigned URL `card.get` yanıtındaki `coverImageUrl` ile prop olarak gelir.
    notifications: {
      preferences: {
        get: {
          queryOptions: (input: unknown) => ({ key: 'preferences.get', input }),
          queryFilter: (input: unknown) => ({ queryKey: ['preferences.get', input] }),
        },
        list: {
          queryFilter: () => ({ queryKey: ['preferences.list'] }),
        },
        snooze: { mutationOptions: (o: unknown) => o },
        unsnooze: { mutationOptions: (o: unknown) => o },
      },
    },
    // ShareDialog header'a taşındı (DEM-130) — list/create/revoke için stub.
    share: { list: deepProxy, create: deepProxy, revoke: deepProxy },
  }),
}));

const copy = strings.card.detail;
const m = copy.modal;

function setup(overrides: Partial<Parameters<typeof CardModalHeader>[0]> = {}) {
  const props = {
    cardId: 'c_test',
    boardId: 'b_test',
    canShare: true,
    boardName: 'Yol Haritası',
    listName: 'Yapılacaklar',
    archived: false,
    sidebarOpen: false,
    onToggleSidebar: vi.fn(),
    fullscreen: false,
    onToggleFullscreen: vi.fn(),
    ...overrides,
  };
  render(<CardModalHeader {...props} />);
  return props;
}

describe('<CardModalHeader>', () => {
  it('shows the board / list breadcrumb', () => {
    setup();
    expect(screen.getByText(/Yol Haritası/)).toBeInTheDocument();
    expect(screen.getByText(/Yapılacaklar/)).toBeInTheDocument();
  });

  it('shows the archived badge only when archived', () => {
    const { rerender } = render(
      <CardModalHeader
        cardId="c_test"
        boardId="b_test"
        canShare
        boardName="B"
        listName="L"
        archived={false}
        sidebarOpen={false}
        onToggleSidebar={vi.fn()}
        fullscreen={false}
        onToggleFullscreen={vi.fn()}
      />,
    );
    expect(screen.queryByText(m.archivedBadge)).not.toBeInTheDocument();
    rerender(
      <CardModalHeader
        cardId="c_test"
        boardId="b_test"
        canShare
        boardName="B"
        listName="L"
        archived
        sidebarOpen={false}
        onToggleSidebar={vi.fn()}
        fullscreen={false}
        onToggleFullscreen={vi.fn()}
      />,
    );
    expect(screen.getByText(m.archivedBadge)).toBeInTheDocument();
  });

  it('shows the sidebar toggle with a text label', () => {
    setup();
    expect(screen.getByRole('button', { name: m.sidebarOpen })).toBeInTheDocument();
  });

  it('clicking the sidebar toggle fires onToggleSidebar', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: m.sidebarOpen })!);
    expect(props.onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('label flips to "close" when sidebar is open', () => {
    setup({ sidebarOpen: true });
    expect(screen.getByRole('button', { name: m.sidebarClose })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: m.sidebarOpen })).not.toBeInTheDocument();
  });

  it('shows the fullscreen toggle with a text label', () => {
    setup();
    expect(screen.getByRole('button', { name: m.fullscreenEnter })).toBeInTheDocument();
  });

  it('clicking the fullscreen toggle fires onToggleFullscreen', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: m.fullscreenEnter })!);
    expect(props.onToggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it('label flips to "exit" when fullscreen is active', () => {
    setup({ fullscreen: true });
    expect(screen.getByRole('button', { name: m.fullscreenExit })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: m.fullscreenEnter })).not.toBeInTheDocument();
  });

  it('plain bar (border-b, no palette class) when no cover colour is set', () => {
    render(
      <CardModalHeader
        cardId="c_test"
        boardId="b_test"
        canShare
        boardName="B"
        listName="L"
        coverColor={null}
        archived={false}
        sidebarOpen={false}
        onToggleSidebar={vi.fn()}
        fullscreen={false}
        onToggleFullscreen={vi.fn()}
      />,
    );
    const bar = document.querySelector('[data-slot="card-modal-header"]')!;
    expect(bar).toHaveClass('border-b');
    expect(bar.className).not.toMatch(/bg-palet-/);
  });

  it('coloured bar (bg-palet-*, no border-b) when a cover colour is set', () => {
    render(
      <CardModalHeader
        cardId="c_test"
        boardId="b_test"
        canShare
        boardName="B"
        listName="L"
        coverColor="mavi"
        archived={false}
        sidebarOpen={false}
        onToggleSidebar={vi.fn()}
        fullscreen={false}
        onToggleFullscreen={vi.fn()}
      />,
    );
    const bar = document.querySelector('[data-slot="card-modal-header"]')!;
    expect(bar).toHaveClass('bg-palet-mavi');
    expect(bar).not.toHaveClass('border-b');
  });

  it('renders the cover image above the modal chrome and suppresses the colour bar', () => {
    render(
      <CardModalHeader
        cardId="c_test"
        boardId="b_test"
        canShare
        boardName="B"
        listName="L"
        coverColor="mavi"
        coverImage={{
          attachmentId: 'att1',
          fileName: 'kapak.png',
          mimeType: 'image/png',
          size: 1234,
        }}
        coverImageUrl="https://storage.test/modal-cover.png"
        archived={false}
        sidebarOpen={false}
        onToggleSidebar={vi.fn()}
        fullscreen={false}
        onToggleFullscreen={vi.fn()}
      />,
    );

    const image = screen.getByRole('img', { name: 'kapak.png' });
    expect(image).toHaveAttribute('src', 'https://storage.test/modal-cover.png');
    expect(image.closest('[data-slot="card-modal-cover-image"]')).toHaveClass('h-56');
    const bar = document.querySelector('[data-slot="card-modal-header"]')!;
    expect(bar).toHaveClass('bg-background', 'border-b');
    expect(bar.className).not.toMatch(/bg-palet-/);
  });
});
