/**
 * Faz 14F web hook unit tests (DEM-296) — `useDownloadBoardReport`.
 */
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('@pusula/ui', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const anchorClick = vi.fn();
let appended: HTMLAnchorElement | null = null;

beforeEach(() => {
  fetchMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  anchorClick.mockReset();
  appended = null;

  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'a') {
      const anchor = {
        href: '',
        download: '',
        click: anchorClick,
        style: {},
      } as unknown as HTMLAnchorElement;
      return anchor;
    }
    return originalCreateElement(tag as keyof HTMLElementTagNameMap);
  }) as typeof document.createElement);
  vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
    appended = node as HTMLAnchorElement;
    return node;
  });
  vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { useDownloadBoardReport } from './use-download-board-report';

function mockResponse(opts: {
  ok: boolean;
  status: number;
  filename?: string;
  body?: string;
}) {
  return {
    ok: opts.ok,
    status: opts.status,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === 'content-disposition' && opts.filename
          ? `attachment; filename="${opts.filename}"`
          : null,
    },
    blob: async () => new Blob([opts.body ?? '%PDF-fake'], { type: 'application/pdf' }),
  } as unknown as Response;
}

describe('useDownloadBoardReport', () => {
  it('200 happy path: fetch GET endpoint, blob → anchor click, toast success, Content-Disposition filename', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: true, status: 200, filename: 'test-board-raporu-2026-05-25.pdf' }),
    );

    const { result } = renderHook(() =>
      useDownloadBoardReport({ boardId: 'b1', boardTitle: 'Test Board' }),
    );

    await act(async () => {
      await result.current.download();
    });

    // 2026-06-01 prod-fix — endpoint apps/api Hono raw route'a taşındı; fetch
    // artık `${NEXT_PUBLIC_API_URL}/api/boards/.../report` çağırır. `env.ts`
    // default'u `http://localhost:3001` (test runtime'da NEXT_PUBLIC_API_URL
    // override edilmiyor).
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/boards/b1/report',
      expect.objectContaining({ method: 'GET', credentials: 'include', cache: 'no-store' }),
    );
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(appended?.download).toBe('test-board-raporu-2026-05-25.pdf');
    expect(toastError).not.toHaveBeenCalled();
    expect(result.current.isDownloading).toBe(false);
  });

  it('403 → toast.error, anchor click yok', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 403 }));

    const { result } = renderHook(() =>
      useDownloadBoardReport({ boardId: 'b1', boardTitle: 'Test Board' }),
    );

    await act(async () => {
      await result.current.download();
    });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(anchorClick).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('fetch throws (network) → toast.error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network down'));

    const { result } = renderHook(() =>
      useDownloadBoardReport({ boardId: 'b1', boardTitle: 'Test Board' }),
    );

    await act(async () => {
      await result.current.download();
    });

    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('Content-Disposition yok → fallback `{title}-raporu.pdf`', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, status: 200 }));

    const { result } = renderHook(() =>
      useDownloadBoardReport({ boardId: 'b1', boardTitle: 'My Board' }),
    );

    await act(async () => {
      await result.current.download();
    });

    expect(appended?.download).toBe('My Board-raporu.pdf');
  });
});
