import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { PlannerPanel } from './planner-panel';

/**
 * Faz 16B (DEM-311) — PlannerPanel RTL testleri. Bağlı/değil durumları,
 * tarih navigasyonu, yenile butonu ve boş timeline iskelet doğrulanır.
 * 16C'de event render eklenince burası genişler. Better Auth client
 * tamamen mock'lu (DEM-310 pattern'ı).
 */

const h = {
  listAccounts: vi.fn(),
};

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    listAccounts: () => h.listAccounts(),
  },
}));

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
  });

  it('renders the not-connected CTA when no google-calendar account exists', async () => {
    h.listAccounts.mockResolvedValue({ data: [], error: null });
    render(<PlannerPanel onClose={vi.fn()} />, { wrapper: makeWrapper() });

    // CTA link tek match (header h2 + body title ikisi de "Planlayıcı"; CTA "Hesap bağla").
    const cta = await screen.findByRole('link', {
      name: new RegExp(copy.notConnected.cta),
    });
    expect(cta).toHaveAttribute('href', '/account?tab=integrations');
    expect(screen.queryByText(copy.emptyDay)).not.toBeInTheDocument();
  });

  it('renders the empty timeline when the user is connected', async () => {
    h.listAccounts.mockResolvedValue({
      data: [{ providerId: 'google-calendar', createdAt: new Date().toISOString() }],
      error: null,
    });
    render(<PlannerPanel onClose={vi.fn()} />, { wrapper: makeWrapper() });

    expect(await screen.findByText(copy.emptyDay)).toBeInTheDocument();
    // Saat etiketleri 09:00 ve 21:00 (sınırlar) görünmeli.
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('21:00')).toBeInTheDocument();
  });

  it('disables the "Bugün" button when the current view is already today', async () => {
    h.listAccounts.mockResolvedValue({ data: [], error: null });
    render(<PlannerPanel onClose={vi.fn()} />, { wrapper: makeWrapper() });

    await screen.findByText(copy.notConnected.title);
    const todayButton = screen.getByRole('button', { name: copy.today });
    expect(todayButton).toBeDisabled();
  });

  it('navigates to the previous day and re-enables the "Bugün" button', async () => {
    const user = userEvent.setup();
    h.listAccounts.mockResolvedValue({ data: [], error: null });
    render(<PlannerPanel onClose={vi.fn()} />, { wrapper: makeWrapper() });

    await user.click(screen.getByRole('button', { name: copy.prevDay }));

    const todayButton = screen.getByRole('button', { name: copy.today });
    await waitFor(() => expect(todayButton).toBeEnabled());
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

    // İlk fetch'in resolve olmasını bekle.
    await screen.findByText(copy.notConnected.title);
    expect(h.listAccounts).toHaveBeenCalledTimes(1);

    // Settled state'te buton "Yenile" name'iyle erişilebilir olur.
    const refreshButton = await screen.findByRole('button', { name: copy.refresh });
    await user.click(refreshButton);
    await waitFor(() => expect(h.listAccounts).toHaveBeenCalledTimes(2));
  });
});
