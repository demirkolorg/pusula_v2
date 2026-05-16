'use client';

import { UsersIcon } from 'lucide-react';
import type { BoardRole } from '@pusula/domain';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { BoardMembersSection } from './board-members-section';

type BoardMembersDialogProps = {
  boardId: string;
  /** The workspace this board lives in — used by the section's "leave" navigation. */
  workspaceId: string;
  boardTitle: string;
  /** The viewer's effective role on this board — gates role/remove controls. */
  role: BoardRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Modal wrapper around {@link BoardMembersSection} so a board's members can be
 * managed straight from the board switcher. Adding/inviting members stays on the
 * board settings screen (a separate concern); this dialog is the member list +
 * role/remove controls. Authorization stays server-side; `canManage` only hides
 * controls the viewer's role can't use. The member list query is lazy — it only
 * fires once the dialog content mounts.
 */
export function BoardMembersDialog({
  boardId,
  workspaceId,
  boardTitle,
  role,
  open,
  onOpenChange,
}: BoardMembersDialogProps) {
  const copy = strings.board.settings;
  const canManage = role === 'admin';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={strings.common.close} className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersIcon className="size-4" aria-hidden />
            {boardTitle}
          </DialogTitle>
          <DialogDescription>{copy.membersDescription}</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 max-h-[60vh] overflow-y-auto px-1">
          <BoardMembersSection boardId={boardId} workspaceId={workspaceId} canManage={canManage} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
