'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { EntityIcon } from '@pusula/domain';
import { Alert, AlertDescription } from '@pusula/ui';
import { EntityIconPicker } from '@/components/entity-icon';
import {
  applyBoardPatch,
  getMutationErrorMessage,
  useOptimisticBoardMutation,
} from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type BoardIconPickerProps = {
  boardId: string;
  workspaceId: string;
  icon: EntityIcon;
  canManage: boolean;
  boardActive: boolean;
};

export function BoardIconPicker({
  boardId,
  workspaceId,
  icon,
  canManage,
  boardActive,
}: BoardIconPickerProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const updateIcon = useOptimisticBoardMutation({
    mutationOptions: trpc.board.update.mutationOptions,
    boardId,
    apply: (data, vars) =>
      vars.icon === undefined ? data : applyBoardPatch(data, { icon: vars.icon }),
    onMutationSuccess: async () => {
      await queryClient.invalidateQueries(trpc.board.list.queryFilter({ workspaceId }));
    },
  });
  const disabled = !canManage || !boardActive || updateIcon.isPending;
  const error = getMutationErrorMessage(updateIcon);

  const selectIcon = (next: EntityIcon) => {
    if (disabled || next === icon) return;
    updateIcon.reset();
    updateIcon.mutate({ boardId, icon: next });
  };

  return (
    <div className="space-y-3">
      <EntityIconPicker
        value={icon}
        onValueChange={selectIcon}
        labels={strings.entityIcons}
        disabled={disabled}
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
