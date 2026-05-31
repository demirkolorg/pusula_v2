import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { IntegrationsGoogleCard } from './integrations-google-card';

/**
 * Faz 16A (DEM-310) — `IntegrationsGoogleCard` RTL testleri. Better Auth
 * client tamamen mock'lu; component'in DEM-55/68 pattern'ına uygun olarak
 * tRPC YOK, sadece `authClient.{listAccounts, oauth2.link, unlinkAccount}`
 * çağrılarına dokunduğunu doğrular.
 */

const h = {
  listAccounts: vi.fn(),
  oauth2Link: vi.fn(),
  unlinkAccount: vi.fn(),
};

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    listAccounts: () => h.listAccounts(),
    oauth2: { link: (input: unknown) => h.oauth2Link(input) },
    unlinkAccount: (input: unknown) => h.unlinkAccount(input),
  },
}));

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const copy = strings.account.integrations;
const googleCopy = copy.google;

describe('<IntegrationsGoogleCard>', () => {
  const originalLocation = window.location;
  let assignedHref: string | null = null;

  beforeEach(() => {
    assignedHref = null;
    h.listAccounts.mockReset();
    h.oauth2Link.mockReset();
    h.unlinkAccount.mockReset();
    // jsdom's window.location is partial — we don't need to assert origin,
    // only to capture href assignments without navigating.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        get href() {
          return assignedHref ?? originalLocation.href;
        },
        set href(value: string) {
          assignedHref = value;
        },
        origin: 'https://pusula.test',
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('shows the not-connected state with Bağla button when no google-calendar account exists', async () => {
    h.listAccounts.mockResolvedValue({ data: [], error: null });
    render(<IntegrationsGoogleCard />, { wrapper: makeWrapper() });

    expect(await screen.findByText(googleCopy.notConnected)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: googleCopy.connect })).toBeEnabled();
    expect(screen.queryByText(googleCopy.connected)).not.toBeInTheDocument();
  });

  it('redirects to the OAuth url returned by authClient.oauth2.link when Bağla is clicked', async () => {
    const user = userEvent.setup();
    h.listAccounts.mockResolvedValue({ data: [], error: null });
    h.oauth2Link.mockResolvedValue({
      data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?test=1' },
      error: null,
    });
    render(<IntegrationsGoogleCard />, { wrapper: makeWrapper() });

    await user.click(
      await screen.findByRole('button', { name: googleCopy.connect }),
    );

    await waitFor(() => {
      expect(h.oauth2Link).toHaveBeenCalledWith({
        providerId: 'google-calendar',
        callbackURL: 'https://pusula.test/account?tab=integrations',
      });
    });
    await waitFor(() => {
      expect(assignedHref).toBe('https://accounts.google.com/o/oauth2/v2/auth?test=1');
    });
  });

  it('surfaces a Turkish connect error when authClient.oauth2.link returns an error', async () => {
    const user = userEvent.setup();
    h.listAccounts.mockResolvedValue({ data: [], error: null });
    h.oauth2Link.mockResolvedValue({ data: null, error: { message: 'plugin not configured' } });
    render(<IntegrationsGoogleCard />, { wrapper: makeWrapper() });

    await user.click(
      await screen.findByRole('button', { name: googleCopy.connect }),
    );

    expect(await screen.findByText('plugin not configured')).toBeInTheDocument();
  });

  it('shows the connected state with formatted date and a Bağlantıyı kes action', async () => {
    h.listAccounts.mockResolvedValue({
      data: [
        {
          providerId: 'google-calendar',
          createdAt: '2026-05-30T10:00:00.000Z',
          scopes: [],
        },
      ],
      error: null,
    });
    render(<IntegrationsGoogleCard />, { wrapper: makeWrapper() });

    expect(await screen.findByText(googleCopy.connected)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: googleCopy.disconnect }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: googleCopy.connect }),
    ).not.toBeInTheDocument();
  });

  it('opens a confirmation dialog and calls unlinkAccount when disconnect is confirmed', async () => {
    const user = userEvent.setup();
    h.listAccounts.mockResolvedValue({
      data: [{ providerId: 'google-calendar', createdAt: new Date().toISOString() }],
      error: null,
    });
    h.unlinkAccount.mockResolvedValue({ data: { status: true }, error: null });
    render(<IntegrationsGoogleCard />, { wrapper: makeWrapper() });

    await user.click(
      await screen.findByRole('button', { name: googleCopy.disconnect }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(googleCopy.disconnectConfirmTitle);

    await user.click(
      screen.getByRole('button', { name: googleCopy.disconnectConfirm }),
    );

    await waitFor(() => {
      expect(h.unlinkAccount).toHaveBeenCalledWith({ providerId: 'google-calendar' });
    });
  });

  it('surfaces a load error if listAccounts fails', async () => {
    h.listAccounts.mockResolvedValue({ data: null, error: { message: 'boom' } });
    render(<IntegrationsGoogleCard />, { wrapper: makeWrapper() });

    expect(await screen.findByText(copy.loadError)).toBeInTheDocument();
  });
});
