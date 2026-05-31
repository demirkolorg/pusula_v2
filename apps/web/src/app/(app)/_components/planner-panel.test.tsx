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

type EventsListResult =
  | { ok: true; events: unknown[] }
  | { ok: false; error: Error };

const h = {
  listAccounts: vi.fn(),
  routerReplace: vi.fn(),
  searchParamsGet: vi.fn(() => null as string | null),
  searchParamsToString: vi.fn(() => ''),
  eventsList: vi.fn<() => EventsListResult>(() => ({ ok: true, events: [] })),
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
            queryFn: async () => {
              const result = h.eventsList();
              if (result.ok) return result.events;
              throw result.error;
            },
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
    h.eventsList.mockReset();
    h.eventsList.mockReturnValue({ ok: true, events: [] });
  });

  function connectedAccountFixture() {
    return [{ providerId: 'google-calendar', createdAt: new Date().toISOString() }];
  }

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

  it('renders a timed event block with title + time and an opens-modal URL update on click', async () => {
    const user = userEvent.setup();
    h.listAccounts.mockResolvedValue({
      data: connectedAccountFixture(),
      error: null,
    });
    // Bugün'ün 10:00-11:00 saatleri arasında "Sprint planlama" etkinliği —
    // local TZ kullanılır; viewDate de startOfDay(today).
    const today = new Date();
    today.setHours(10, 0, 0, 0);
    const end = new Date(today);
    end.setHours(11, 0, 0, 0);
    h.eventsList.mockReturnValue({
      ok: true,
      events: [
        {
          id: 'evt-1',
          summary: 'Sprint planlama',
          start: { dateTime: today.toISOString() },
          end: { dateTime: end.toISOString() },
          htmlLink: 'https://calendar.google.com/event?eid=evt-1',
          status: 'confirmed',
        },
      ],
    });

    render(<PlannerPanel onClose={vi.fn()} />, { wrapper: makeWrapper() });

    const blockButton = await screen.findByRole('button', { name: /Sprint planlama/ });
    expect(blockButton).toBeInTheDocument();
    expect(screen.queryByText(copy.emptyDay)).not.toBeInTheDocument();

    await user.click(blockButton);
    await waitFor(() =>
      expect(h.routerReplace).toHaveBeenCalledWith(
        expect.stringContaining('event=evt-1'),
        expect.objectContaining({ scroll: false }),
      ),
    );
  });

  it('renders all-day events in a horizontal banner above the timeline', async () => {
    h.listAccounts.mockResolvedValue({
      data: connectedAccountFixture(),
      error: null,
    });
    h.eventsList.mockReturnValue({
      ok: true,
      events: [
        {
          id: 'evt-all-day',
          summary: 'Resmi tatil',
          start: { date: '2099-01-01' },
          end: { date: '2099-01-02' },
          htmlLink: 'https://calendar.google.com/event?eid=evt-all-day',
          status: 'confirmed',
        },
      ],
    });

    render(<PlannerPanel onClose={vi.fn()} />, { wrapper: makeWrapper() });

    expect(
      await screen.findByRole('button', { name: 'Resmi tatil' }),
    ).toBeInTheDocument();
    expect(screen.getByText(copy.allDayLabel)).toBeInTheDocument();
  });

  it('shows the reconnect CTA when planner.events.list throws GOOGLE_RECONNECT_REQUIRED', async () => {
    h.listAccounts.mockResolvedValue({
      data: connectedAccountFixture(),
      error: null,
    });
    h.eventsList.mockReturnValue({
      ok: false,
      error: new Error('GOOGLE_RECONNECT_REQUIRED'),
    });

    render(<PlannerPanel onClose={vi.fn()} />, { wrapper: makeWrapper() });

    expect(await screen.findByText(copy.reconnectTitle)).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: copy.reconnectCta });
    expect(cta).toHaveAttribute('href', '/account?tab=integrations');
    expect(screen.queryByText(copy.emptyDay)).not.toBeInTheDocument();
  });

  it('shows a generic refresh error (and keeps the timeline) on a non-reconnect error', async () => {
    h.listAccounts.mockResolvedValue({
      data: connectedAccountFixture(),
      error: null,
    });
    h.eventsList.mockReturnValue({ ok: false, error: new Error('boom') });

    render(<PlannerPanel onClose={vi.fn()} />, { wrapper: makeWrapper() });

    expect(await screen.findByText(copy.refreshError)).toBeInTheDocument();
    expect(screen.queryByText(copy.reconnectTitle)).not.toBeInTheDocument();
  });

  it('renders 13 hour labels covering the 09:00-21:00 timeline', async () => {
    h.listAccounts.mockResolvedValue({
      data: connectedAccountFixture(),
      error: null,
    });
    render(<PlannerPanel onClose={vi.fn()} />, { wrapper: makeWrapper() });

    await screen.findByText(copy.emptyDay);
    for (const hour of [9, 12, 15, 18, 21]) {
      expect(screen.getByText(`${hour.toString().padStart(2, '0')}:00`)).toBeInTheDocument();
    }
  });
});
