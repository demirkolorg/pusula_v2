'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { WorkspaceSettingsForm, type WorkspaceSettingsValues } from './workspace-settings-form';

type WorkspaceSettingsProps = {
  workspaceId: string;
  name: string;
  slug: string;
};

/**
 * Container for the workspace settings form: wires `workspace.update` and, on
 * success, invalidates `workspace.get`/`workspace.list` so the new name/slug
 * propagate. The form is presentational and does the client-side validation.
 */
export function WorkspaceSettings({ workspaceId, name, slug }: WorkspaceSettingsProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);

  const updateWorkspace = useMutation(
    trpc.workspace.update.mutationOptions({
      onSuccess: async (result) => {
        setNotice(result.changed ? strings.workspace.manage.saved : strings.workspace.manage.noChange);
        await Promise.all([
          queryClient.invalidateQueries(trpc.workspace.get.queryFilter({ workspaceId })),
          queryClient.invalidateQueries(trpc.workspace.list.queryFilter()),
        ]);
      },
    }),
  );

  const handleSubmit = (values: WorkspaceSettingsValues) => {
    setNotice(null);
    updateWorkspace.reset();
    // Only send fields that actually changed; the server rejects the no-op case.
    const patch: { name?: string; slug?: string } = {};
    if (values.name !== name) patch.name = values.name;
    if (values.slug !== slug) patch.slug = values.slug;
    if (patch.name === undefined && patch.slug === undefined) {
      setNotice(strings.workspace.manage.noChange);
      return;
    }
    updateWorkspace.mutate({ workspaceId, ...patch, clientMutationId: crypto.randomUUID() });
  };

  return (
    <WorkspaceSettingsForm
      name={name}
      slug={slug}
      onSubmit={handleSubmit}
      pending={updateWorkspace.isPending}
      error={updateWorkspace.isError ? updateWorkspace.error.message || strings.common.unknownError : null}
      notice={notice}
    />
  );
}
