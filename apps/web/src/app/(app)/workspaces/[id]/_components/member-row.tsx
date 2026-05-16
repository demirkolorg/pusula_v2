'use client';

import { useState } from 'react';
import { assignableWorkspaceRoleSchema, type WorkspaceRole } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Avatar,
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
import { strings, workspaceRoleLabels } from '@/lib/strings';

/** Roles assignable via member management (everything except `owner`). */
const ASSIGNABLE_ROLES = assignableWorkspaceRoleSchema.options as readonly Exclude<
  WorkspaceRole,
  'owner'
>[];

export type MemberRowMember = {
  userId: string;
  name: string | null;
  email: string;
  /** Account avatar URL (`null` until the user uploads one — DEM-160). */
  image: string | null;
  role: WorkspaceRole;
};

type MemberRowProps = {
  member: MemberRowMember;
  /** The signed-in user's id — used to mark "you" and show the leave action. */
  viewerUserId: string;
  /** Whether the viewer is `admin+` (may change roles / remove others). */
  canManage: boolean;
  /**
   * Any member-list mutation is in flight (possibly on another row) — disables
   * this row's controls too so a second mutation can't race the first.
   */
  disabled?: boolean;
  /** A mutation for *this* row is in flight — shows the inline "…ediliyor…" text. */
  pending?: boolean;
  /** Inline error for this row's last mutation (CONFLICT / BAD_REQUEST / FORBIDDEN …). */
  error?: string | null;
  /** Change this member's role (only wired for non-owner, non-self rows in a manager view). */
  onRoleChange?: (role: Exclude<WorkspaceRole, 'owner'>) => void;
  /** Remove this member (manager view, non-owner, non-self). */
  onRemove?: () => void;
  /** Leave the workspace (self row, when the viewer is not the owner). */
  onLeave?: () => void;
};

/**
 * Presentational workspace-member row: identity + role, plus role/remove/leave
 * actions gated by `canManage`, ownership and whether the row is the viewer's
 * own. No tRPC dependency — the list container wires the mutations and passes
 * `pending`/`error` per row. Confirmation dialogs are inline so the row stays a
 * single testable unit.
 */
export function MemberRow({
  member,
  viewerUserId,
  canManage,
  disabled = false,
  pending = false,
  error,
  onRoleChange,
  onRemove,
  onLeave,
}: MemberRowProps) {
  const isSelf = member.userId === viewerUserId;
  const isOwner = member.role === 'owner';
  const displayName = member.name?.trim() || member.email;
  // Controls are disabled while *any* member-list mutation runs (race guard);
  // the "…ediliyor…" label only shows for the row that owns the active mutation.
  const controlsDisabled = disabled || pending;

  // Only managers may change a *non-owner, non-self* member's role.
  const showRoleSelect = canManage && !isOwner && !isSelf;
  // Managers may remove non-owner, non-self members.
  const showRemove = canManage && !isOwner && !isSelf;
  // Anyone but the owner may leave their own membership.
  const showLeave = isSelf && !isOwner;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={displayName} image={member.image} size="sm" />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{displayName}</span>
            {isSelf && <Badge variant="outline">{strings.members.youBadge}</Badge>}
          </div>
          <p className="text-muted-foreground truncate text-sm">{member.email}</p>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {isOwner ? (
          <Badge variant="secondary">{strings.members.ownerBadge}</Badge>
        ) : showRoleSelect ? (
          <Select
            value={member.role}
            disabled={controlsDisabled}
            onValueChange={(value) => onRoleChange?.(value as Exclude<WorkspaceRole, 'owner'>)}
          >
            <SelectTrigger size="sm" aria-label={strings.members.roleLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSIGNABLE_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {workspaceRoleLabels[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary">{workspaceRoleLabels[member.role]}</Badge>
        )}

        {showRemove && (
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" disabled={controlsDisabled}>
                {pending ? strings.members.removing : strings.members.remove}
              </Button>
            }
            title={strings.members.removeConfirmTitle}
            description={strings.members.removeConfirmDescription}
            confirmLabel={strings.members.removeConfirm}
            pending={controlsDisabled}
            onConfirm={() => onRemove?.()}
          />
        )}

        {showLeave && (
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" disabled={controlsDisabled}>
                {pending ? strings.members.leaving : strings.members.leave}
              </Button>
            }
            title={strings.members.leaveConfirmTitle}
            description={strings.members.leaveConfirmDescription}
            confirmLabel={strings.members.leaveConfirm}
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

/** Minimal destructive-action confirmation dialog used by the member row. */
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
      <DialogContent closeLabel={strings.common.close}>
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
