import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Vitest + RTL — bildirim detay / audit ekranı (`(app)/notifications/[id]`).
 * byId sorgusu + markRead mutation mock'lanır; component canlı backend'den
 * izole çalışır. Kapsam:
 *   1. yükleniyor → spinner
 *   2. dolu bildirim → aktör adı + özet + "Karta git" hedefi + önce/sonra diff
 *   3. açılışta okunmamışsa markRead({ id }) çağrılır
 *   4. NOT_FOUND → "bulunamadı" boş durumu, "Karta git" yok
 *   5. kart hedefi yoksa "Karta git" gizli (workspace-only → "İlgili ekrana git")
 */

const h = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  invalidateQueries: vi.fn(),
  routerPush: vi.fn(),
  routerBack: vi.fn(),
  markReadMutate: vi.fn(),
  params: { id: 'ntf_1' } as { id: string },
}));

vi.mock('next/navigation', () => ({
  useParams: () => h.params,
  useRouter: () => ({ push: h.routerPush, back: h.routerBack }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.useQuery,
  useMutation: h.useMutation,
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    notifications: {
      byId: { queryOptions: (input: unknown) => ({ key: 'notifications.byId', input }) },
      markRead: { mutationOptions: (o: unknown) => o },
      list: { infiniteQueryFilter: () => ({ queryKey: ['notifications.list'] }) },
      unreadCount: { queryFilter: () => ({ queryKey: ['notifications.unreadCount'] }) },
    },
  }),
}));

// AppSpinner pulls in lottie-react (heavy, browser-only) — stub it.
vi.mock('@/components/app-spinner', () => ({
  AppSpinner: () => <div data-testid="app-spinner" />,
}));

import NotificationDetailPage from './page';

type ByIdRow = {
  id: string;
  recipientId: string;
  actorId: string | null;
  type: string;
  workspaceId: string | null;
  boardId: string | null;
  cardId: string | null;
  payload: Record<string, unknown> | null;
  readAt: Date | string | null;
  createdAt: Date | string;
  activityEventId: string | null;
  actorName: string | null;
  actorImage: string | null;
  cardTitle: string | null;
  boardTitle: string | null;
  workspaceName: string | null;
  activityEventPayload: Record<string, unknown> | null;
};

function baseRow(overrides: Partial<ByIdRow> = {}): ByIdRow {
  return {
    id: 'ntf_1',
    recipientId: 'usr_me',
    actorId: 'usr_actor',
    type: 'card_renamed',
    workspaceId: 'ws_1',
    boardId: 'brd_1',
    cardId: 'crd_1',
    payload: { cardTitle: 'Ödeme akışı', boardName: 'Sprint 7' },
    readAt: null,
    createdAt: new Date('2026-06-20T10:00:00.000Z'),
    activityEventId: 'evt_1',
    actorName: 'Aria Chen',
    actorImage: null,
    cardTitle: 'Ödeme akışı',
    boardTitle: 'Sprint 7',
    workspaceName: 'Pusula',
    activityEventPayload: { fromTitle: 'Eski başlık', toTitle: 'Ödeme akışı' },
    ...overrides,
  };
}

function setQuery(state: {
  isLoading?: boolean;
  isError?: boolean;
  data?: ByIdRow;
  error?: unknown;
}) {
  h.useQuery.mockReturnValue({
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
    data: state.data,
    error: state.error ?? null,
    refetch: vi.fn(),
  });
}

beforeEach(() => {
  h.params = { id: 'ntf_1' };
  h.useMutation.mockReturnValue({ mutate: h.markReadMutate, isPending: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('NotificationDetailPage', () => {
  it('yüklenirken spinner gösterir', () => {
    setQuery({ isLoading: true });
    render(<NotificationDetailPage />);
    expect(screen.getByTestId('app-spinner')).toBeInTheDocument();
  });

  it('dolu bildirimi aktör + özet + önce/sonra diff ile render eder', () => {
    setQuery({ data: baseRow() });
    render(<NotificationDetailPage />);

    // Aktör adı başlıkta.
    expect(screen.getByRole('heading', { level: 1, name: 'Aria Chen' })).toBeInTheDocument();
    // İnsan-okunur özet (activitySummary, card_renamed).
    expect(screen.getByText(/başlığını değiştirdi/)).toBeInTheDocument();
    // Önce → sonra diff (buildActivityChanges → fromTitle/toTitle).
    expect(screen.getByText('Eski başlık')).toBeInTheDocument();
    // "Ödeme akışı" diff'in "to" hücresi + bağlam + ham JSON'da geçer.
    expect(screen.getAllByText('Ödeme akışı').length).toBeGreaterThanOrEqual(2);
    // Bağlam satırı (pano adı) — bağlam + ham JSON'da geçebilir.
    expect(screen.getAllByText('Sprint 7').length).toBeGreaterThanOrEqual(1);
  });

  it('"Karta git" butonu kart deep-link\'ine yönlendirir', async () => {
    const user = userEvent.setup();
    setQuery({ data: baseRow() });
    render(<NotificationDetailPage />);

    const goButton = screen.getByRole('button', { name: /Karta git/ });
    await user.click(goButton);

    expect(h.routerPush).toHaveBeenCalledWith(
      '/workspaces/ws_1/boards/brd_1?card=crd_1',
    );
  });

  it('açılışta okunmamışsa markRead({ id }) çağrılır', () => {
    setQuery({ data: baseRow({ readAt: null }) });
    render(<NotificationDetailPage />);
    expect(h.markReadMutate).toHaveBeenCalledWith({ id: 'ntf_1' });
  });

  it('okunmuş bildirimde markRead çağrılmaz', () => {
    setQuery({ data: baseRow({ readAt: new Date('2026-06-20T11:00:00.000Z') }) });
    render(<NotificationDetailPage />);
    expect(h.markReadMutate).not.toHaveBeenCalled();
  });

  it('NOT_FOUND hatasında "bulunamadı" durumu gösterir, "Karta git" yok', () => {
    setQuery({ isError: true, error: { data: { code: 'NOT_FOUND' } } });
    render(<NotificationDetailPage />);
    expect(screen.getByText('Bildirim bulunamadı')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Karta git/ })).not.toBeInTheDocument();
  });

  it('kart hedefi yoksa "Karta git" yerine "İlgili ekrana git" çıkar', () => {
    setQuery({
      data: baseRow({
        type: 'workspace_invitation',
        cardId: null,
        boardId: null,
        cardTitle: null,
        boardTitle: null,
        payload: { workspaceName: 'Pusula' },
        activityEventPayload: null,
      }),
    });
    render(<NotificationDetailPage />);
    expect(screen.queryByRole('button', { name: /Karta git/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /İlgili ekrana git/ })).toBeInTheDocument();
  });
});
