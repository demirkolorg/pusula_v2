import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks (referenced by the factories below).
const h = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  searchParams: new URLSearchParams(),
  useQuery: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: h.routerReplace, push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => h.searchParams,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.useQuery,
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    auth: {
      defaultLandingRoute: {
        queryOptions: () => ({ key: 'auth.defaultLandingRoute' }),
      },
    },
  }),
}));

import { RedirectIfAuthenticated } from './redirect-if-authenticated';

type QueryStub = {
  isPending?: boolean;
  isError?: boolean;
  isSuccess?: boolean;
  data?: unknown;
  error?: unknown;
};

const stub = (over: QueryStub): QueryStub => ({
  isPending: false,
  isError: false,
  isSuccess: false,
  data: undefined,
  ...over,
});

describe('<RedirectIfAuthenticated>', () => {
  beforeEach(() => {
    h.routerReplace.mockReset();
    h.searchParams = new URLSearchParams();
    h.useQuery.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('honours ?redirect= when present (safe path) — does not act on the default-route query result', async () => {
    h.searchParams = new URLSearchParams('redirect=/workspaces/w1/boards/b1');
    // Even if the query somehow resolved, the ?redirect= branch wins.
    h.useQuery.mockReturnValue(stub({ isPending: true }));

    render(<RedirectIfAuthenticated />);

    await waitFor(() => expect(h.routerReplace).toHaveBeenCalledTimes(1));
    expect(h.routerReplace).toHaveBeenCalledWith('/workspaces/w1/boards/b1');
  });

  it('rejects an open-redirect attempt and falls back to /', async () => {
    h.searchParams = new URLSearchParams('redirect=//evil.example');
    h.useQuery.mockReturnValue(stub({ isPending: true }));

    render(<RedirectIfAuthenticated />);

    await waitFor(() => expect(h.routerReplace).toHaveBeenCalledTimes(1));
    expect(h.routerReplace).toHaveBeenCalledWith('/');
  });

  it('no ?redirect= + resolved default route → goes to /workspaces/{w}/boards/{b}', async () => {
    h.useQuery.mockReturnValue(
      stub({ isSuccess: true, data: { workspaceId: 'w-2', boardId: 'b-3' } }),
    );

    render(<RedirectIfAuthenticated />);

    await waitFor(() => expect(h.routerReplace).toHaveBeenCalledTimes(1));
    expect(h.routerReplace).toHaveBeenCalledWith('/workspaces/w-2/boards/b-3');
  });

  it('no ?redirect= + resolver returns null → falls back to /', async () => {
    h.useQuery.mockReturnValue(stub({ isSuccess: true, data: null }));

    render(<RedirectIfAuthenticated />);

    await waitFor(() => expect(h.routerReplace).toHaveBeenCalledTimes(1));
    expect(h.routerReplace).toHaveBeenCalledWith('/');
  });

  it('no ?redirect= + resolver errors → falls back to /', async () => {
    h.useQuery.mockReturnValue(stub({ isError: true, error: new Error('boom') }));

    render(<RedirectIfAuthenticated />);

    await waitFor(() => expect(h.routerReplace).toHaveBeenCalledTimes(1));
    expect(h.routerReplace).toHaveBeenCalledWith('/');
  });

  it('no ?redirect= + resolver still pending → no navigation yet', () => {
    h.useQuery.mockReturnValue(stub({ isPending: true }));

    render(<RedirectIfAuthenticated />);

    expect(h.routerReplace).not.toHaveBeenCalled();
  });
});
