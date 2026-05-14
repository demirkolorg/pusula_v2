'use client';

import { useState } from 'react';
import { KeyRoundIcon, MailIcon, TagsIcon, UsersIcon } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  SectionHeader,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { BoardAccessRequestsSection } from './board-access-requests-section';
import { BoardLabelsSection } from './board-labels-section';
import { BoardMembersSection } from './board-members-section';
import { BoardSentInvitations } from './board-sent-invitations';

type BoardSettingsDialogProps = {
  boardId: string;
  /** The workspace this board lives in (for the "leave board" navigation target). */
  workspaceId: string;
  /**
   * Whether the viewer is board `admin`. The dialog is only mounted for board
   * `admin`s by the page (the workspace-management pattern: actions are
   * role-gated in the UI, the real gate is server-side); inside, `canManage`
   * gates the member/invite/label *actions* (board `member+` can edit labels —
   * but since this dialog is admin-only, `canManage` is `true` throughout).
   */
  canManage: boolean;
  /** Whether the board is active (an archived board is read-only — disables label CRUD). */
  boardActive: boolean;
  /**
   * Optionally control the dialog open state from the outside (e.g. the board
   * top-bar "Invite" button or "⋮" menu). When omitted, the component owns its
   * own state and shows a built-in trigger button.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hide the built-in trigger button (for fully external triggers). */
  hideTrigger?: boolean;
};

/**
 * "Board settings" trigger + dialog: members (role / remove / add), sent
 * invitations (revoke), and labels (create / edit / delete). Mirrors the
 * workspace management screen (§8.1.2) as a modal. Only mounted for board
 * `admin`s; the server still enforces the `admin` check on every mutation. No
 * optimistic UI this phase — each section's mutations `await` then invalidate
 * the affected queries.
 */
export function BoardSettingsDialog({
  boardId,
  workspaceId,
  canManage,
  boardActive,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: BoardSettingsDialogProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const copy = strings.board.settings;
  // Board `member+` can edit labels; this dialog is admin-only so `canManage`
  // already implies it — but an archived board is read-only either way.
  const canEditLabels = canManage && boardActive;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            {copy.open}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        closeLabel={strings.common.close}
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{copy.dialogTitle}</DialogTitle>
          <DialogDescription>{copy.dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-8">
          <section className="space-y-2">
            <SectionHeader icon={<UsersIcon className="size-3.5" />} className="mb-0">
              {copy.membersTitle}
            </SectionHeader>
            <p className="text-muted-foreground text-sm">{copy.membersDescription}</p>
            <BoardMembersSection
              boardId={boardId}
              workspaceId={workspaceId}
              canManage={canManage}
            />
          </section>

          <section className="space-y-2">
            <SectionHeader icon={<MailIcon className="size-3.5" />} className="mb-0">
              {copy.sentInvitationsTitle}
            </SectionHeader>
            <p className="text-muted-foreground text-sm">{copy.sentInvitationsDescription}</p>
            <BoardSentInvitations boardId={boardId} canManage={canManage} />
          </section>

          <section className="space-y-2">
            <SectionHeader icon={<KeyRoundIcon className="size-3.5" />} className="mb-0">
              {copy.accessRequestsTitle}
            </SectionHeader>
            <p className="text-muted-foreground text-sm">{copy.accessRequestsDescription}</p>
            <BoardAccessRequestsSection boardId={boardId} canManage={canManage} />
          </section>

          <section className="space-y-2">
            <SectionHeader icon={<TagsIcon className="size-3.5" />} className="mb-0">
              {copy.labelsTitle}
            </SectionHeader>
            <p className="text-muted-foreground text-sm">{copy.labelsDescription}</p>
            <BoardLabelsSection boardId={boardId} canEdit={canEditLabels} />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
