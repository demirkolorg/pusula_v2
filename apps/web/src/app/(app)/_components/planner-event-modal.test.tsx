import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlannerEvent } from '@pusula/domain';
import { strings } from '@/lib/strings';

/**
 * Faz 16C (DEM-312) — PlannerEventModal RTL testleri. tRPC mock'lu;
 * `planner.events.get` query'sinin döndürdüğü event şekli render edilir.
 */

const h = {
  getResult: vi.fn<() => Promise<PlannerEvent>>(),
};

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    planner: {
      events: {
        get: {
          queryOptions: (input: unknown) => ({
            queryKey: ['planner.events.get', input],
            queryFn: () => h.getResult(),
          }),
        },
      },
    },
  }),
}));

import { PlannerEventModal } from './planner-event-modal';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const copy = strings.board.planner.event;

const SAMPLE_EVENT: PlannerEvent = {
  id: 'evt-1',
  summary: 'Sprint planlama',
  description: 'Faz 16C kapanışı + 16D planı.',
  location: 'Online — Google Meet',
  start: { dateTime: '2026-06-01T10:30:00+03:00', timeZone: 'Europe/Istanbul' },
  end: { dateTime: '2026-06-01T11:30:00+03:00', timeZone: 'Europe/Istanbul' },
  status: 'confirmed',
  htmlLink: 'https://calendar.google.com/event?eid=evt-1',
  attendees: [
    { email: 'alice@example.com', displayName: 'Alice', responseStatus: 'accepted' },
    { email: 'bob@example.com', displayName: 'Bob', responseStatus: 'declined' },
  ],
};

describe('<PlannerEventModal>', () => {
  beforeEach(() => {
    h.getResult.mockReset();
  });

  it('renders the event title, description, location and Google link when loaded', async () => {
    h.getResult.mockResolvedValue(SAMPLE_EVENT);
    render(
      <PlannerEventModal eventId="evt-1" open onClose={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    expect(
      await screen.findByRole('heading', { name: 'Sprint planlama' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Online — Google Meet')).toBeInTheDocument();
    expect(screen.getByText('Faz 16C kapanışı + 16D planı.')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: new RegExp(copy.openInGoogle) });
    expect(link).toHaveAttribute('href', SAMPLE_EVENT.htmlLink);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  it('renders attendees with RSVP badges', async () => {
    h.getResult.mockResolvedValue(SAMPLE_EVENT);
    render(
      <PlannerEventModal eventId="evt-1" open onClose={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText(copy.rsvp.accepted)).toBeInTheDocument();
    expect(screen.getByText(copy.rsvp.declined)).toBeInTheDocument();
  });

  it('shows a load error alert when the query fails', async () => {
    h.getResult.mockRejectedValue(new Error('boom'));
    render(
      <PlannerEventModal eventId="evt-1" open onClose={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    expect(await screen.findByText(copy.loadError)).toBeInTheDocument();
  });

  it('uses the untitled fallback when summary is empty', async () => {
    h.getResult.mockResolvedValue({ ...SAMPLE_EVENT, summary: '' });
    render(
      <PlannerEventModal eventId="evt-1" open onClose={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    expect(
      await screen.findByRole('heading', { name: copy.untitled }),
    ).toBeInTheDocument();
  });

  it('calls onClose when the modal close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    h.getResult.mockResolvedValue(SAMPLE_EVENT);
    render(
      <PlannerEventModal eventId="evt-1" open onClose={onClose} />,
      { wrapper: makeWrapper() },
    );

    await screen.findByRole('heading', { name: 'Sprint planlama' });
    await user.click(screen.getByRole('button', { name: copy.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
