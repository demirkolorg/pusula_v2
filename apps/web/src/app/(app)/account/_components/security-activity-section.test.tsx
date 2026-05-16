import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  invalidate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.useQuery,
  useMutation: h.useMutation,
  useQueryClient: () => ({ invalidateQueries: h.invalidate }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    auth: {
      devices: {
        list: { queryOptions: () => ({ key: 'auth.devices.list' }), queryFilter: () => ({}) },
        revoke: { mutationOptions: (o: unknown) => o },
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

import { SecurityActivitySection } from './security-activity-section';

type Device = {
  id: string;
  userAgent: string;
  ipSubnet: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  isCurrent: boolean;
};

const baseDevice: Device = {
  id: 'dev-1',
  userAgent: 'Mozilla/5.0 Chrome/120.0 Windows',
  ipSubnet: '203.0.113.0/24',
  firstSeenAt: new Date('2026-05-10T08:00:00Z'),
  lastSeenAt: new Date('2026-05-15T14:23:00Z'),
  isCurrent: false,
};

function setListQuery(state: {
  isPending?: boolean;
  isError?: boolean;
  data?: Device[];
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
  variables?: { deviceId: string };
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

describe('SecurityActivitySection', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
    h.useMutation.mockReset();
    h.invalidate.mockReset();
    h.toastError.mockReset();
    h.toastSuccess.mockReset();
    setMutation();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the loading copy while devices.list is pending', () => {
    setListQuery({ isPending: true });
    render(<SecurityActivitySection />);
    expect(screen.getByText(/cihazlar yükleniyor/i)).toBeInTheDocument();
  });

  it('shows the empty state when there are no devices', () => {
    setListQuery({ data: [] });
    render(<SecurityActivitySection />);
    expect(screen.getByText('Henüz bilinen cihaz yok')).toBeInTheDocument();
  });

  it('lists devices with subnet + current badge for the active session', () => {
    setListQuery({
      data: [
        { ...baseDevice, isCurrent: true },
        { ...baseDevice, id: 'dev-2', userAgent: 'Mozilla/5.0 Safari/iPhone', isCurrent: false },
      ],
    });
    render(<SecurityActivitySection />);
    expect(screen.getByText('Mozilla/5.0 Chrome/120.0 Windows')).toBeInTheDocument();
    expect(screen.getByText('Mozilla/5.0 Safari/iPhone')).toBeInTheDocument();
    expect(screen.getAllByText('203.0.113.0/24').length).toBeGreaterThan(0);
    expect(screen.getByText('Bu oturum')).toBeInTheDocument();
  });

  it('disables the sign-out button on the current session', () => {
    setListQuery({ data: [{ ...baseDevice, isCurrent: true }] });
    render(<SecurityActivitySection />);
    const button = screen.getByRole('button', {
      name: /Mozilla\/5.0 Chrome\/120.0 Windows cihazından çıkış yap/,
    });
    expect(button).toBeDisabled();
  });

  it('fires the revoke mutation when clicking sign-out on a non-current session', async () => {
    const mutate = setMutation();
    setListQuery({ data: [baseDevice] });

    const user = userEvent.setup();
    render(<SecurityActivitySection />);

    const button = screen.getByRole('button', {
      name: /Mozilla\/5.0 Chrome\/120.0 Windows cihazından çıkış yap/,
    });
    await user.click(button);

    expect(mutate).toHaveBeenCalledWith({ deviceId: 'dev-1' });
  });

  it('renders the error copy when the list query fails', () => {
    setListQuery({ isError: true });
    render(<SecurityActivitySection />);
    expect(screen.getByText(/cihazlar yüklenemedi/i)).toBeInTheDocument();
  });
});
