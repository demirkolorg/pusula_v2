import { render, screen } from '@testing-library/react';
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

import { NotificationsDigestForm } from './notifications-digest-form';

type PreferenceData = {
  muteLevel: 'none' | 'mentions_only' | 'all';
  mentionOnly: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  quietFrom: string | null;
  quietTo: string | null;
  quietTimezone: string | null;
  muteUntil: Date | string | null;
  emailMode: 'instant' | 'hourly_digest' | 'daily_digest' | 'off';
} | null;

function setPreferenceQuery(state: { isPending?: boolean; data?: PreferenceData }) {
  h.useQuery.mockReturnValue({
    isPending: state.isPending ?? false,
    isError: false,
    data: state.data ?? null,
  });
}

type MutationOptions = {
  onMutate?: (input: unknown) => Promise<unknown> | unknown;
  onError?: (err: unknown, input: unknown, ctx: unknown) => void;
  onSettled?: () => void;
};

let lastMutationOptions: MutationOptions | null = null;

function setUpsertMutation({
  mutate = vi.fn(),
  isPending = false,
}: { mutate?: ReturnType<typeof vi.fn>; isPending?: boolean } = {}) {
  h.useMutation.mockImplementation((opts: MutationOptions) => {
    lastMutationOptions = opts;
    return { mutate, mutateAsync: vi.fn(), isPending, reset: vi.fn() };
  });
  return mutate;
}

describe('NotificationsDigestForm', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
    h.useMutation.mockReset();
    h.cancelQueries.mockReset();
    h.invalidateQueries.mockReset();
    h.getQueryData.mockReset();
    h.setQueryData.mockReset();
    h.toastError.mockReset();
    h.toastSuccess.mockReset();
    lastMutationOptions = null;
    setUpsertMutation();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders four options with instant pre-selected when no preference row exists', () => {
    setPreferenceQuery({ data: null });
    render(<NotificationsDigestForm />);
    expect(screen.getByText('E-posta sıklığı')).toBeInTheDocument();
    expect(screen.getByLabelText(/Anlık/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Saatlik özet/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Günlük özet/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Hiç gönderme/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Anlık/)).toHaveAttribute('data-state', 'checked');
  });

  it('reflects loaded preference (hourly_digest selected)', () => {
    setPreferenceQuery({
      data: {
        muteLevel: 'none',
        mentionOnly: false,
        pushEnabled: true,
        emailEnabled: true,
        quietFrom: null,
        quietTo: null,
        quietTimezone: null,
        muteUntil: null,
        emailMode: 'hourly_digest',
      },
    });
    render(<NotificationsDigestForm />);
    expect(screen.getByLabelText(/Saatlik özet/)).toHaveAttribute('data-state', 'checked');
  });

  it('fires the upsert mutation when changing mode', async () => {
    setPreferenceQuery({
      data: {
        muteLevel: 'none',
        mentionOnly: false,
        pushEnabled: true,
        emailEnabled: true,
        quietFrom: null,
        quietTo: null,
        quietTimezone: null,
        muteUntil: null,
        emailMode: 'instant',
      },
    });
    const mutate = setUpsertMutation();
    const user = userEvent.setup();
    render(<NotificationsDigestForm />);

    await user.click(screen.getByLabelText(/Saatlik özet/));

    expect(mutate).toHaveBeenCalledTimes(1);
    const arg = mutate.mock.calls[0]?.[0];
    expect(arg).toMatchObject({
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
      emailMode: 'hourly_digest',
    });
    expect(typeof (arg as { clientMutationId: string }).clientMutationId).toBe('string');
  });

  it('displays the bypass note about mention + invitations', () => {
    setPreferenceQuery({ data: null });
    render(<NotificationsDigestForm />);
    expect(
      screen.getByText(/Sözedilme \(@\) ve davetler her zaman anlık gönderilir/),
    ).toBeInTheDocument();
  });

  it('rolls back optimistic update and shows error toast on failure', async () => {
    setPreferenceQuery({
      data: {
        muteLevel: 'none',
        mentionOnly: false,
        pushEnabled: true,
        emailEnabled: true,
        quietFrom: null,
        quietTo: null,
        quietTimezone: null,
        muteUntil: null,
        emailMode: 'instant',
      },
    });
    setUpsertMutation();
    render(<NotificationsDigestForm />);
    expect(lastMutationOptions).not.toBeNull();

    const previous = {
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
      quietFrom: null,
      quietTo: null,
      quietTimezone: null,
      muteUntil: null,
      emailMode: 'instant',
    };
    h.getQueryData.mockReturnValue(previous);

    await lastMutationOptions?.onMutate?.({
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
      emailMode: 'hourly_digest',
    });
    expect(h.cancelQueries).toHaveBeenCalled();
    expect(h.setQueryData).toHaveBeenCalled();

    lastMutationOptions?.onError?.(new Error('boom'), {}, { previous });
    expect(h.setQueryData).toHaveBeenLastCalledWith(['preferences', 'get'], previous);
    expect(h.toastError).toHaveBeenCalled();

    lastMutationOptions?.onSettled?.();
    expect(h.invalidateQueries).toHaveBeenCalled();
  });
});
