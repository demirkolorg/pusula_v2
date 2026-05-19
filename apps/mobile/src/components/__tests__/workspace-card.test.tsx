import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from './render-helper';
import { WorkspaceCard } from '../workspace-card';
import { workspaceRoleLabel } from '../../lib/member-roles';

/** DEM-214 — `WorkspaceCard` (sade ikon tabanlı çalışma alanı kartı) testleri. */

describe('WorkspaceCard', () => {
  it('ad ve pano/üye sayaçlarını gösterir', () => {
    render(
      <WorkspaceCard
        name="Çalışma Alanım"
        icon="briefcase"
        role="owner"
        boardCount={1}
        memberCount={3}
        onPress={vi.fn()}
      />,
    );
    expect(screen.getByText('Çalışma Alanım')).toBeTruthy();
    expect(screen.getByText('1 pano')).toBeTruthy();
    expect(screen.getByText('3 üye')).toBeTruthy();
  });

  it('sahip rolünde sahip rozetini gösterir', () => {
    render(<WorkspaceCard name="W" role="owner" boardCount={0} memberCount={1} onPress={vi.fn()} />);
    expect(screen.getByText(workspaceRoleLabel('owner'))).toBeTruthy();
  });

  it('misafir rolünde misafir rozetini gösterir', () => {
    render(<WorkspaceCard name="W" role="guest" boardCount={0} memberCount={1} onPress={vi.fn()} />);
    expect(screen.getByText(workspaceRoleLabel('guest'))).toBeTruthy();
  });

  it('karta dokununca onPress geri çağrılır', () => {
    const onPress = vi.fn();
    render(
      <WorkspaceCard name="W" role="member" boardCount={1} memberCount={3} onPress={onPress} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
