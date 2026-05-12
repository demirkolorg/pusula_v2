'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pusula/ui';
import { workspaceRoleAtLeast } from '@pusula/domain';
import { strings, workspaceRoleLabels } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { InviteMemberDialog } from '../../_components/invite-member-dialog';
import { ArchiveWorkspaceDialog } from './_components/archive-workspace-dialog';
import { MemberList } from './_components/member-list';
import { SentInvitations } from './_components/sent-invitations';
import { WorkspaceSettings } from './_components/workspace-settings';

/**
 * Workspace management screen: shell info, settings (rename/slug), danger zone
 * (archive), member list (role / remove / leave) and sent invitations. All
 * authorization is enforced server-side; this only hides actions the current
 * role can't perform. Phase 2 nests the board list under this route.
 */
export default function WorkspaceManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = use(params);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const workspace = useQuery(trpc.workspace.get.queryOptions({ workspaceId }));

  const backLink = (
    <Link
      href="/"
      className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
    >
      ← {strings.workspace.manage.backToList}
    </Link>
  );

  if (workspace.isPending) {
    return (
      <div className="space-y-6">
        {backLink}
        <p className="text-muted-foreground text-sm">{strings.workspace.manage.loading}</p>
      </div>
    );
  }

  if (workspace.isError) {
    return (
      <div className="space-y-6">
        {backLink}
        <Alert variant="destructive">
          <AlertTitle>{strings.workspace.manage.loadErrorTitle}</AlertTitle>
          <AlertDescription>
            {workspace.error.message || strings.common.unknownError}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const ws = workspace.data;
  const isOwner = ws.role === 'owner';
  const canManage = workspaceRoleAtLeast(ws.role, 'admin');

  return (
    <div className="space-y-6">
      {backLink}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{ws.name}</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span>{ws.slug}</span>
            <Badge variant="secondary">
              {strings.workspace.roleBadgePrefix} {workspaceRoleLabels[ws.role]}
            </Badge>
            <span>
              {ws.memberCount} {strings.workspace.manage.memberCount}
            </span>
          </div>
        </div>
      </div>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>{strings.workspace.manage.settingsTitle}</CardTitle>
            <CardDescription>{strings.workspace.manage.settingsDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <WorkspaceSettings workspaceId={workspaceId} name={ws.name} slug={ws.slug} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>{strings.members.sectionTitle}</CardTitle>
            <CardDescription>{strings.members.sectionDescription}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <MemberList workspaceId={workspaceId} canManage={canManage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>{strings.invitations.sentTitle}</CardTitle>
            <CardDescription>{strings.invitations.sentDescription}</CardDescription>
          </div>
          {canManage && (
            <InviteMemberDialog
              workspaceId={workspaceId}
              workspaceName={ws.name}
              onInvited={() =>
                queryClient.invalidateQueries(
                  trpc.workspace.invitations.list.queryFilter({ workspaceId }),
                )
              }
            />
          )}
        </CardHeader>
        <CardContent>
          <SentInvitations workspaceId={workspaceId} canManage={canManage} />
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">
              {strings.workspace.manage.dangerTitle}
            </CardTitle>
            <CardDescription>{strings.workspace.manage.dangerDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <ArchiveWorkspaceDialog
              workspaceId={workspaceId}
              onArchived={async () => {
                await queryClient.invalidateQueries(trpc.workspace.list.queryFilter());
                router.replace('/');
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
