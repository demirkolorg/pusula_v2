import { describe, expect, it } from 'vitest';
import {
  canAccessWorkspace,
  canEditBoardContent,
  canManageBoard,
  canManageWorkspace,
  canViewBoard,
  effectiveBoardRole,
  type AccessContext,
} from './permissions';

const ctx = (
  workspaceRole: AccessContext['workspaceRole'],
  boardRole: AccessContext['boardRole'] = null,
): AccessContext => ({ workspaceRole, boardRole });

describe('effectiveBoardRole', () => {
  it('an explicit board membership always wins', () => {
    expect(effectiveBoardRole(ctx('member', 'admin'))).toBe('admin');
    expect(effectiveBoardRole(ctx('owner', 'viewer'))).toBe('viewer');
    expect(effectiveBoardRole(ctx('guest', 'member'))).toBe('member');
    expect(effectiveBoardRole(ctx(null, 'viewer'))).toBe('viewer');
  });

  it('workspace owner/admin inherit board admin', () => {
    expect(effectiveBoardRole(ctx('owner'))).toBe('admin');
    expect(effectiveBoardRole(ctx('admin'))).toBe('admin');
  });

  it('workspace member inherits board member', () => {
    expect(effectiveBoardRole(ctx('member'))).toBe('member');
  });

  it('guest and non-members inherit nothing', () => {
    expect(effectiveBoardRole(ctx('guest'))).toBeNull();
    expect(effectiveBoardRole(ctx(null))).toBeNull();
  });
});

describe('canAccessWorkspace', () => {
  it('any workspace role grants access; null does not', () => {
    expect(canAccessWorkspace(ctx('owner'))).toBe(true);
    expect(canAccessWorkspace(ctx('admin'))).toBe(true);
    expect(canAccessWorkspace(ctx('member'))).toBe(true);
    expect(canAccessWorkspace(ctx('guest'))).toBe(true);
    expect(canAccessWorkspace(ctx(null))).toBe(false);
  });
});

describe('canManageWorkspace', () => {
  it('only owner and admin can manage', () => {
    expect(canManageWorkspace(ctx('owner'))).toBe(true);
    expect(canManageWorkspace(ctx('admin'))).toBe(true);
    expect(canManageWorkspace(ctx('member'))).toBe(false);
    expect(canManageWorkspace(ctx('guest'))).toBe(false);
    expect(canManageWorkspace(ctx(null))).toBe(false);
  });

  it('a board role does not grant workspace management', () => {
    expect(canManageWorkspace(ctx('member', 'admin'))).toBe(false);
  });
});

describe('board permission helpers', () => {
  it('canViewBoard mirrors effectiveBoardRole presence', () => {
    expect(canViewBoard(ctx('member'))).toBe(true);
    expect(canViewBoard(ctx('guest', 'viewer'))).toBe(true);
    expect(canViewBoard(ctx('guest'))).toBe(false);
    expect(canViewBoard(ctx(null))).toBe(false);
  });

  it('canEditBoardContent needs board member+', () => {
    expect(canEditBoardContent(ctx('member'))).toBe(true);
    expect(canEditBoardContent(ctx('owner'))).toBe(true);
    expect(canEditBoardContent(ctx('guest', 'viewer'))).toBe(false);
    expect(canEditBoardContent(ctx('guest', 'member'))).toBe(true);
    expect(canEditBoardContent(ctx('guest'))).toBe(false);
  });

  it('canManageBoard needs board admin', () => {
    expect(canManageBoard(ctx('owner'))).toBe(true);
    expect(canManageBoard(ctx('admin'))).toBe(true);
    expect(canManageBoard(ctx('member'))).toBe(false);
    expect(canManageBoard(ctx('member', 'admin'))).toBe(true);
    expect(canManageBoard(ctx('guest', 'admin'))).toBe(true);
    expect(canManageBoard(ctx('guest', 'member'))).toBe(false);
  });
});
