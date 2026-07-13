'use client';

import type { ReactNode } from 'react';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  KeyRoundIcon,
  PaletteIcon,
  PencilIcon,
  Settings2Icon,
  ShapesIcon,
  WrenchIcon,
} from 'lucide-react';
import type { EntityIcon } from '@pusula/domain';
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
  cn,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { BoardApiKeysSection } from './board-api-keys-section';
import { BoardBackgroundPicker } from './background-picker';
import { BoardIconPicker } from './board-icon-picker';

/**
 * DEM-154 — üyelik bağlamı sekmeleri (`members` / `invitations` /
 * `accessRequests`) ayrı `BoardMembersDropdown`'a taşındı. Etiket paleti de
 * kendi ikon-butonuna (`BoardLabelsDropdown`) ayrıldı. Bu dropdown yalnız
 * "ayar" işini taşır: arka plan / pano işlemleri.
 *
 * Faz 14F (DEM-296) sonrası "Rapor İndir" item dropdown'dan kaldırıldı ve
 * `BoardTopBar`'daki chrome ikon serisine taşındı (`DownloadReportButton`) —
 * dropdown derinliği yerine tek-tık eski Pusula refleksi (kullanıcı geri
 * bildirimi 2026-05-25).
 */
export type BoardSettingsTab = 'background' | 'actions' | 'apiKeys';

type BoardSettingsDropdownProps = {
  boardId: string;
  workspaceId: string;
  currentIcon: EntityIcon;
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

const boardChromeButtonClass =
  'text-[color:var(--board-chrome-fg)] hover:bg-white/10 hover:text-[color:var(--board-chrome-fg)] data-[state=open]:bg-white/10 data-[state=open]:text-[color:var(--board-chrome-fg)]';

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
  currentIcon,
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

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('font-semibold', boardChromeButtonClass)}
          onClick={() => onActiveTabChange('background')}
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
        className="w-[min(700px,calc(100vw-2rem))] overflow-visible p-3 shadow-popover"
      >
        <DropdownMenuLabel className="px-1 pb-2 pt-0 text-base font-semibold">
          {settingsCopy.dropdownTitle}
        </DropdownMenuLabel>
        <Tabs
          value={activeTab}
          onValueChange={(value) => onActiveTabChange(value as BoardSettingsTab)}
          className="gap-3"
        >
          <div className="max-w-full overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="flex h-auto min-w-full w-max justify-start gap-1">
              <TabsTrigger value="background" className="h-8 shrink-0 flex-none px-3">
                <PaletteIcon className="size-3.5" />
                {settingsCopy.tabBackground}
              </TabsTrigger>
              <TabsTrigger value="actions" className="h-8 shrink-0 flex-none px-3">
                <WrenchIcon className="size-3.5" />
                {settingsCopy.tabActions}
              </TabsTrigger>
              {/* API anahtarları yalnız board admin'e görünür (key envanteri
                  hassas). Members/labels bölümlerinin admin gate deseni gibi
                  görünürlük mount seviyesinde kısıtlanır. */}
              {canManage && (
                <TabsTrigger value="apiKeys" className="h-8 shrink-0 flex-none px-3">
                  <KeyRoundIcon className="size-3.5" />
                  {settingsCopy.tabApiKeys}
                </TabsTrigger>
              )}
            </TabsList>
          </div>

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

          <TabsContent value="actions" className="max-h-[60vh] overflow-y-auto px-1 pt-1">
            <SettingsPanel
              icon={<WrenchIcon className="size-3.5" />}
              title={settingsCopy.tabActions}
              description={settingsCopy.actionsDescription}
            >
              <div className="space-y-4">
                <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                  <div className="space-y-1.5">
                    <SectionHeader icon={<ShapesIcon className="size-3.5" />} className="mb-0">
                      {settingsCopy.iconTitle}
                    </SectionHeader>
                    <p className="text-muted-foreground text-sm">{settingsCopy.iconDescription}</p>
                  </div>
                  <BoardIconPicker
                    boardId={boardId}
                    workspaceId={workspaceId}
                    icon={currentIcon}
                    canManage={canManage}
                    boardActive={boardActive}
                  />
                </div>

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
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={onArchive}
                      disabled={!canManage}
                    >
                      <ArchiveIcon />
                      {topCopy.menuArchive}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </div>
            </SettingsPanel>
          </TabsContent>

          {canManage && (
            <TabsContent value="apiKeys" className="max-h-[60vh] overflow-y-auto px-1 pt-1">
              <SettingsPanel
                icon={<KeyRoundIcon className="size-3.5" />}
                title={settingsCopy.apiKeysTitle}
                description={settingsCopy.apiKeysDescription}
              >
                <BoardApiKeysSection boardId={boardId} />
              </SettingsPanel>
            </TabsContent>
          )}
        </Tabs>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
