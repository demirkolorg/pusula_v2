import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Vitest + RTL test suite for Section 4 — "Push bildirim cihazları"
 * (Faz 10E / DEM-139). The component is data-driven through `useTRPC`'s
 * `push.tokens.list` query + `push.tokens.revokeById` mutation; both are
 * mocked so the component is exercised in isolation from a live backend.
 *
 * Coverage (≥ 6 tests, prompt KABUL KRİTERİ):
 *   1. loading skeleton state
 *   2. empty state (Faz 7 mobile yokken beklenen davranış)
 *   3. dolu liste — 2 satır, platform fallback, relative time
 *   4. deviceName null + ios → "iOS cihazı" fallback
 *   5. revoke clicked → mutation called with { id }
 *   6. revoke mid-flight → "Çıkarılıyor…" + disabled
 *   7. error state (loadFailed copy)
 */

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
    push: {
      tokens: {
        list: {
          queryOptions: () => ({ key: 'push.tokens.list' }),
          queryFilter: () => ({ queryKey: ['push.tokens.list'] }),
        },
        revokeById: { mutationOptions: (o: unknown) => o },
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

import { NotificationsDevicesList } from './notifications-devices-list';

type DeviceRow = {
  id: string;
  platform: 'ios' | 'android' | 'web';
  deviceName: string | null;
  lastUsedAt: Date | string | null;
  createdAt: Date | string;
};

function setListQuery(state: {
  isPending?: boolean;
  isError?: boolean;
  data?: DeviceRow[];
}) {
  h.useQuery.mockReturnValue({
    isPending: state.isPending ?? false,
    isError: state.isError ?? false,
    data: state.data ?? [],
  });
}

function setMutation({
  mutate = vi.fn(),
  isPending = false,
  variables,
}: {
  mutate?: ReturnType<typeof vi.fn>;
  isPending?: boolean;
  variables?: { id: string };
} = {}) {
  h.useMutation.mockReturnValue({
    mutate,
    mutateAsync: vi.fn(),
    isPending,
    variables,
    reset: vi.fn(),
  });
  return mutate;
}

describe('NotificationsDevicesList', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
    h.useMutation.mockReset();
    h.cancelQueries.mockReset();
    h.invalidateQueries.mockReset();
    h.getQueryData.mockReset();
    h.setQueryData.mockReset();
    h.toastError.mockReset();
    h.toastSuccess.mockReset();
    setMutation();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the loading skeleton while push.tokens.list is pending', () => {
    setListQuery({ isPending: true });
    render(<NotificationsDevicesList />);
    expect(screen.getByLabelText(/cihazlar yükleniyor/i)).toBeInTheDocument();
  });

  it('renders the empty state when there are no devices (Faz 7 mobile yokken)', () => {
    setListQuery({ data: [] });
    render(<NotificationsDevicesList />);
    expect(screen.getByText('Henüz kayıtlı cihaz yok')).toBeInTheDocument();
    expect(
      screen.getByText(/Mobil uygulamada giriş yaptığında otomatik eklenir/i),
    ).toBeInTheDocument();
  });

  it('lists active tokens with platform label + last-used relative time', () => {
    const now = new Date();
    const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000);
    setListQuery({
      data: [
        {
          id: 'pt_a',
          platform: 'ios',
          deviceName: "Abdullah'ın iPhone",
          lastUsedAt: minutesAgo(2),
          createdAt: minutesAgo(60),
        },
        {
          id: 'pt_b',
          platform: 'android',
          deviceName: 'Galaxy S23',
          lastUsedAt: minutesAgo(60 * 24 * 7),
          createdAt: minutesAgo(60 * 24 * 8),
        },
      ],
    });
    render(<NotificationsDevicesList />);
    expect(screen.getByText("Abdullah'ın iPhone")).toBeInTheDocument();
    expect(screen.getByText('Galaxy S23')).toBeInTheDocument();
    // Two distinct platform labels render.
    expect(screen.getByText(/iOS/)).toBeInTheDocument();
    expect(screen.getByText(/Android/)).toBeInTheDocument();
    // Both list items expose the "Çıkar" button.
    const removeButtons = screen.getAllByRole('button', { name: /cihazını listeden çıkar/i });
    expect(removeButtons).toHaveLength(2);
  });

  it('falls back to platform-specific placeholder when deviceName is null', () => {
    setListQuery({
      data: [
        {
          id: 'pt_c',
          platform: 'ios',
          deviceName: null,
          lastUsedAt: null,
          createdAt: new Date(),
        },
      ],
    });
    render(<NotificationsDevicesList />);
    expect(screen.getByText('iOS cihazı')).toBeInTheDocument();
    // Empty deviceName → empty string would otherwise be invisible; the
    // fallback ensures the user always sees a name.
    expect(
      screen.getByRole('button', { name: /iOS cihazı cihazını listeden çıkar/ }),
    ).toBeInTheDocument();
  });

  it('falls back to "Web tarayıcı" for web platform when deviceName is blank', () => {
    setListQuery({
      data: [
        {
          id: 'pt_d',
          platform: 'web',
          deviceName: '   ', // whitespace-only, treated as missing
          lastUsedAt: null,
          createdAt: new Date(),
        },
      ],
    });
    render(<NotificationsDevicesList />);
    expect(screen.getByText('Web tarayıcı')).toBeInTheDocument();
  });

  it('fires the revokeById mutation with the row id when "Çıkar" is clicked', async () => {
    const mutate = setMutation();
    setListQuery({
      data: [
        {
          id: 'pt_x',
          platform: 'ios',
          deviceName: 'iPhone 15',
          lastUsedAt: new Date(),
          createdAt: new Date(),
        },
      ],
    });
    const user = userEvent.setup();
    render(<NotificationsDevicesList />);
    const button = screen.getByRole('button', { name: /iPhone 15 cihazını listeden çıkar/ });
    await user.click(button);
    expect(mutate).toHaveBeenCalledWith({ id: 'pt_x' });
  });

  it('disables the row button and shows "Çıkarılıyor…" while its mutation is pending', () => {
    setMutation({ isPending: true, variables: { id: 'pt_target' } });
    setListQuery({
      data: [
        {
          id: 'pt_target',
          platform: 'android',
          deviceName: 'Pixel 8',
          lastUsedAt: new Date(),
          createdAt: new Date(),
        },
        {
          id: 'pt_other',
          platform: 'ios',
          deviceName: 'iPhone',
          lastUsedAt: new Date(),
          createdAt: new Date(),
        },
      ],
    });
    render(<NotificationsDevicesList />);
    const targetButton = screen.getByRole('button', { name: /Pixel 8 cihazını listeden çıkar/ });
    expect(targetButton).toBeDisabled();
    expect(targetButton).toHaveTextContent(/Çıkarılıyor…/);
    // The other row's button stays enabled.
    const otherButton = screen.getByRole('button', { name: /iPhone cihazını listeden çıkar/ });
    expect(otherButton).not.toBeDisabled();
  });

  it('shows the loadFailed copy when push.tokens.list errors out', () => {
    setListQuery({ isError: true });
    render(<NotificationsDevicesList />);
    expect(screen.getByText('Cihazlar yüklenemedi.')).toBeInTheDocument();
  });
});
