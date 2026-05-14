'use client';

import type { ReactNode } from 'react';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  MailIcon,
  PaletteIcon,
  PencilIcon,
  Settings2Icon,
  TagsIcon,
  UsersIcon,
  WrenchIcon,
} from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  SectionHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { BoardInvitationsSection } from './board-invitations-section';
import { BoardBackgroundPicker } from './background-picker';
import { BoardLabelsSection } from './board-labels-section';
import { BoardMembersSection } from './board-members-section';

export type BoardSettingsTab = 'members' | 'invitations' | 'labels' | 'background' | 'actions';

type BoardSettingsDropdownProps = {
  boardId: string;
  workspaceId: string;
  currentBackground: string | null;
  canManage: boolean;
  boardActive: boolean;
  archived: boolean;
  open: boolean;
  activeTab: BoardSettingsTab;
  onOpenChange: (open: boolean) => void;
  onActiveTabChange: (tab: BoardSettingsTab) => void;
  onRename: () => void;
  onArchive: () => void;
  onRestore: () => void;
  restorePending: boolean;
};

function SettingsPanel({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1.5">
        <SectionHeader icon={icon} className="mb-0">
          {title}
        </SectionHeader>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Board management dropdown. Non-admin users can inspect the background picker,
 * but mutation controls are disabled by the section-level `canManage` gate.
 */
export function BoardSettingsDropdown({
  boardId,
  workspaceId,
  currentBackground,
  canManage,
  boardActive,
  archived,
  open,
  activeTab,
  onOpenChange,
  onActiveTabChange,
  onRename,
  onArchive,
  onRestore,
  restorePending,
}: BoardSettingsDropdownProps) {
  const settingsCopy = strings.board.settings;
  const topCopy = strings.board.topBar;
  const canEditLabels = canManage && boardActive;

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="font-semibold"
          onClick={() => onActiveTabChange('members')}
        >
          <Settings2Icon className="size-4" />
          {topCopy.settings}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        onClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="w-[min(620px,calc(100vw-2rem))] overflow-visible p-3 shadow-popover"
      >
        <DropdownMenuLabel className="px-1 pb-2 pt-0 text-base font-semibold">
          {settingsCopy.dropdownTitle}
        </DropdownMenuLabel>
        <Tabs
          value={activeTab}
          onValueChange={(value) => onActiveTabChange(value as BoardSettingsTab)}
          className="gap-3"
        >
          <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-5">
            <TabsTrigger value="members" className="h-8">
              <UsersIcon className="size-3.5" />
              {settingsCopy.tabMembers}
            </TabsTrigger>
            <TabsTrigger value="invitations" className="h-8">
              <MailIcon className="size-3.5" />
              {settingsCopy.tabInvitations}
            </TabsTrigger>
            <TabsTrigger value="labels" className="h-8">
              <TagsIcon className="size-3.5" />
              {settingsCopy.tabLabels}
            </TabsTrigger>
            <TabsTrigger value="background" className="h-8">
              <PaletteIcon className="size-3.5" />
              {settingsCopy.tabBackground}
            </TabsTrigger>
            <TabsTrigger value="actions" className="h-8">
              <WrenchIcon className="size-3.5" />
              {settingsCopy.tabActions}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="max-h-[60vh] overflow-y-auto px-1 pt-1">
            <SettingsPanel
              icon={<UsersIcon className="size-3.5" />}
              title={settingsCopy.membersTitle}
              description={settingsCopy.membersDescription}
            >
              <BoardMembersSection
                boardId={boardId}
                workspaceId={workspaceId}
                canManage={canManage}
              />
            </SettingsPanel>
          </TabsContent>

          <TabsContent value="invitations" className="max-h-[60vh] overflow-y-auto px-1 pt-1">
            <SettingsPanel
              icon={<MailIcon className="size-3.5" />}
              title={settingsCopy.sentInvitationsTitle}
              description={settingsCopy.sentInvitationsDescription}
            >
              <BoardInvitationsSection boardId={boardId} canManage={canManage} />
            </SettingsPanel>
          </TabsContent>

          <TabsContent value="labels" className="max-h-[60vh] overflow-y-auto px-1 pt-1">
            <SettingsPanel
              icon={<TagsIcon className="size-3.5" />}
              title={settingsCopy.labelsTitle}
              description={settingsCopy.labelsDescription}
            >
              <BoardLabelsSection boardId={boardId} canEdit={canEditLabels} />
            </SettingsPanel>
          </TabsContent>

          <TabsContent value="background" className="max-h-[60vh] overflow-y-auto px-1 pt-1">
            <SettingsPanel
              icon={<PaletteIcon className="size-3.5" />}
              title={strings.board.background.title}
              description={settingsCopy.backgroundDescription}
            >
              <BoardBackgroundPicker
                boardId={boardId}
                background={currentBackground}
                canManage={canManage}
                boardActive={boardActive}
              />
            </SettingsPanel>
          </TabsContent>

          <TabsContent value="actions" className="px-1 pt-1">
            <SettingsPanel
              icon={<WrenchIcon className="size-3.5" />}
              title={settingsCopy.tabActions}
              description={settingsCopy.actionsDescription}
            >
              <DropdownMenuGroup className="space-y-1">
                {!archived && (
                  <DropdownMenuItem onSelect={onRename} disabled={!canManage}>
                    <PencilIcon />
                    {topCopy.menuRename}
                  </DropdownMenuItem>
                )}
                {archived ? (
                  <DropdownMenuItem onSelect={onRestore} disabled={!canManage || restorePending}>
                    <ArchiveRestoreIcon />
                    {topCopy.menuRestore}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem variant="destructive" onSelect={onArchive} disabled={!canManage}>
                    <ArchiveIcon />
                    {topCopy.menuArchive}
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </SettingsPanel>
          </TabsContent>
        </Tabs>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
