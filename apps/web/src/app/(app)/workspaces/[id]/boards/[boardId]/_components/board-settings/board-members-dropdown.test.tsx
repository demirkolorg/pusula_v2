import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ useQuery: vi.fn() }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.useQuery,
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      accessRequests: {
        list: {
          queryOptions: (input: unknown, options?: unknown) => ({
            key: 'board.accessRequests.list',
            input,
            ...(typeof options === 'object' && options ? options : {}),
          }),
        },
      },
    },
  }),
}));

vi.mock('./board-members-section', () => ({
  BoardMembersSection: () => <div>board members section</div>,
}));

vi.mock('./board-invitations-section', () => ({
  BoardInvitationsSection: () => <div>board invitations section</div>,
}));

vi.mock('./board-access-requests-section', () => ({
  BoardAccessRequestsSection: () => <div>board access requests section</div>,
}));

import { BoardMembersDropdown } from './board-members-dropdown';

function renderDropdown(canManage: boolean) {
  render(<BoardMembersDropdown boardId="b1" workspaceId="w1" canManage={canManage} />);
}

/**
 * DEM-154 — "Üyeler" butonu + bekleyen erişim talebi rozeti. Rozet yalnız
 * admin için ve bekleyen talep > 0 iken görünür.
 */
describe('<BoardMembersDropdown>', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
  });

  it('shows a pending access-request badge on the trigger button (admin)', () => {
    h.useQuery.mockReturnValue({ data: [{ id: 'r1' }, { id: 'r2' }] });
    renderDropdown(true);
    expect(
      screen.getByRole('button', { name: 'Üyeler — 2 bekleyen erişim talebi' }),
    ).toBeInTheDocument();
    // Buton + (açık değilken gizli) sekme rozeti — en az buton rozeti "2" gösterir.
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('caps the badge label at 9+', () => {
    h.useQuery.mockReturnValue({ data: Array.from({ length: 12 }, (_, i) => ({ id: `r${i}` })) });
    renderDropdown(true);
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('renders no badge when there are no pending requests', () => {
    h.useQuery.mockReturnValue({ data: [] });
    renderDropdown(true);
    expect(screen.getByRole('button', { name: 'Üyeler' })).toBeInTheDocument();
  });

  it('renders no badge for non-admin viewers', () => {
    // Non-admin: query `enabled: false`, data undefined.
    h.useQuery.mockReturnValue({ data: undefined });
    renderDropdown(false);
    expect(screen.getByRole('button', { name: 'Üyeler' })).toBeInTheDocument();
  });
});
