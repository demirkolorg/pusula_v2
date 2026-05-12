import { describe, expect, it } from 'vitest';
import { boardRoleAtLeast, workspaceRoleAtLeast } from './roles';

describe('workspaceRoleAtLeast', () => {
  it('treats owner as the most privileged', () => {
    expect(workspaceRoleAtLeast('owner', 'owner')).toBe(true);
    expect(workspaceRoleAtLeast('owner', 'admin')).toBe(true);
    expect(workspaceRoleAtLeast('owner', 'member')).toBe(true);
    expect(workspaceRoleAtLeast('owner', 'guest')).toBe(true);
  });

  it('admin meets admin/member/guest but not owner', () => {
    expect(workspaceRoleAtLeast('admin', 'owner')).toBe(false);
    expect(workspaceRoleAtLeast('admin', 'admin')).toBe(true);
    expect(workspaceRoleAtLeast('admin', 'member')).toBe(true);
    expect(workspaceRoleAtLeast('admin', 'guest')).toBe(true);
  });

  it('member meets member/guest only', () => {
    expect(workspaceRoleAtLeast('member', 'admin')).toBe(false);
    expect(workspaceRoleAtLeast('member', 'member')).toBe(true);
    expect(workspaceRoleAtLeast('member', 'guest')).toBe(true);
  });

  it('guest meets guest only', () => {
    expect(workspaceRoleAtLeast('guest', 'member')).toBe(false);
    expect(workspaceRoleAtLeast('guest', 'guest')).toBe(true);
  });
});

describe('boardRoleAtLeast', () => {
  it('admin >= member >= viewer', () => {
    expect(boardRoleAtLeast('admin', 'admin')).toBe(true);
    expect(boardRoleAtLeast('admin', 'member')).toBe(true);
    expect(boardRoleAtLeast('admin', 'viewer')).toBe(true);
    expect(boardRoleAtLeast('member', 'admin')).toBe(false);
    expect(boardRoleAtLeast('member', 'member')).toBe(true);
    expect(boardRoleAtLeast('member', 'viewer')).toBe(true);
    expect(boardRoleAtLeast('viewer', 'member')).toBe(false);
    expect(boardRoleAtLeast('viewer', 'viewer')).toBe(true);
  });
});
