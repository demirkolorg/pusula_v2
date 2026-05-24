/**
 * Faz 13G (DEM-263) — WorkspaceReportsCard testleri.
 *
 * Permission gating: guest/null gizli; member+ görünür. Link `/workspaces/
 * <id>/reports`'a (13H route'u) gider.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspaceReportsCard } from '../entity-tab/workspace-reports-card';

describe('WorkspaceReportsCard', () => {
  it('workspaceRole=guest → render edilmez (§9.5 guest gizli)', () => {
    const { container } = render(
      <WorkspaceReportsCard workspaceId="ws-1" workspaceRole="guest" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('workspaceRole=null (üye değil) → render edilmez', () => {
    const { container } = render(
      <WorkspaceReportsCard workspaceId="ws-1" workspaceRole={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('workspaceRole=member → görünür ve link doğru route\'a', () => {
    render(<WorkspaceReportsCard workspaceId="ws-1" workspaceRole="member" />);
    expect(screen.getByTestId('workspace-reports-card')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Raporları aç/ });
    expect(link).toHaveAttribute('href', '/workspaces/ws-1/reports');
  });

  it('workspaceRole=owner → görünür', () => {
    render(<WorkspaceReportsCard workspaceId="ws-2" workspaceRole="owner" />);
    expect(screen.getByTestId('workspace-reports-card')).toBeInTheDocument();
  });
});
