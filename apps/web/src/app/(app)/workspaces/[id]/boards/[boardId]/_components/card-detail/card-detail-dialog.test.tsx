import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CARD_COVER_IMAGE_MAX_BYTES } from '@pusula/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

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
    coverImageAttachmentId: null as string | null,
    coverImage: null as {
      attachmentId: string;
      fileName: string;
      mimeType: string;
      size: number;
    } | null,
    archivedAt: null as Date | null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  // Effective board role for the viewer (`board.members.list`).
  boardRole: 'member' as 'member' | 'viewer',
  mutationMutateAsync: vi.fn(),
  updateMutate: vi.fn(),
  completeMutate: vi.fn(),
  uncompleteMutate: vi.fn(),
  archiveMutate: vi.fn(),
}));

// A resolved query result with `data`.
const ok = (data: unknown) => ({ data, isPending: false, isError: false, error: null });

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { url: 'https://storage.test/modal-cover.png' } }),
  useQueries: ({ queries }: { queries: unknown[] }) => {
    // Order matches the dialog: card.get, card.members, card.labels, checklist.list,
    // comment.list, card.activity.list, board.members.list, label.list, board.get,
    // attachment.list.
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
      ok([]), // attachment list (Faz 11D)
    ];
    return results.slice(0, queries.length);
  },
  useMutation: (options?: { procedure?: string }) => {
    const mutate =
      options?.procedure === 'card.complete'
        ? h.completeMutate
        : options?.procedure === 'card.uncomplete'
          ? h.uncompleteMutate
          : options?.procedure === 'card.archive'
            ? h.archiveMutate
            : options?.procedure === 'card.update'
              ? h.updateMutate
              : vi.fn();

    return {
      mutate,
      mutateAsync: h.mutationMutateAsync,
      reset: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    };
  },
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

const namedMutationOptions = (procedure: string) => (options?: unknown) => ({
  procedure,
  options,
});

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    card: {
      get: deepProxy,
      update: { mutationOptions: namedMutationOptions('card.update') },
      complete: { mutationOptions: namedMutationOptions('card.complete') },
      uncomplete: { mutationOptions: namedMutationOptions('card.uncomplete') },
      archive: { mutationOptions: namedMutationOptions('card.archive') },
      members: { list: deepProxy, add: deepProxy, remove: deepProxy },
      labels: { list: deepProxy, add: deepProxy, remove: deepProxy },
      activity: { list: deepProxy },
    },
    board: { members: { list: deepProxy }, get: deepProxy },
    label: { list: deepProxy, create: deepProxy },
    checklist: {
      list: deepProxy,
      create: deepProxy,
      update: deepProxy,
      delete: deepProxy,
      item: {
        create: deepProxy,
        toggle: deepProxy,
        update: deepProxy,
        delete: deepProxy,
      },
    },
    comment: { list: deepProxy, create: deepProxy, update: deepProxy, delete: deepProxy },
    // Faz 11B (DEM-148) — cover upload now uses two-phase commit; the broader
    // attachment router shape is mocked so hook mount doesn't blow up.
    attachment: {
      initiate: deepProxy,
      commit: deepProxy,
      list: deepProxy,
      update: deepProxy,
      delete: deepProxy,
      getDownloadUrl: deepProxy,
    },
    // Faz 9D (DEM-130) — share endpoint mock (ShareDialog `useQuery(share.list)`
    // + `useMutation(share.create/revoke)` çağrıları için; dialog kapalı iken
    // query `enabled: false`, fakat hooks yine mount edilir).
    share: { list: deepProxy, create: deepProxy, revoke: deepProxy },
    // Faz 10H (DEM-142) — CardModalHeader artık CardDetailSnooze'u render
    // ediyor; preferences.get/snooze/unsnooze + preferences.list endpoint'leri
    // hook mount aşamasında erişilir.
    notifications: {
      preferences: {
        get: deepProxy,
        list: deepProxy,
        snooze: { mutationOptions: namedMutationOptions('preferences.snooze') },
        unsnooze: { mutationOptions: namedMutationOptions('preferences.unsnooze') },
      },
    },
  }),
}));

import { CardDetailDialog } from './card-detail-dialog';

function renderDialog() {
  return render(
    <CardDetailDialog boardId="b1" cardId="card1" viewerUserId="u1" onClose={vi.fn()} />,
  );
}

describe('<CardDetailDialog>', () => {
  beforeEach(() => {
    h.mutationMutateAsync.mockReset();
    h.updateMutate.mockReset();
    h.completeMutate.mockReset();
    h.uncompleteMutate.mockReset();
    h.archiveMutate.mockReset();
    h.boardRole = 'member';
    h.card.completed = false;
    h.card.archivedAt = null;
    h.card.coverImageAttachmentId = null;
    h.card.coverImage = null;
  });

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
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: strings.card.detail.modal.coverColor }));
    // The picker swatch grid (12 buttons labelled "Kapak rengi: <name>").
    expect(screen.getAllByRole('button', { name: /Kapak rengi:/ }).length).toBe(12);
  });

  it('renders the card cover image in the modal header when present', () => {
    h.card.coverImageAttachmentId = 'att1';
    h.card.coverImage = {
      attachmentId: 'att1',
      fileName: 'kapak.png',
      mimeType: 'image/png',
      size: 1234,
    };

    renderDialog();

    expect(screen.getByRole('img', { name: 'kapak.png' })).toHaveAttribute(
      'src',
      'https://storage.test/modal-cover.png',
    );
  });

  it('rejects oversized cover images before requesting an upload URL', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: strings.card.detail.modal.coverColor }));
    // The cover picker is now a two-tab control — the upload input lives in the
    // "Kapak görseli" tab (Faz 11D — DEM-150).
    await user.click(screen.getByRole('tab', { name: strings.attachment.cover.tabImage }));

    const file = new File([new Uint8Array(CARD_COVER_IMAGE_MAX_BYTES + 1)], 'too-big.png', {
      type: 'image/png',
    });
    await user.upload(screen.getByLabelText(strings.card.detail.modal.coverImageUpload), file);

    expect(h.mutationMutateAsync).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kapak fotoğrafı en fazla 50 MB olabilir.',
    );
  });

  it('focuses title edit and opens meta menus from modal shortcuts', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.keyboard('e');
    expect(screen.getByRole('textbox', { name: strings.card.detail.titleLabel })).toHaveFocus();

    await user.keyboard('{Escape}');
    await user.keyboard('d');
    expect(screen.getByRole('heading', { name: strings.card.detail.dueTitle })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await user.keyboard('m');
    expect(screen.getByRole('heading', { name: strings.card.members.title })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await user.keyboard('t');
    expect(screen.getByRole('heading', { name: strings.card.labels.title })).toBeInTheDocument();
  });

  it('runs complete and archive shortcuts when allowed', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.keyboard('c');
    expect(h.completeMutate).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'card1' }),
      undefined,
    );

    await user.keyboard('a');
    expect(h.archiveMutate).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'card1', archived: true }),
      undefined,
    );
  });

  it('opens shortcut help from the card modal', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.keyboard('?');

    expect(screen.getByRole('dialog', { name: strings.shortcuts.dialogTitle })).toBeInTheDocument();
    expect(screen.getByText(strings.shortcuts.groups.cardModal)).toBeInTheDocument();
  });
});
