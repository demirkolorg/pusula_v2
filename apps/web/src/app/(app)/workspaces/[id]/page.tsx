'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArchiveIcon,
  ArrowLeftIcon,
  LayoutDashboardIcon,
  MailIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react';
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
import {
  DEFAULT_WORKSPACE_ICON,
  ENTITY_ICONS,
  workspaceRoleAtLeast,
  type EntityIcon,
} from '@pusula/domain';
import { AppSpinner } from '@/components/app-spinner';
import { EntityIconBadge } from '@/components/entity-icon';
import { InfoTooltipButton } from '@/components/info-tooltip-button';
import { strings, workspaceRoleLabels } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { InviteMemberDialog } from '../../_components/invite-member-dialog';
import { ArchiveWorkspaceDialog } from './_components/archive-workspace-dialog';
import { BoardListSection } from './_components/board-list-section';
import { DeleteWorkspaceDialog } from './_components/delete-workspace-dialog';
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
      className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 rounded-md text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <ArrowLeftIcon className="size-3.5" />
      {strings.workspace.manage.backToList}
    </Link>
  );

  if (workspace.isPending) {
    return (
      <div className="space-y-6">
        {backLink}
        <AppSpinner label={strings.workspace.manage.loading} showLabel className="justify-start" />
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
  // Workspace `guest` cannot create boards; the server enforces this on `board.create`.
  const canCreateBoard = workspaceRoleAtLeast(ws.role, 'member');
  const currentIcon = ENTITY_ICONS.includes(ws.icon as EntityIcon)
    ? (ws.icon as EntityIcon)
    : DEFAULT_WORKSPACE_ICON;

  return (
    <div className="space-y-6">
      {backLink}

      <section className="rounded-md border bg-card px-4 py-4 shadow-card sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <EntityIconBadge icon={currentIcon} className="size-10" glyphClassName="size-5" />
          <div className="min-w-0 space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">
              {strings.workspace.manage.settingsTitle}
            </h1>
            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-foreground">{ws.name}</span>
              <span>{ws.slug}</span>
              <Badge variant="secondary">
                {strings.workspace.roleBadgePrefix} {workspaceRoleLabels[ws.role]}
              </Badge>
              <span>
                {ws.memberCount} {strings.workspace.manage.memberCount}
              </span>
            </div>
            <p className="text-muted-foreground text-sm">
              {strings.workspace.manage.pageDescription}
            </p>
          </div>
        </div>
      </section>

      {!canManage && (
        <Alert>
          <AlertDescription>{strings.workspace.manage.readonlyNote}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)] lg:items-start">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                {strings.workspace.manage.generalTitle}
              </CardTitle>
              <CardDescription>{strings.workspace.manage.generalDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              {canManage ? (
                <WorkspaceSettings
                  workspaceId={workspaceId}
                  name={ws.name}
                  slug={ws.slug}
                  icon={currentIcon}
                />
              ) : (
                <div className="grid gap-3 rounded-md border bg-muted/30 px-3 py-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">{strings.workspace.manage.nameLabel}</p>
                    <p className="font-medium">{ws.name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{strings.workspace.manage.slugLabel}</p>
                    <p className="font-medium">{ws.slug}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
                <LayoutDashboardIcon className="size-4" />
                {strings.board.listSectionTitle}
              </CardTitle>
              <CardDescription>{strings.board.listSectionDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <BoardListSection workspaceId={workspaceId} canCreateBoard={canCreateBoard} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
                <UsersIcon className="size-4" />
                {strings.members.sectionTitle}
                <InfoTooltipButton
                  label={strings.members.roleInfoLabel}
                  content={strings.members.roleInfo}
                />
              </CardTitle>
              <CardDescription>{strings.members.sectionDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <MemberList workspaceId={workspaceId} canManage={canManage} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
                  <MailIcon className="size-4" />
                  {strings.invitations.sentTitle}
                </CardTitle>
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
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                {strings.workspace.manage.actionsTitle}
              </CardTitle>
              <CardDescription>{strings.workspace.manage.actionsDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isOwner ? (
                <>
                  <div className="space-y-3 rounded-md border bg-muted/30 px-3 py-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ArchiveIcon className="size-4" />
                      {strings.workspace.manage.archiveTitle}
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {strings.workspace.manage.archiveConfirmDescription}
                    </p>
                    <ArchiveWorkspaceDialog
                      workspaceId={workspaceId}
                      onArchived={async () => {
                        await queryClient.invalidateQueries(trpc.workspace.list.queryFilter());
                        router.replace('/');
                      }}
                    />
                  </div>

                  <div className="border-destructive/30 space-y-3 rounded-md border bg-destructive/5 px-3 py-3">
                    <div className="text-destructive flex items-center gap-2 text-sm font-medium">
                      <Trash2Icon className="size-4" />
                      {strings.workspace.manage.deleteTitle}
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {strings.workspace.manage.deleteDialogDescription}
                    </p>
                    <DeleteWorkspaceDialog workspaceId={workspaceId} workspaceName={ws.name} />
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {strings.workspace.manage.ownerOnlyNote}
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
