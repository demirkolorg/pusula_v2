'use client';

import { useState } from 'react';
import { LockKeyholeIcon, SendIcon } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import {
  Alert,
  AlertDescription,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type BoardAccessContext = RouterOutputs['board']['accessRequests']['context'];

type BoardAccessRequestScreenProps = {
  boardId: string;
  context: BoardAccessContext;
};

/**
 * Trello-style private board landing for authenticated users who can resolve the
 * shared board link but do not have board access yet. It deliberately avoids an
 * account-switch action; the only primary action is a board-scoped access
 * request for the currently signed-in account.
 */
export function BoardAccessRequestScreen({ boardId, context }: BoardAccessRequestScreenProps) {
  const trpc = useTRPC();
  const copy = strings.board.detail.accessRequest;
  const [submitted, setSubmitted] = useState(context.request?.status === 'pending');

  const requestAccess = useMutation(
    trpc.board.accessRequests.request.mutationOptions({
      onSuccess: () => setSubmitted(true),
    }),
  );

  const userName = context.currentUser.name ?? context.currentUser.email;
  const pending = submitted || requestAccess.isSuccess || context.request?.status === 'pending';

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center px-4 py-8 sm:py-14">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <span
            className="mb-2 inline-flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary"
            aria-hidden
          >
            <LockKeyholeIcon className="size-7" />
          </span>
          <CardTitle>
            <h1 className="text-xl">{copy.title}</h1>
          </CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-muted-foreground text-xs font-medium">{copy.targetLabel}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-medium">{context.board.title}</span>
              <Badge variant="secondary">{context.workspace.name}</Badge>
            </div>
          </div>

          <div className="rounded-md border p-3">
            <p className="text-muted-foreground text-xs font-medium">{copy.signedInAs}</p>
            <div className="mt-3 flex min-w-0 items-center gap-3">
              <Avatar name={userName} image={context.currentUser.image} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{userName}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {context.currentUser.email}
                </p>
              </div>
            </div>
          </div>

          <p className="text-muted-foreground text-xs">{copy.disclaimer}</p>

          {requestAccess.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {requestAccess.error.message || strings.common.unknownError}
              </AlertDescription>
            </Alert>
          )}

          <Button
            type="button"
            className="w-full"
            disabled={pending || requestAccess.isPending}
            onClick={() =>
              requestAccess.mutate({
                boardId,
                clientMutationId: crypto.randomUUID(),
              })
            }
          >
            <SendIcon className="size-4" />
            {pending
              ? copy.pendingButton
              : requestAccess.isPending
                ? copy.submittingButton
                : copy.submitButton}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
