import { describe, expect, it } from 'vitest';
import {
  boardRoleLabel,
  canManageBoard,
  canManageBoardMembers,
  canManageWorkspaceMembers,
  workspaceRoleLabel,
} from '../lib/member-roles';
import { strings } from '../lib/strings';

/**
 * Faz 7D — üye rolü → Türkçe etiket eşlemesi + yetki yardımcı saf birim
 * testleri. Etiketler `strings.members`'ten doğrulanır (hardcode yok).
 */
describe('workspaceRoleLabel', () => {
  it('her workspace rolünü ilgili Türkçe etikete eşler', () => {
    expect(workspaceRoleLabel('owner')).toBe(strings.members.roleOwner);
    expect(workspaceRoleLabel('admin')).toBe(strings.members.roleAdmin);
    expect(workspaceRoleLabel('member')).toBe(strings.members.roleMember);
    expect(workspaceRoleLabel('guest')).toBe(strings.members.roleGuest);
  });
});

describe('boardRoleLabel', () => {
  it('her board rolünü ilgili Türkçe etikete eşler', () => {
    expect(boardRoleLabel('admin')).toBe(strings.members.boardRoleAdmin);
    expect(boardRoleLabel('member')).toBe(strings.members.boardRoleMember);
    expect(boardRoleLabel('viewer')).toBe(strings.members.boardRoleViewer);
  });
});

describe('canManageWorkspaceMembers', () => {
  it('owner ve admin için true döner', () => {
    expect(canManageWorkspaceMembers('owner')).toBe(true);
    expect(canManageWorkspaceMembers('admin')).toBe(true);
  });

  it('member, guest ve tanımsız rol için false döner', () => {
    expect(canManageWorkspaceMembers('member')).toBe(false);
    expect(canManageWorkspaceMembers('guest')).toBe(false);
    expect(canManageWorkspaceMembers(null)).toBe(false);
    expect(canManageWorkspaceMembers(undefined)).toBe(false);
  });
});

describe('canManageBoardMembers', () => {
  it('yalnız board admin için true döner', () => {
    expect(canManageBoardMembers('admin')).toBe(true);
  });

  it('member, viewer ve tanımsız rol için false döner', () => {
    expect(canManageBoardMembers('member')).toBe(false);
    expect(canManageBoardMembers('viewer')).toBe(false);
    expect(canManageBoardMembers(null)).toBe(false);
    expect(canManageBoardMembers(undefined)).toBe(false);
  });
});

describe('canManageBoard', () => {
  it('yalnız board admin için true döner (DEM-211 — board ⋮ menüsü)', () => {
    expect(canManageBoard('admin')).toBe(true);
  });

  it('member, viewer ve tanımsız rol için false döner', () => {
    expect(canManageBoard('member')).toBe(false);
    expect(canManageBoard('viewer')).toBe(false);
    expect(canManageBoard(null)).toBe(false);
    expect(canManageBoard(undefined)).toBe(false);
  });
});
