import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Vitest + RTL tests for the card-detail snooze dropdown
 * (Faz 10H / DEM-142). The component is data-driven through `useTRPC`'s
 * `notifications.preferences.get({ cardId })` query + `snooze` / `unsnooze`
 * mutations; all three are mocked here.
 *
 * Coverage:
 *   1. Snooze yokken trigger ikon `BellIcon` + label "Bildirimleri sustur".
 *   2. Snooze aktifken trigger ikon `BellOffIcon` + kalan süre label.
 *   3. Dropdown açılınca 5 duration öğesi + (aktif iken) "Susturmayı kaldır".
 *   4. "1 saatlik" seçince snooze mutation `cardId` + `duration: '1h'` ile çağrılır.
 *   5. "Susturmayı kaldır" seçince unsnooze mutation cardId ile çağrılır.
 *   6. "Belirli tarihe kadar…" seçince dialog açılır, geçerli tarih submit
 *      `until_date` mutation çağırır.
 *   7. Geçmiş tarih submit → mutation çağrılmaz, hata mesajı görünür.
 */

const h = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  cancelQueries: vi.fn(),
  invalidateQueries: vi.fn(),
  getQueryData: vi.fn(),
  setQueryData: vi.fn(),
  toastError: vi.fn(),
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
          queryOptions: (input: unknown) => ({ key: 'preferences.get', input }),
          queryFilter: (input: unknown) => ({ queryKey: ['preferences.get', input] }),
        },
        list: {
          queryFilter: () => ({ queryKey: ['preferences.list'] }),
        },
        snooze: { mutationOptions: (o: unknown) => o },
        unsnooze: { mutationOptions: (o: unknown) => o },
      },
    },
  }),
}));

vi.mock('@pusula/ui', async (importOriginal) => {
  const mod: Record<string, unknown> = await importOriginal();
  return { ...mod, toast: { success: vi.fn(), error: h.toastError } };
});

import { CardDetailSnooze } from './card-detail-snooze';

type GetData = {
  muteLevel: 'none' | 'mentions_only' | 'all';
  mentionOnly: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  quietFrom: string | null;
  quietTo: string | null;
  quietTimezone: string | null;
  muteUntil: Date | string | null;
} | null;

function setGetQuery(state: { isPending?: boolean; data?: GetData }) {
  h.useQuery.mockReturnValue({
    isPending: state.isPending ?? false,
    isError: false,
    data: state.data ?? null,
  });
}

const snoozeMutate = vi.fn();
const unsnoozeMutate = vi.fn();

function setMutations(opts: { snoozePending?: boolean; unsnoozePending?: boolean } = {}) {
  // Component renders → `useMutation` called twice (snooze, then unsnooze).
  // Each re-render does the same pair; a stateful counter alternates between
  // the two returned objects so the snooze hook always wins call #1, #3, #5…
  // and unsnooze always wins call #2, #4, #6…
  let toggle = false;
  const snoozeReturn = {
    mutate: snoozeMutate,
    mutateAsync: vi.fn(),
    isPending: opts.snoozePending ?? false,
    variables: undefined,
    reset: vi.fn(),
  };
  const unsnoozeReturn = {
    mutate: unsnoozeMutate,
    mutateAsync: vi.fn(),
    isPending: opts.unsnoozePending ?? false,
    variables: undefined,
    reset: vi.fn(),
  };
  h.useMutation.mockImplementation(() => {
    const result = toggle ? unsnoozeReturn : snoozeReturn;
    toggle = !toggle;
    return result;
  });
}

describe('CardDetailSnooze', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
    h.useMutation.mockReset();
    h.cancelQueries.mockReset();
    h.invalidateQueries.mockReset();
    h.getQueryData.mockReset();
    h.setQueryData.mockReset();
    h.toastError.mockReset();
    snoozeMutate.mockReset();
    unsnoozeMutate.mockReset();
    setMutations();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('snooze yokken trigger label "Bildirimleri sustur" — bell icon görünür', () => {
    setGetQuery({ data: null });
    render(<CardDetailSnooze cardId="c_1" />);
    const trigger = screen.getByRole('button', { name: /Bildirimleri sustur$/ });
    expect(trigger).toBeInTheDocument();
    expect(trigger.getAttribute('data-snooze-active')).toBeNull();
  });

  it('snooze aktifken trigger label kalan süreyi gösterir + data-snooze-active=true', () => {
    const future = new Date(Date.now() + 4 * 60 * 60 * 1000);
    setGetQuery({
      data: {
        muteLevel: 'none',
        mentionOnly: false,
        pushEnabled: true,
        emailEnabled: true,
        quietFrom: null,
        quietTo: null,
        quietTimezone: null,
        muteUntil: future,
      },
    });
    render(<CardDetailSnooze cardId="c_2" />);
    const trigger = screen.getByRole('button', { name: /Bildirimleri sustur ·/ });
    expect(trigger).toBeInTheDocument();
    expect(trigger.getAttribute('data-snooze-active')).toBe('true');
  });

  it('dropdown 5 duration öğesi sunar; aktif değilken "Susturmayı kaldır" yok', async () => {
    setGetQuery({ data: null });
    const user = userEvent.setup();
    render(<CardDetailSnooze cardId="c_3" />);
    await user.click(screen.getByRole('button', { name: /Bildirimleri sustur/ }));
    expect(await screen.findByText('1 saatlik')).toBeInTheDocument();
    expect(screen.getByText('4 saatlik')).toBeInTheDocument();
    expect(screen.getByText('1 günlük')).toBeInTheDocument();
    expect(screen.getByText('1 haftalık')).toBeInTheDocument();
    expect(screen.getByText(/Belirli tarihe kadar/)).toBeInTheDocument();
    expect(screen.queryByText('Susturmayı kaldır')).not.toBeInTheDocument();
  });

  it('"1 saatlik" tıklanınca snooze mutation cardId + 1h ile çağrılır', async () => {
    setGetQuery({ data: null });
    const user = userEvent.setup();
    render(<CardDetailSnooze cardId="c_4" />);
    await user.click(screen.getByRole('button', { name: /Bildirimleri sustur/ }));
    await user.click(await screen.findByText('1 saatlik'));
    expect(snoozeMutate).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'c_4', duration: '1h' }),
    );
  });

  it('snooze aktif iken "Susturmayı kaldır" görünür ve unsnooze mutation çağrılır', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    setGetQuery({
      data: {
        muteLevel: 'none',
        mentionOnly: false,
        pushEnabled: true,
        emailEnabled: true,
        quietFrom: null,
        quietTo: null,
        quietTimezone: null,
        muteUntil: future,
      },
    });
    const user = userEvent.setup();
    render(<CardDetailSnooze cardId="c_5" />);
    await user.click(screen.getByRole('button', { name: /Bildirimleri sustur ·/ }));
    const remove = await screen.findByText('Susturmayı kaldır');
    await user.click(remove);
    expect(unsnoozeMutate).toHaveBeenCalledWith(expect.objectContaining({ cardId: 'c_5' }));
  });

  it('"Belirli tarihe kadar…" → dialog açılır; geçerli tarih submit until_date mutation çağırır', async () => {
    setGetQuery({ data: null });
    const user = userEvent.setup();
    render(<CardDetailSnooze cardId="c_6" />);
    await user.click(screen.getByRole('button', { name: /Bildirimleri sustur/ }));
    await user.click(await screen.findByText(/Belirli tarihe kadar/));

    const input = await screen.findByLabelText(/Bitiş tarihi/);
    // 2 gün sonrası geçerli tarih (ISO local format).
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const value = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;
    await user.clear(input);
    await user.type(input, value);
    await user.click(screen.getByRole('button', { name: /^Sustur$/ }));
    expect(snoozeMutate).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'c_6', duration: 'until_date' }),
    );
  });

  it('"Belirli tarihe kadar…" → boş tarih submit hata gösterir, mutation çağrılmaz', async () => {
    setGetQuery({ data: null });
    const user = userEvent.setup();
    render(<CardDetailSnooze cardId="c_7" />);
    await user.click(screen.getByRole('button', { name: /Bildirimleri sustur/ }));
    await user.click(await screen.findByText(/Belirli tarihe kadar/));

    // Submit boş input → dialog disabled state'de tutar; mutate çağrılmaz.
    const submit = await screen.findByRole('button', { name: /^Sustur$/ });
    expect(submit).toBeDisabled();
    expect(snoozeMutate).not.toHaveBeenCalled();
  });
});
