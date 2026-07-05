import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as PusulaUi from '@pusula/ui';
import { strings } from '@/lib/strings';

// --- Hoisted mock state ----------------------------------------------------
const h = vi.hoisted(() => ({
  attachments: [] as Array<Record<string, unknown>>,
  remove: vi.fn(),
  cardUpdate: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@pusula/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof PusulaUi>();
  return { ...actual, toast: { error: h.toastError, success: vi.fn() } };
});

// A trpc stub: the gallery only reads `attachment.list`, and wires delete /
// cover / download. Uploading + description editing moved out (card header
// "+ Ekle" popover), so `initiate` / `commit` / `update` are gone.
vi.mock('@/trpc/client', () => {
  const listKey = (cardId: string) => ['attachment.list', { cardId }];
  return {
    useTRPC: () => ({
      attachment: {
        list: {
          queryFilter: ({ cardId }: { cardId: string }) => ({ queryKey: listKey(cardId) }),
          queryOptions: ({ cardId }: { cardId: string }) => ({
            queryKey: listKey(cardId),
            queryFn: async () => h.attachments,
          }),
        },
        delete: {
          mutationOptions: (opts?: object) => ({ mutationFn: h.remove, ...(opts ?? {}) }),
        },
        getDownloadUrl: {
          queryFilter: ({ attachmentId }: { attachmentId: string }) => ({
            queryKey: ['attachment.getDownloadUrl', { attachmentId }],
          }),
          queryOptions: ({ attachmentId }: { attachmentId: string }) => ({
            queryKey: ['attachment.getDownloadUrl', { attachmentId }],
            queryFn: async () => ({ url: `https://storage.test/${attachmentId}` }),
          }),
        },
      },
      card: {
        get: { queryFilter: ({ cardId }: { cardId: string }) => ({ queryKey: ['card.get', { cardId }] }) },
        update: {
          mutationOptions: (opts?: object) => ({ mutationFn: h.cardUpdate, ...(opts ?? {}) }),
        },
      },
      board: { get: { queryFilter: () => ({ queryKey: ['board.get'] }) } },
    }),
  };
});

import { CardDetailAttachments } from './card-detail-attachments';

const copy = strings.attachment;

function makeAttachment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'att-1',
    fileName: 'rapor.pdf',
    mimeType: 'application/pdf',
    size: 2048,
    kind: 'pdf',
    description: null,
    uploader: { id: 'u1', name: 'Ada', image: null },
    createdAt: new Date('2026-05-01'),
    committedAt: new Date('2026-05-01'),
    isCover: false,
    thumbnailUrl: null,
    ...overrides,
  };
}

function renderGallery(props: Partial<Parameters<typeof CardDetailAttachments>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CardDetailAttachments
        cardId="card-1"
        canEdit
        isBoardAdmin={false}
        viewerUserId="u1"
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // jsdom may not expose `crypto.randomUUID`; the component mints client
  // mutation ids with it. Polyfill a deterministic stub.
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { ...globalThis.crypto, randomUUID: () => '00000000-0000-4000-8000-000000000000' },
    });
  }
  h.attachments = [];
  h.remove.mockReset();
  h.cardUpdate.mockReset();
  h.toastError.mockReset();
});

describe('<CardDetailAttachments> (galeri)', () => {
  it('shows the empty state when there are no attachments', async () => {
    renderGallery();
    expect(await screen.findByText(copy.empty.title)).toBeInTheDocument();
  });

  it('renders a gallery card from the list query', async () => {
    h.attachments = [makeAttachment()];
    renderGallery();
    expect(await screen.findByText('rapor.pdf')).toBeInTheDocument();
  });

  it('renders a thumbnail <img> for an image attachment with a thumbnailUrl', async () => {
    h.attachments = [
      makeAttachment({
        id: 'img-1',
        fileName: 'foto.png',
        kind: 'image',
        mimeType: 'image/png',
        thumbnailUrl: 'https://storage.test/get/foto.png',
      }),
    ];
    renderGallery();

    const img = (await screen.findByAltText('foto.png')) as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe('https://storage.test/get/foto.png');
  });

  it('falls back to an icon (no <img>) for a non-image attachment', async () => {
    h.attachments = [makeAttachment()]; // pdf, thumbnailUrl: null
    renderGallery();

    await screen.findByText('rapor.pdf');
    expect(screen.queryByAltText('rapor.pdf')).not.toBeInTheDocument();
  });

  it('does not embed an upload dropzone (uploading lives in the "+ Ekle" popover)', async () => {
    h.attachments = [makeAttachment()];
    renderGallery();
    await screen.findByText('rapor.pdf');
    expect(
      screen.queryByRole('button', { name: copy.dropzone.ariaLabel }),
    ).not.toBeInTheDocument();
  });

  it('delete confirmation fires attachment.delete', async () => {
    const user = userEvent.setup();
    h.attachments = [makeAttachment()];
    h.remove.mockResolvedValue({ id: 'att-1', ok: true });
    renderGallery();

    await screen.findByText('rapor.pdf');
    await user.click(screen.getByRole('button', { name: copy.actions.moreActions }));
    await user.click(screen.getByRole('menuitem', { name: copy.actions.delete }));

    // Confirmation dialog.
    expect(await screen.findByText(copy.confirmDelete.title)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.confirmDelete.confirm }));

    await waitFor(() => expect(h.remove).toHaveBeenCalledTimes(1));
    expect(h.remove.mock.calls[0]?.[0]).toMatchObject({ attachmentId: 'att-1' });
  });

  it('toggling cover on an image attachment calls card.update', async () => {
    const user = userEvent.setup();
    h.attachments = [
      makeAttachment({ id: 'img-1', fileName: 'kapak.png', kind: 'image', mimeType: 'image/png' }),
    ];
    h.cardUpdate.mockResolvedValue({});
    renderGallery();

    await screen.findByText('kapak.png');
    await user.click(screen.getByRole('button', { name: copy.actions.moreActions }));
    await user.click(screen.getByRole('menuitem', { name: copy.actions.makeCover }));

    await waitFor(() => expect(h.cardUpdate).toHaveBeenCalledTimes(1));
    expect(h.cardUpdate.mock.calls[0]?.[0]).toMatchObject({
      cardId: 'card-1',
      coverImageAttachmentId: 'img-1',
    });
  });

  it('a viewer (cannot edit, not uploader) gets no manage menu', async () => {
    h.attachments = [makeAttachment()]; // uploader u1
    renderGallery({ canEdit: false, viewerUserId: 'someone-else' });
    await screen.findByText('rapor.pdf');
    expect(
      screen.queryByRole('button', { name: copy.actions.moreActions }),
    ).not.toBeInTheDocument();
  });
});
