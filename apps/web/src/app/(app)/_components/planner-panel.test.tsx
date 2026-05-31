import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

/**
 * Faz 16B/C — PlannerPanel RTL testleri. 16B kapsamında panel iskelesi,
 * 16C kapsamında tRPC `planner.events.list` bağlantısı doğrulanır. Better
 * Auth + tRPC + Next router tamamen mock'lu.
 */

const h = {
  listAccounts: vi.fn(),
  routerReplace: vi.fn(),
  searchParamsGet: vi.fn(() => null as string | null),
  searchParamsToString: vi.fn(() => ''),
};

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    listAccounts: () => h.listAccounts(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: h.routerReplace }),
  useSearchParams: () => ({
    get: (k: string) => h.searchParamsGet(k),
    toString: () => h.searchParamsToString(),
  }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    planner: {
      events: {
        list: {
          queryOptions: (input: unknown) => ({
            queryKey: ['planner.events.list', input],
            queryFn: async () => [],
          }),
        },
        get: {
          queryOptions: (input: unknown) => ({
            queryKey: ['planner.events.get', input],
            queryFn: async () => null,
          }),
        },
      },
    },
  }),
}));

import { PlannerPanel } from './planner-panel';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const copy = strings.board.planner;

describe('<PlannerPanel>', () => {
  beforeEach(() => {
    h.listAccounts.mockReset();
    h.routerReplace.mockReset();
    h.searchParamsGet.mockReset();
    h.searchParamsGet.mockReturnValue(null);
    h.searchParamsToString.mockReset();
    h.searchParamsToString.mockReturnValue('');
  });

  it('renders the not-connected CTA when no google-calendar account exists', async () => {
    h.listAccounts.mockResolvedValue({ data: [], error: null });
    render(<PlannerPanel onClose={vi.fn()} />, { wrapper: makeWrapper() });

    const cta = await screen.findByRole('link', {
      name: new RegExp(copy.notConnected.cta),
    });
    expect(cta).toHaveAttribute('href', '/account?tab=integrations');
    expect(screen.queryByText(copy.emptyDay)).not.toBeInTheDocument();
  });

  it('renders the timeline + empty-day message when connected with zero events', async () => {
    h.listAccounts.mockResolvedValue({
      data: [{ providerId: 'google-calendar', createdAt: new Date().toISOString() }],
      error: null,
    });
    render(<PlannerPanel onClose={vi.fn()} />, { wrapper: makeWrapper() });

    expect(await screen.findByText(copy.emptyDay)).toBeInTheDocument();
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('21:00')).toBeInTheDocument();
  });

  it('disables the "Bugün" button when the current view is already today', async () => {
    h.listAccounts.mockResolvedValue({ data: [], error: null });
    render(<PlannerPanel onClose={vi.fn()} />, { wrapper: makeWrapper() });

    await screen.findByText(copy.notConnected.title);
    expect(screen.getByRole('button', { name: copy.today })).toBeDisabled();
  });

  it('navigates to the previous day and re-enables the "Bugün" button', async () => {
    const user = userEvent.setup();
    h.listAccounts.mockResolvedValue({ data: [], error: null });
    render(<PlannerPanel onClose={vi.fn()} />, { wrapper: makeWrapper() });

    await user.click(screen.getByRole('button', { name: copy.prevDay }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: copy.today })).toBeEnabled(),
    );
  });

  it('calls onClose when the X button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    h.listAccounts.mockResolvedValue({ data: [], error: null });
    render(<PlannerPanel onClose={onClose} />, { wrapper: makeWrapper() });

    await user.click(screen.getByRole('button', { name: copy.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes listAccounts again when the refresh button is clicked', async () => {
    const user = userEvent.setup();
    h.listAccounts.mockResolvedValue({ data: [], error: null });
    render(<PlannerPanel onClose={vi.fn()} />, { wrapper: makeWrapper() });

    await screen.findByText(copy.notConnected.title);
    expect(h.listAccounts).toHaveBeenCalledTimes(1);

    const refreshButton = await screen.findByRole('button', { name: copy.refresh });
    await user.click(refreshButton);
    await waitFor(() => expect(h.listAccounts).toHaveBeenCalledTimes(2));
  });
});
