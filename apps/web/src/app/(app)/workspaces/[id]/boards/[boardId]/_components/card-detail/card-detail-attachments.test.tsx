import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as PusulaUi from '@pusula/ui';
import { strings } from '@/lib/strings';

/**
 * Drive the dropzone's hidden `<input type="file">` directly. `userEvent.upload`
 * silently drops files whose type is outside the input's `accept` attribute, so
 * a raw `change` event is the only way to exercise the reject branches.
 */
function pickFile(dropzone: HTMLElement, file: File) {
  const input = dropzone.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

// --- Hoisted mock state ----------------------------------------------------
const h = vi.hoisted(() => ({
  attachments: [] as Array<Record<string, unknown>>,
  initiate: vi.fn(),
  commit: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  cardUpdate: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@pusula/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof PusulaUi>();
  return { ...actual, toast: { error: h.toastError, success: vi.fn() } };
});

// A trpc stub: each procedure exposes the query/mutation helpers the component
// calls. `queryFn` / `mutationFn` route to the hoisted mocks.
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
        initiate: { mutationOptions: () => ({ mutationFn: h.initiate }) },
        commit: { mutationOptions: () => ({ mutationFn: h.commit }) },
        update: {
          mutationOptions: (opts?: object) => ({ mutationFn: h.update, ...(opts ?? {}) }),
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
    ...overrides,
  };
}

function renderTab(props: Partial<Parameters<typeof CardDetailAttachments>[0]> = {}) {
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
  h.initiate.mockReset();
  h.commit.mockReset();
  h.update.mockReset();
  h.remove.mockReset();
  h.cardUpdate.mockReset();
  h.toastError.mockReset();
});

describe('<CardDetailAttachments>', () => {
  it('shows the empty state when there are no attachments', async () => {
    renderTab();
    expect(await screen.findByText(copy.empty.title)).toBeInTheDocument();
  });

  it('renders an attachment tile from the list query', async () => {
    h.attachments = [makeAttachment()];
    renderTab();
    expect(await screen.findByText('rapor.pdf')).toBeInTheDocument();
  });

  it('keyboard-activating the dropzone runs the two-phase upload (initiate → commit)', async () => {
    const user = userEvent.setup();
    h.initiate.mockResolvedValue({
      attachmentId: 'att-new',
      upload: { url: 'https://storage.test/put', headers: {} },
      expiresAt: new Date(),
    });
    h.commit.mockResolvedValue(
      makeAttachment({ id: 'att-new', fileName: 'yeni.png', kind: 'image', mimeType: 'image/png' }),
    );

    // Stub XHR so the presigned PUT resolves instantly. Must be a real
    // constructable (class) — `new` on an arrow function throws.
    class XhrStub {
      open = vi.fn();
      setRequestHeader = vi.fn();
      upload = { addEventListener: vi.fn() };
      send = vi.fn(() => {
        this.loadCb?.();
      });
      status = 200;
      private loadCb: (() => void) | undefined;
      addEventListener(event: string, cb: () => void) {
        if (event === 'load') this.loadCb = cb;
      }
    }
    vi.stubGlobal('XMLHttpRequest', XhrStub);

    renderTab();
    const dropzone = await screen.findByRole('button', { name: copy.dropzone.ariaLabel });
    const file = new File(['x'], 'yeni.png', { type: 'image/png' });
    pickFile(dropzone, file);

    // Optional description, then upload.
    await user.click(await screen.findByRole('button', { name: copy.upload.action }));

    await waitFor(() => expect(h.initiate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.commit).toHaveBeenCalledTimes(1));
    expect(h.initiate.mock.calls[0]?.[0]).toMatchObject({ cardId: 'card-1', fileName: 'yeni.png' });

    vi.unstubAllGlobals();
  });

  it('rejects an oversized file with a toast and does not start the upload', async () => {
    renderTab();
    const dropzone = await screen.findByRole('button', { name: copy.dropzone.ariaLabel });
    const huge = new File(['x'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(huge, 'size', { value: 60 * 1024 * 1024 });

    pickFile(dropzone, huge);

    expect(h.toastError).toHaveBeenCalledWith(copy.dropzone.error.tooLarge);
    expect(screen.queryByRole('button', { name: copy.upload.action })).not.toBeInTheDocument();
  });

  it('rejects an unsupported MIME type with a toast', async () => {
    renderTab();
    const dropzone = await screen.findByRole('button', { name: copy.dropzone.ariaLabel });
    const bad = new File(['x'], 'evil.exe', { type: 'application/x-msdownload' });

    pickFile(dropzone, bad);

    expect(h.toastError).toHaveBeenCalledWith(copy.dropzone.error.mimeRejected);
  });

  it('inline-edits a description and fires attachment.update', async () => {
    const user = userEvent.setup();
    h.attachments = [makeAttachment()];
    h.update.mockResolvedValue(makeAttachment({ description: 'Güncel açıklama' }));
    renderTab();

    await screen.findByText('rapor.pdf');
    await user.click(screen.getByRole('button', { name: copy.actions.moreActions }));
    await user.click(screen.getByRole('menuitem', { name: copy.actions.edit }));

    const textarea = await screen.findByLabelText(copy.actions.edit);
    await user.type(textarea, 'Güncel açıklama');
    await user.click(screen.getByRole('button', { name: copy.actions.save }));

    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.update.mock.calls[0]?.[0]).toMatchObject({
      attachmentId: 'att-1',
      description: 'Güncel açıklama',
    });
  });

  it('delete confirmation fires attachment.delete', async () => {
    const user = userEvent.setup();
    h.attachments = [makeAttachment()];
    h.remove.mockResolvedValue({ id: 'att-1', ok: true });
    renderTab();

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
    renderTab();

    await screen.findByText('kapak.png');
    await user.click(screen.getByRole('button', { name: copy.actions.moreActions }));
    await user.click(screen.getByRole('menuitem', { name: copy.actions.makeCover }));

    await waitFor(() => expect(h.cardUpdate).toHaveBeenCalledTimes(1));
    expect(h.cardUpdate.mock.calls[0]?.[0]).toMatchObject({
      cardId: 'card-1',
      coverImageAttachmentId: 'img-1',
    });
  });

  it('viewer (cannot edit) sees a disabled dropzone', async () => {
    renderTab({ canEdit: false });
    const dropzone = await screen.findByRole('button', { name: copy.dropzone.ariaLabel });
    expect(dropzone).toHaveAttribute('aria-disabled', 'true');
  });
});
