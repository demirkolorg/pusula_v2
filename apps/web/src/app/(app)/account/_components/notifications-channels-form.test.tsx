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

import { NotificationsChannelsForm } from './notifications-channels-form';

type PreferenceData = {
  muteLevel: 'none' | 'mentions_only' | 'all';
  mentionOnly: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
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
  // useMutation is invoked with the merged options object (mutationOptions
  // returns its input verbatim per our mock); capture the options so the test
  // can drive onMutate/onError/onSettled directly.
  h.useMutation.mockImplementation((opts: MutationOptions) => {
    lastMutationOptions = opts;
    return { mutate, mutateAsync: vi.fn(), isPending, reset: vi.fn() };
  });
  return mutate;
}

describe('NotificationsChannelsForm', () => {
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

  it('renders defaults when no preference row exists', () => {
    setPreferenceQuery({ data: null });
    render(<NotificationsChannelsForm />);
    expect(screen.getByText('Genel kanallar')).toBeInTheDocument();
    expect(screen.getByLabelText('Uygulama içi bildirim')).toBeChecked();
    expect(screen.getByLabelText('Uygulama içi bildirim')).toBeDisabled();
    expect(screen.getByLabelText('E-posta')).toBeChecked();
    expect(screen.getByLabelText('Push (mobil)')).toBeChecked();
    expect(screen.getByLabelText(/Tüm bildirimleri al/)).toHaveAttribute('data-state', 'checked');
  });

  it('reflects loaded preferences', () => {
    setPreferenceQuery({
      data: {
        muteLevel: 'mentions_only',
        mentionOnly: true,
        pushEnabled: false,
        emailEnabled: true,
      },
    });
    render(<NotificationsChannelsForm />);
    expect(screen.getByLabelText('E-posta')).toBeChecked();
    expect(screen.getByLabelText('Push (mobil)')).not.toBeChecked();
    expect(screen.getByLabelText(/Sadece sözedildiğimde/)).toHaveAttribute(
      'data-state',
      'checked',
    );
  });

  it('fires the upsert mutation when toggling email', async () => {
    setPreferenceQuery({
      data: {
        muteLevel: 'none',
        mentionOnly: false,
        pushEnabled: true,
        emailEnabled: true,
      },
    });
    const mutate = setUpsertMutation();
    const user = userEvent.setup();
    render(<NotificationsChannelsForm />);

    await user.click(screen.getByLabelText('E-posta'));

    expect(mutate).toHaveBeenCalledTimes(1);
    const arg = mutate.mock.calls[0]?.[0];
    expect(arg).toMatchObject({
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: false,
    });
    expect(typeof (arg as { clientMutationId: string }).clientMutationId).toBe('string');
  });

  it('fires the upsert mutation when changing mute level', async () => {
    setPreferenceQuery({
      data: {
        muteLevel: 'none',
        mentionOnly: false,
        pushEnabled: true,
        emailEnabled: true,
      },
    });
    const mutate = setUpsertMutation();
    const user = userEvent.setup();
    render(<NotificationsChannelsForm />);

    await user.click(screen.getByLabelText(/Tamamen sustur/));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        muteLevel: 'all',
        emailEnabled: true,
        pushEnabled: true,
      }),
    );
  });

  it('rolls back optimistic update and shows error toast on failure', async () => {
    setPreferenceQuery({
      data: {
        muteLevel: 'none',
        mentionOnly: false,
        pushEnabled: true,
        emailEnabled: true,
      },
    });
    setUpsertMutation();
    render(<NotificationsChannelsForm />);
    expect(lastMutationOptions).not.toBeNull();

    const previous = {
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
    };
    h.getQueryData.mockReturnValue(previous);

    // Drive the optimistic context manually.
    await lastMutationOptions?.onMutate?.({
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: false,
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
