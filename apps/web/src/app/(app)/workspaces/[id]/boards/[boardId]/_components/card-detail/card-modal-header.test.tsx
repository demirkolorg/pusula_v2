import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CardModalHeader } from './card-modal-header';

// Faz 10H (DEM-142) — CardDetailSnooze artık header içinde render ediliyor;
// preferences.get + snooze/unsnooze mutation'larını mock'lamamız gerek.
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

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    attachment: {
      getDownloadUrl: {
        queryOptions: (input: unknown, options?: Record<string, unknown>) => ({
          input,
          ...(options ?? {}),
        }),
      },
    },
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
  }),
}));

const copy = strings.card.detail;
const m = copy.modal;

function setup(overrides: Partial<Parameters<typeof CardModalHeader>[0]> = {}) {
  const props = {
    cardId: 'c_test',
    boardName: 'Yol Haritası',
    listName: 'Yapılacaklar',
    archived: false,
    canArchive: true,
    archivePending: false,
    onArchiveToggle: vi.fn(),
    onClose: vi.fn(),
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
        boardName="B"
        listName="L"
        archived={false}
        canArchive
        onArchiveToggle={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(m.archivedBadge)).not.toBeInTheDocument();
    rerender(
      <CardModalHeader
        cardId="c_test"
        boardName="B"
        listName="L"
        archived
        canArchive
        onArchiveToggle={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(m.archivedBadge)).toBeInTheDocument();
  });

  it('the close button calls onClose', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: copy.close }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('the ⋮ menu exposes archive (and disabled move/copy) for an editor', async () => {
    const user = userEvent.setup();
    setup({ archived: false });
    await user.click(screen.getByRole('button', { name: m.more }));
    expect(await screen.findByRole('menuitem', { name: m.menuArchive })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: m.menuMove })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('the ⋮ menu offers restore when the card is archived', async () => {
    const user = userEvent.setup();
    const props = setup({ archived: true });
    await user.click(screen.getByRole('button', { name: m.more }));
    const restore = await screen.findByRole('menuitem', { name: m.menuRestore });
    await user.click(restore);
    expect(props.onArchiveToggle).toHaveBeenCalledWith(false);
  });

  it('plain bar (border-b, no palette class) when no cover colour is set', () => {
    render(
      <CardModalHeader
        cardId="c_test"
        boardName="B"
        listName="L"
        coverColor={null}
        archived={false}
        canArchive
        onArchiveToggle={vi.fn()}
        onClose={vi.fn()}
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
        boardName="B"
        listName="L"
        coverColor="mavi"
        archived={false}
        canArchive
        onArchiveToggle={vi.fn()}
        onClose={vi.fn()}
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
        boardName="B"
        listName="L"
        coverColor="mavi"
        coverImage={{
          attachmentId: 'att1',
          fileName: 'kapak.png',
          mimeType: 'image/png',
          size: 1234,
        }}
        archived={false}
        canArchive
        onArchiveToggle={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const image = screen.getByRole('img', { name: 'kapak.png' });
    expect(image).toHaveAttribute('src', 'https://storage.test/modal-cover.png');
    expect(image.closest('[data-slot="card-modal-cover-image"]')).toHaveClass('h-40');
    const bar = document.querySelector('[data-slot="card-modal-header"]')!;
    expect(bar).toHaveClass('bg-background', 'border-b');
    expect(bar.className).not.toMatch(/bg-palet-/);
  });
});
