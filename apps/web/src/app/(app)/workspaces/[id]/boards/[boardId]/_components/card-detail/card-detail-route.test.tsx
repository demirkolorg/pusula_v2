import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  routerPush: vi.fn(),
  searchParams: new URLSearchParams(),
  session: { data: { user: { id: 'u1' } } } as { data: { user: { id: string } } | null },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.routerPush, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/workspaces/w1/boards/b1',
  useSearchParams: () => h.searchParams,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => h.session },
}));

// Stand in for the heavy dialog — we only care about the route glue here.
vi.mock('./card-detail-dialog', () => ({
  CardDetailDialog: ({
    cardId,
    highlightCommentId,
    highlightChecklistItemId,
    highlightAttachmentId,
    initialTab,
    onClose,
  }: {
    cardId: string;
    highlightCommentId?: string | null;
    highlightChecklistItemId?: string | null;
    highlightAttachmentId?: string | null;
    initialTab?: string | null;
    onClose: () => void;
  }) => (
    <div data-testid="card-detail-dialog">
      <span>card:{cardId}</span>
      <span data-testid="highlight-comment">{highlightCommentId ?? ''}</span>
      <span data-testid="highlight-checklist">{highlightChecklistItemId ?? ''}</span>
      <span data-testid="highlight-attachment">{highlightAttachmentId ?? ''}</span>
      <span data-testid="initial-tab">{initialTab ?? ''}</span>
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

import { CardDetailRoute } from './card-detail-route';

describe('<CardDetailRoute>', () => {
  it('renders nothing when there is no ?card param', () => {
    h.searchParams = new URLSearchParams();
    h.session = { data: { user: { id: 'u1' } } };
    const { container } = render(<CardDetailRoute boardId="b1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing until the session resolves (no user id yet)', () => {
    h.searchParams = new URLSearchParams('card=card1');
    h.session = { data: null };
    const { container } = render(<CardDetailRoute boardId="b1" />);
    expect(container).toBeEmptyDOMElement();
  });

  // `CardDetailRoute` artık `CardDetailDialog`'u `next/dynamic` ile lazy yükler
  // (DEM-229 #3); dialog bir mikro-görev sonrası mount olduğundan beklemek için
  // `findBy*` (async) kullanılır.
  it('renders the dialog for the ?card id once the session is known', async () => {
    h.searchParams = new URLSearchParams('card=card1');
    h.session = { data: { user: { id: 'u1' } } };
    render(<CardDetailRoute boardId="b1" />);
    expect(await screen.findByTestId('card-detail-dialog')).toBeInTheDocument();
    expect(screen.getByText('card:card1')).toBeInTheDocument();
  });

  it('closing the dialog pushes back to the bare pathname (drops ?card), keeping scroll', async () => {
    const user = userEvent.setup();
    h.searchParams = new URLSearchParams('card=card1');
    h.session = { data: { user: { id: 'u1' } } };
    h.routerPush.mockReset();
    render(<CardDetailRoute boardId="b1" />);
    await user.click(await screen.findByRole('button', { name: 'close' }));
    expect(h.routerPush).toHaveBeenCalledWith('/workspaces/w1/boards/b1', { scroll: false });
  });

  it('closing the dialog keeps other query params, dropping only ?card', async () => {
    const user = userEvent.setup();
    h.searchParams = new URLSearchParams('filter=open&card=card1');
    h.session = { data: { user: { id: 'u1' } } };
    h.routerPush.mockReset();
    render(<CardDetailRoute boardId="b1" />);
    await user.click(await screen.findByRole('button', { name: 'close' }));
    expect(h.routerPush).toHaveBeenCalledWith('/workspaces/w1/boards/b1?filter=open', {
      scroll: false,
    });
  });

  it('forwards the notification deep-link focus params to the dialog', async () => {
    h.searchParams = new URLSearchParams('card=card1&comment=cm1&tab=comments');
    h.session = { data: { user: { id: 'u1' } } };
    render(<CardDetailRoute boardId="b1" />);
    expect(await screen.findByTestId('card-detail-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('highlight-comment')).toHaveTextContent('cm1');
    expect(screen.getByTestId('initial-tab')).toHaveTextContent('comments');
    expect(screen.getByTestId('highlight-checklist')).toHaveTextContent('');
    expect(screen.getByTestId('highlight-attachment')).toHaveTextContent('');
  });

  it('closing the dialog drops the focus params (comment/checklistItem/attachment/tab) too', async () => {
    const user = userEvent.setup();
    h.searchParams = new URLSearchParams('filter=open&card=card1&attachment=at1&tab=attachments');
    h.session = { data: { user: { id: 'u1' } } };
    h.routerPush.mockReset();
    render(<CardDetailRoute boardId="b1" />);
    await user.click(await screen.findByRole('button', { name: 'close' }));
    expect(h.routerPush).toHaveBeenCalledWith('/workspaces/w1/boards/b1?filter=open', {
      scroll: false,
    });
  });
});
