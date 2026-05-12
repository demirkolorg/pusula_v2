'use client';

import { useState } from 'react';
import { BOARD_ROLES, type BoardRole } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pusula/ui';
import { boardRoleLabels, strings } from '@/lib/strings';

/** Board roles assignable via `board.members.updateRole` (the full board set — board roles have no `owner`). */
const ASSIGNABLE_BOARD_ROLES = BOARD_ROLES as readonly BoardRole[];

export type BoardMemberRowMember = {
  userId: string;
  name: string | null;
  role: BoardRole;
  /** `true` for a workspace owner/admin who inherits board access without an explicit row. */
  inherited: boolean;
};

type BoardMemberRowProps = {
  member: BoardMemberRowMember;
  /** The signed-in user's id — marks "you" and surfaces the leave action. */
  viewerUserId: string;
  /** Whether the viewer is board `admin` (may change roles / remove explicit members). */
  canManage: boolean;
  /**
   * `true` when this is the *only* explicit board `admin` — the row's
   * demote/remove controls are then locked (the server rejects it too).
   */
  isLastAdmin?: boolean;
  /** Any board-member mutation is in flight (possibly on another row) — race guard. */
  disabled?: boolean;
  /** A mutation for *this* row is in flight — shows the inline "…ediliyor…" text. */
  pending?: boolean;
  /** Inline error for this row's last mutation (BAD_REQUEST / FORBIDDEN …). */
  error?: string | null;
  /** Change this member's board role (wired for explicit, non-self rows in a manager view). */
  onRoleChange?: (role: BoardRole) => void;
  /** Remove this member (manager view, explicit, non-self). */
  onRemove?: () => void;
  /** Leave the board (self row). */
  onLeave?: () => void;
};

/**
 * Presentational board-member row: identity + role, plus role/remove/leave
 * actions gated by `canManage`, whether the membership is inherited and whether
 * the row is the viewer's own. Mirrors the workspace `MemberRow`. No tRPC
 * dependency — the section container wires the mutations and passes
 * `pending`/`error` per row. Confirmation dialogs are inline so the row stays a
 * single testable unit.
 */
export function BoardMemberRow({
  member,
  viewerUserId,
  canManage,
  isLastAdmin = false,
  disabled = false,
  pending = false,
  error,
  onRoleChange,
  onRemove,
  onLeave,
}: BoardMemberRowProps) {
  const copy = strings.board.settings;
  const isSelf = member.userId === viewerUserId;
  const displayName = member.name?.trim() || member.userId;
  const controlsDisabled = disabled || pending;
  // Demoting/removing the sole explicit admin is rejected server-side; lock it here too.
  const lockedAsLastAdmin = isLastAdmin && member.role === 'admin';

  // Managers may change an *explicit*, non-self member's role (but not the last admin's).
  const showRoleSelect = canManage && !member.inherited && !isSelf && !lockedAsLastAdmin;
  // Managers may remove an *explicit*, non-self member (but not the last admin).
  const showRemove = canManage && !member.inherited && !isSelf && !lockedAsLastAdmin;
  // The viewer may leave their own *explicit* membership (unless they're the last admin).
  const showLeave = isSelf && !member.inherited && !lockedAsLastAdmin;

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{displayName}</span>
          {isSelf && <Badge variant="outline">{copy.youBadge}</Badge>}
        </div>
        {member.inherited && (
          <p className="text-muted-foreground text-xs">{copy.inheritedNote}</p>
        )}
        {lockedAsLastAdmin && !member.inherited && (
          <p className="text-muted-foreground text-xs">{copy.lastAdminNote}</p>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {showRoleSelect ? (
          <Select
            value={member.role}
            disabled={controlsDisabled}
            onValueChange={(value) => onRoleChange?.(value as BoardRole)}
          >
            <SelectTrigger size="sm" aria-label={copy.roleLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSIGNABLE_BOARD_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {boardRoleLabels[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary">{boardRoleLabels[member.role]}</Badge>
        )}

        {showRemove && (
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" disabled={controlsDisabled}>
                {pending ? copy.removing : copy.remove}
              </Button>
            }
            title={copy.removeConfirmTitle}
            description={copy.removeConfirmDescription}
            confirmLabel={copy.removeConfirm}
            pending={controlsDisabled}
            onConfirm={() => onRemove?.()}
          />
        )}

        {showLeave && (
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" disabled={controlsDisabled}>
                {pending ? copy.leaving : copy.leave}
              </Button>
            }
            title={copy.leaveConfirmTitle}
            description={copy.leaveConfirmDescription}
            confirmLabel={copy.leaveConfirm}
            pending={controlsDisabled}
            onConfirm={() => onLeave?.()}
          />
        )}
      </div>
    </div>
  );
}

type ConfirmDialogProps = {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
};

/** Minimal destructive-action confirmation dialog used by the board-member row. */
function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              {strings.common.cancel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
