import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

let unreadCount = 0;

vi.mock('./notification-center', () => ({
  NotificationCenter: () => <div>Notification center panel</div>,
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    notifications: {
      unreadCount: {
        queryOptions: (_input: undefined, options?: unknown) => ({
          queryKey: ['notifications.unreadCount'],
          queryFn: async () => ({ count: unreadCount }),
          ...(typeof options === 'object' && options ? options : {}),
        }),
      },
    },
  }),
}));

import { NotificationBell } from './notification-bell';

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderBell() {
  const queryClient = newQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationBell />
    </QueryClientProvider>,
  );
}

describe('<NotificationBell>', () => {
  beforeEach(() => {
    unreadCount = 0;
  });

  it('hides the badge and uses the neutral aria label when unread count is zero', async () => {
    renderBell();

    expect(
      await screen.findByRole('button', { name: strings.notifications.bellAria(0) }),
    ).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows the unread badge and count-specific aria label', async () => {
    unreadCount = 3;

    renderBell();

    expect(
      await screen.findByRole('button', { name: strings.notifications.bellAria(3) }),
    ).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('caps the visual badge at 9+', async () => {
    unreadCount = 12;

    renderBell();

    expect(
      await screen.findByRole('button', { name: strings.notifications.bellAria(12) }),
    ).toBeInTheDocument();
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('opens the popover panel on click', async () => {
    const user = userEvent.setup();
    renderBell();

    await user.click(
      await screen.findByRole('button', { name: strings.notifications.bellAria(0) }),
    );

    expect(screen.getByText('Notification center panel')).toBeInTheDocument();
  });
});
