/**
 * Faz 7D — üye rolü → Türkçe rozet etiketi eşlemesi (saf fonksiyonlar).
 *
 * Domain rol sabitleri (`@pusula/domain` `WORKSPACE_ROLES` / `BOARD_ROLES`)
 * teknik anahtarlardır; kullanıcıya gösterilen etiketler `strings.members`'ten
 * gelir. Bu modül ikisini birbirine bağlar — UI bileşeni ham rol stringi
 * basmaz, hep buradan çevirir.
 */
import type { BoardRole, WorkspaceRole } from '@pusula/domain';
import { strings } from './strings';

/** Workspace rolü → Türkçe rozet etiketi. */
export function workspaceRoleLabel(role: WorkspaceRole): string {
  switch (role) {
    case 'owner':
      return strings.members.roleOwner;
    case 'admin':
      return strings.members.roleAdmin;
    case 'member':
      return strings.members.roleMember;
    case 'guest':
      return strings.members.roleGuest;
  }
}

/** Board rolü → Türkçe rozet etiketi. */
export function boardRoleLabel(role: BoardRole): string {
  switch (role) {
    case 'admin':
      return strings.members.boardRoleAdmin;
    case 'member':
      return strings.members.boardRoleMember;
    case 'viewer':
      return strings.members.boardRoleViewer;
  }
}

/** `admin+` workspace rolü mü? (üye davet etme görünürlüğü için.) */
export function canManageWorkspaceMembers(role: WorkspaceRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/** `admin` board rolü mü? (board'a üye ekleme görünürlüğü için.) */
export function canManageBoardMembers(role: BoardRole | null | undefined): boolean {
  return role === 'admin';
}
