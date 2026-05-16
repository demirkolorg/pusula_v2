import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { BoardRole } from '@pusula/domain';

vi.mock('./board-members-section', () => ({
  BoardMembersSection: ({ canManage }: { boardId: string; canManage: boolean }) => (
    <div data-testid="board-members-section">
      board members section · canManage={String(canManage)}
    </div>
  ),
}));

import { BoardMembersDialog } from './board-members-dialog';

function renderDialog(role: BoardRole, open = true) {
  render(
    <BoardMembersDialog
      boardId="b1"
      workspaceId="w1"
      boardTitle="İlk Pano"
      role={role}
      open={open}
      onOpenChange={() => {}}
    />,
  );
}

/**
 * DEM-155 — board switcher satırından açılan üye yönetimi modalı. Mevcut
 * `BoardMembersSection` bileşenini sarmalar; rol/çıkar kontrolleri yalnız
 * board `admin` rolünde aktiftir.
 */
describe('<BoardMembersDialog>', () => {
  it('shows the board title and member section when open', () => {
    renderDialog('admin');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('İlk Pano')).toBeInTheDocument();
    expect(screen.getByTestId('board-members-section')).toBeInTheDocument();
  });

  it('grants management controls to board admins', () => {
    renderDialog('admin');
    expect(screen.getByText(/canManage=true/)).toBeInTheDocument();
  });

  it('keeps the section read-only for members and viewers', () => {
    renderDialog('member');
    expect(screen.getByText(/canManage=false/)).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    renderDialog('admin', false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('board-members-section')).not.toBeInTheDocument();
  });
});
