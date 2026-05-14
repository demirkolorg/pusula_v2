'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import type { BoardRole } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { boardRoleLabels, strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type BoardAccessRequest = RouterOutputs['board']['accessRequests']['list'][number];
type ApprovableBoardRole = Extract<BoardRole, 'member' | 'viewer'>;

const APPROVABLE_ROLES = ['member', 'viewer'] as const satisfies readonly ApprovableBoardRole[];

type BoardAccessRequestsSectionProps = {
  boardId: string;
  canManage: boolean;
};

export function BoardAccessRequestsSection({
  boardId,
  canManage,
}: BoardAccessRequestsSectionProps) {
  const trpc = useTRPC();
  const copy = strings.board.settings;
  const requests = useQuery(
    trpc.board.accessRequests.list.queryOptions({ boardId }, { enabled: canManage }),
  );

  if (!canManage) return null;

  if (requests.isPending) {
    return <AppSpinner label={copy.accessRequestsLoading} showLabel className="justify-start" />;
  }

  if (requests.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{copy.accessRequestsLoadErrorTitle}</AlertTitle>
        <AlertDescription>{requests.error.message || strings.common.unknownError}</AlertDescription>
      </Alert>
    );
  }

  if (requests.data.length === 0) {
    return <p className="text-muted-foreground text-sm">{copy.noAccessRequests}</p>;
  }

  return (
    <ul className="space-y-3">
      {requests.data.map((request) => (
        <li key={request.id}>
          <BoardAccessRequestRow boardId={boardId} request={request} />
        </li>
      ))}
    </ul>
  );
}

function BoardAccessRequestRow({
  boardId,
  request,
}: {
  boardId: string;
  request: BoardAccessRequest;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copy = strings.board.settings;
  const [role, setRole] = useState<ApprovableBoardRole>('member');

  const invalidateAfterApprove = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.board.accessRequests.list.queryFilter({ boardId })),
      queryClient.invalidateQueries(trpc.board.members.list.queryFilter({ boardId })),
      queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId })),
    ]);

  const approve = useMutation(
    trpc.board.accessRequests.approve.mutationOptions({
      onSuccess: async () => {
        await invalidateAfterApprove();
      },
    }),
  );

  const reject = useMutation(
    trpc.board.accessRequests.reject.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.board.accessRequests.list.queryFilter({ boardId }),
        );
      },
    }),
  );

  const userName = request.requesterName ?? request.requesterEmail;
  const busy = approve.isPending || reject.isPending;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={userName} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">{userName}</p>
            <p className="text-muted-foreground truncate text-sm">{request.requesterEmail}</p>
          </div>
        </div>
        <Badge variant="secondary">{boardRoleLabels[role]}</Badge>
      </div>

      {request.message && (
        <p className="text-muted-foreground text-sm">
          <span className="font-medium text-foreground">{copy.accessRequestMessageLabel}: </span>
          {request.message}
        </p>
      )}

      {(approve.isError || reject.isError) && (
        <Alert variant="destructive">
          <AlertDescription>
            {approve.error?.message || reject.error?.message || strings.common.unknownError}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Select
          value={role}
          onValueChange={(value) => setRole(value as ApprovableBoardRole)}
          disabled={busy}
        >
          <SelectTrigger className="sm:w-36" aria-label={copy.accessRequestRoleLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APPROVABLE_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {boardRoleLabels[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            reject.mutate({
              boardId,
              requestId: request.id,
              clientMutationId: crypto.randomUUID(),
            })
          }
        >
          {reject.isPending ? copy.accessRequestRejecting : copy.accessRequestReject}
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            approve.mutate({
              boardId,
              requestId: request.id,
              role,
              clientMutationId: crypto.randomUUID(),
            })
          }
        >
          {approve.isPending ? copy.accessRequestApproving : copy.accessRequestApprove}
        </Button>
      </div>
    </div>
  );
}
