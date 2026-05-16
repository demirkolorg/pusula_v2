import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  cancelQueries: vi.fn(),
  invalidateQueries: vi.fn(),
  getQueryData: vi.fn(),
  setQueryData: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.useQuery,
  useMutation: h.useMutation,
  useQueryClient: () => ({
    cancelQueries: h.cancelQueries,
    invalidateQueries: h.invalidateQueries,
    getQueryData: h.getQueryData,
    setQueryData: h.setQueryData,
  }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    notifications: {
      preferences: {
        get: {
          queryOptions: () => ({ key: 'preferences.get' }),
          queryFilter: () => ({ queryKey: ['preferences', 'get'] }),
        },
        list: {
          queryFilter: () => ({ queryKey: ['preferences', 'list'] }),
        },
        upsert: {
          mutationOptions: (o: unknown) => o,
        },
      },
    },
  }),
}));

vi.mock('@pusula/ui', async (importOriginal) => {
  const mod: Record<string, unknown> = await importOriginal();
  return {
    ...mod,
    toast: { success: h.toastSuccess, error: h.toastError },
  };
});

import { NotificationsTypeMatrix } from './notifications-type-matrix';

type PreferenceData = {
  muteLevel: 'none' | 'mentions_only' | 'all';
  mentionOnly: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
} | null;

function setQuery(data: PreferenceData) {
  h.useQuery.mockReturnValue({
    isPending: false,
    isError: false,
    data,
  });
}

function setMutation({
  mutate = vi.fn(),
  isPending = false,
}: { mutate?: ReturnType<typeof vi.fn>; isPending?: boolean } = {}) {
  h.useMutation.mockReturnValue({
    mutate,
    mutateAsync: vi.fn(),
    isPending,
    reset: vi.fn(),
  });
  return mutate;
}

const defaultPrefs: PreferenceData = {
  muteLevel: 'none',
  mentionOnly: false,
  pushEnabled: true,
  emailEnabled: true,
};

describe('NotificationsTypeMatrix', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
    h.useMutation.mockReset();
    h.cancelQueries.mockReset();
    h.invalidateQueries.mockReset();
    h.getQueryData.mockReset();
    h.setQueryData.mockReset();
    h.toastError.mockReset();
    setMutation();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the 17 notification type rows grouped by category', () => {
    // DEM-152 — `watched_activity` "çöp kovası" 7 granular tipe bölündü.
    setQuery(defaultPrefs);
    render(<NotificationsTypeMatrix />);
    expect(screen.getByText('Bana atanma')).toBeInTheDocument();
    expect(screen.getByText('Sözedilme (@)')).toBeInTheDocument();
    expect(screen.getByText('Takipteki kartta yorum')).toBeInTheDocument();
    expect(screen.getByText('Yaklaşan bitiş')).toBeInTheDocument();
    expect(screen.getByText('Geciken kart')).toBeInTheDocument();
    // Granular kart-aktivite tipleri (eski "Takipteki kart hareketi" yerine).
    expect(screen.getByText('Kart taşındı')).toBeInTheDocument();
    expect(screen.getByText('Kart arşivlendi')).toBeInTheDocument();
    expect(screen.getByText('Kart tamamlandı')).toBeInTheDocument();
    expect(screen.getByText('Teslim tarihi değişti')).toBeInTheDocument();
    expect(screen.getByText('Kart kapağı değişti')).toBeInTheDocument();
    expect(screen.getByText('Karta dosya eklendi')).toBeInTheDocument();
    expect(screen.getByText('Karttan çıkarıldım')).toBeInTheDocument();
    expect(screen.getByText('Pano daveti')).toBeInTheDocument();
    expect(screen.getByText('Çalışma alanı daveti')).toBeInTheDocument();
    expect(screen.getByText('Atama & sözedilme')).toBeInTheDocument();
    expect(screen.getByText('Davet')).toBeInTheDocument();
  });

  it('shows mute-bypass icon (no Switch) for invitation type email cell', () => {
    setQuery(defaultPrefs);
    render(<NotificationsTypeMatrix />);
    // mention email = mute_bypass → no role=switch element exists for it.
    const inviteRows = screen.getAllByRole('row');
    const inviteRow = inviteRows.find((r) => within(r).queryByText('Pano daveti'));
    expect(inviteRow).toBeDefined();
    if (!inviteRow) return;
    // Each cell has aria-label; bypass cell uses muteBypassTooltip.
    expect(within(inviteRow).getAllByLabelText(/Bu bildirim her zaman gönderilir/).length).toBeGreaterThan(0);
  });

  it('toggling a comment-row email cell renders em-dash (unavailable)', () => {
    setQuery(defaultPrefs);
    render(<NotificationsTypeMatrix />);
    const rows = screen.getAllByRole('row');
    const row = rows.find((r) => within(r).queryByText('Takipteki kartta yorum'));
    expect(row).toBeDefined();
    if (!row) return;
    expect(within(row).getAllByLabelText(/Bu kanal bu bildirim tipi için mevcut değil/).length).toBeGreaterThan(0);
  });

  it('disables email column switches when global email is OFF', () => {
    setQuery({ ...defaultPrefs, emailEnabled: false });
    render(<NotificationsTypeMatrix />);
    // Find the card_assigned row email switch
    const switches = screen.getAllByRole('switch');
    // any switch tied to email channel should be disabled when global email off
    const emailSwitches = switches.filter((s) => /email/.test(s.getAttribute('aria-label') ?? ''));
    expect(emailSwitches.length).toBeGreaterThan(0);
    for (const s of emailSwitches) {
      expect(s).toBeDisabled();
    }
  });

  it('"Hepsini aç" sets both email and push true', async () => {
    setQuery({ ...defaultPrefs, emailEnabled: false, pushEnabled: false });
    const mutate = setMutation();
    const user = userEvent.setup();
    render(<NotificationsTypeMatrix />);
    await user.click(screen.getByRole('button', { name: 'Hepsini aç' }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ emailEnabled: true, pushEnabled: true }),
    );
  });

  it('"Sadece e-postayı kapat" sets only email false (push preserved)', async () => {
    setQuery({ ...defaultPrefs, emailEnabled: true, pushEnabled: true });
    const mutate = setMutation();
    const user = userEvent.setup();
    render(<NotificationsTypeMatrix />);
    await user.click(screen.getByRole('button', { name: 'Sadece e-postayı kapat' }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ emailEnabled: false, pushEnabled: true }),
    );
  });
});
