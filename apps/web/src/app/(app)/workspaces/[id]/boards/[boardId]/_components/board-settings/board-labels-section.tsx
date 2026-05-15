'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LabelColor } from '@pusula/domain';
import { Alert, AlertDescription, AlertTitle } from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { BoardLabelRow } from './board-label-row';
import { CreateBoardLabelForm } from './create-board-label-form';

type BoardLabelsSectionProps = {
  boardId: string;
  /** Whether the viewer may create/edit/delete labels (board `member+`, board active). */
  canEdit: boolean;
};

/**
 * Board label management section: loads `label.list`, renders a presentational
 * {@link BoardLabelRow} per label and — for board `member+` — a
 * {@link CreateBoardLabelForm}. Each row's update/delete mutation invalidates
 * `label.list` (+ `board.get`, so card chips refresh) on success. The active
 * mutation's target id + error live here so only that row reflects pending/error
 * state. No optimistic UI (Phase 4) — mutation → await → invalidate → refetch.
 */
export function BoardLabelsSection({ boardId, canEdit }: BoardLabelsSectionProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copy = strings.board.settings;

  const labels = useQuery(trpc.label.list.queryOptions({ boardId }));

  const [activeLabelId, setActiveLabelId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ labelId: string; message: string } | null>(null);

  const clearRowState = () => {
    setActiveLabelId(null);
    setRowError(null);
  };

  const refetchLabels = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.label.list.queryFilter({ boardId })),
      // The board screen renders label chips on cards, so refresh `board.get` too.
      queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId })),
    ]);

  const createLabel = useMutation(trpc.label.create.mutationOptions({ onSuccess: refetchLabels }));

  const updateLabel = useMutation(
    trpc.label.update.mutationOptions({
      onSuccess: async () => {
        await refetchLabels();
        clearRowState();
      },
      onError: (error, variables) => {
        setRowError({
          labelId: variables.labelId,
          message: error.message || strings.common.unknownError,
        });
      },
    }),
  );

  const deleteLabel = useMutation(
    trpc.label.delete.mutationOptions({
      onSuccess: async () => {
        await refetchLabels();
        clearRowState();
      },
      onError: (error, variables) => {
        setRowError({
          labelId: variables.labelId,
          message: error.message || strings.common.unknownError,
        });
      },
    }),
  );

  const isBusy = updateLabel.isPending || deleteLabel.isPending;

  if (labels.isPending) {
    return <AppSpinner label={copy.labelsLoading} showLabel className="justify-start" />;
  }

  if (labels.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{copy.labelsLoadErrorTitle}</AlertTitle>
        <AlertDescription>{labels.error.message || strings.common.unknownError}</AlertDescription>
      </Alert>
    );
  }

  const handleUpdate = (labelId: string, patch: { color?: LabelColor; name?: string }) => {
    setRowError(null);
    setActiveLabelId(labelId);
    updateLabel.mutate({ boardId, labelId, ...patch, clientMutationId: crypto.randomUUID() });
  };

  const handleDelete = (labelId: string) => {
    setRowError(null);
    setActiveLabelId(labelId);
    deleteLabel.mutate({ boardId, labelId, clientMutationId: crypto.randomUUID() });
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <CreateBoardLabelForm
          onSubmit={(input) => {
            createLabel.reset();
            createLabel.mutate({ boardId, ...input, clientMutationId: crypto.randomUUID() });
          }}
          pending={createLabel.isPending}
          error={
            createLabel.isError ? createLabel.error.message || strings.common.unknownError : null
          }
        />
      )}

      {labels.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">{copy.labelsEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {labels.data.map((label) => {
            const rowPending = isBusy && activeLabelId === label.id;
            return (
              <li key={label.id}>
                <BoardLabelRow
                  label={label}
                  canEdit={canEdit}
                  disabled={isBusy}
                  pending={rowPending}
                  error={rowError?.labelId === label.id ? rowError.message : null}
                  onUpdate={(patch) => handleUpdate(label.id, patch)}
                  onDelete={() => handleDelete(label.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
