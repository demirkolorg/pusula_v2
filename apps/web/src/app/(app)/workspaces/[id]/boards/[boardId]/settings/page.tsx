'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, PaletteIcon, ShapesIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_BOARD_ICON, ENTITY_ICONS, type EntityIcon } from '@pusula/domain';
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
import { AppSpinner } from '@/components/app-spinner';
import { EntityIconBadge } from '@/components/entity-icon';
import { boardRoleLabels, strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { BoardBackgroundPicker } from '../_components/board-settings/background-picker';
import { BoardIconPicker } from '../_components/board-settings/board-icon-picker';

type BoardSettingsData = {
  board: {
    id: string;
    title: string;
    icon?: string | null;
    background?: string | null;
    archivedAt?: Date | string | null;
    role: keyof typeof boardRoleLabels;
  };
};

function normalizeBoardIcon(icon: string | null | undefined): EntityIcon {
  return ENTITY_ICONS.includes(icon as EntityIcon) ? (icon as EntityIcon) : DEFAULT_BOARD_ICON;
}

export default function BoardSettingsPage({
  params,
}: {
  params: Promise<{ id: string; boardId: string }>;
}) {
  const { id: workspaceId, boardId } = use(params);
  const trpc = useTRPC();
  const board = useQuery(trpc.board.get.queryOptions({ boardId }));
  const copy = strings.board.settings;

  const backLink = (
    <Link
      href={`/workspaces/${workspaceId}/boards/${boardId}`}
      className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 rounded-md text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <ArrowLeftIcon className="size-3.5" />
      {copy.backToBoard}
    </Link>
  );

  if (board.isPending) {
    return (
      <div className="space-y-6">
        {backLink}
        <AppSpinner label={strings.board.loading} showLabel className="justify-start" />
      </div>
    );
  }

  if (board.isError) {
    return (
      <div className="space-y-6">
        {backLink}
        <Alert variant="destructive">
          <AlertTitle>{strings.board.detail.loadErrorTitle}</AlertTitle>
          <AlertDescription>{board.error.message || strings.common.unknownError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { board: b } = board.data as BoardSettingsData;
  const currentIcon = normalizeBoardIcon(b.icon);
  const archived = b.archivedAt != null;
  const canManage = b.role === 'admin';
  const boardActive = !archived;

  return (
    <div className="space-y-6">
      {backLink}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <EntityIconBadge icon={currentIcon} className="size-10" glyphClassName="size-5" />
          <div className="min-w-0 space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">{copy.dropdownTitle}</h1>
            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-foreground">{b.title}</span>
              <Badge variant="secondary">
                {strings.board.roleBadgePrefix} {boardRoleLabels[b.role]}
              </Badge>
              {archived && <Badge variant="outline">{strings.board.archivedBadge}</Badge>}
            </div>
            <p className="text-muted-foreground text-sm">{copy.pageDescription}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShapesIcon className="size-4" />
              {copy.iconTitle}
            </CardTitle>
            <CardDescription>{copy.iconDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <BoardIconPicker
              boardId={boardId}
              workspaceId={workspaceId}
              icon={currentIcon}
              canManage={canManage}
              boardActive={boardActive}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PaletteIcon className="size-4" />
              {strings.board.background.title}
            </CardTitle>
            <CardDescription>{copy.backgroundDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <BoardBackgroundPicker
              boardId={boardId}
              background={b.background ?? null}
              canManage={canManage}
              boardActive={boardActive}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
