'use client';

import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
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
};

/**
 * "Board settings" trigger + dialog: members (role / remove / add), sent
 * invitations (revoke), and labels (create / edit / delete). Mirrors the
 * workspace management screen (§8.1.2) as a modal. Only mounted for board
 * `admin`s; the server still enforces the `admin` check on every mutation. No
 * optimistic UI this phase — each section's mutations `await` then invalidate
 * the affected queries.
 */
export function BoardSettingsDialog({ boardId, workspaceId, canManage, boardActive }: BoardSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const copy = strings.board.settings;
  // Board `member+` can edit labels; this dialog is admin-only so `canManage`
  // already implies it — but an archived board is read-only either way.
  const canEditLabels = canManage && boardActive;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {copy.open}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.dialogTitle}</DialogTitle>
          <DialogDescription>{copy.dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-8">
          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">{copy.membersTitle}</h3>
              <p className="text-muted-foreground text-sm">{copy.membersDescription}</p>
            </div>
            <BoardMembersSection boardId={boardId} workspaceId={workspaceId} canManage={canManage} />
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">{copy.sentInvitationsTitle}</h3>
              <p className="text-muted-foreground text-sm">{copy.sentInvitationsDescription}</p>
            </div>
            <BoardSentInvitations boardId={boardId} canManage={canManage} />
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">{copy.labelsTitle}</h3>
              <p className="text-muted-foreground text-sm">{copy.labelsDescription}</p>
            </div>
            <BoardLabelsSection boardId={boardId} canEdit={canEditLabels} />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
