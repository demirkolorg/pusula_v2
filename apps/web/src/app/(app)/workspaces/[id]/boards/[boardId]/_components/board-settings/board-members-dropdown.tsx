'use client';

import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRoundIcon, MailIcon, UsersIcon } from 'lucide-react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  SectionHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@pusula/ui';
import { InfoTooltipButton } from '@/components/info-tooltip-button';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { BoardAccessRequestsSection } from './board-access-requests-section';
import { BoardInvitationsSection } from './board-invitations-section';
import { BoardMembersSection } from './board-members-section';

/**
 * DEM-154 — board üyelik bağlamı (üyeler / gönderilen davetler / erişim
 * talepleri) `BoardSettingsDropdown`'dan ayrılıp kendi "Üyeler" butonuna
 * taşındı. "Ayar" işi (etiket / arka plan / pano işlemleri) ayarlar
 * dropdown'ında kaldı. Bekleyen erişim talebi sayısı hem buton üstünde hem
 * "Talepler" sekmesinde rozetle gösterilir (yalnız admin).
 */
export type BoardMembersTab = 'members' | 'invitations' | 'accessRequests';

type BoardMembersDropdownProps = {
  boardId: string;
  workspaceId: string;
  /** Whether the viewer is board `admin` — gates invitation/request controls + badge. */
  canManage: boolean;
};

const boardChromeButtonClass =
  'text-[color:var(--board-chrome-fg)] hover:bg-white/10 hover:text-[color:var(--board-chrome-fg)] data-[state=open]:bg-white/10 data-[state=open]:text-[color:var(--board-chrome-fg)]';

function MembersPanel({
  icon,
  title,
  description,
  info,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  info?: { label: string; content: string };
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <SectionHeader icon={icon} className="mb-0">
            {title}
          </SectionHeader>
          {info && <InfoTooltipButton label={info.label} content={info.content} />}
        </div>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Board membership dropdown. Visible to all roles — the member list is open to
 * everyone; the invitations/access-request tabs are gated by `canManage` at the
 * section level. The pending access-request badge is admin-only.
 */
export function BoardMembersDropdown({
  boardId,
  workspaceId,
  canManage,
}: BoardMembersDropdownProps) {
  const settingsCopy = strings.board.settings;
  const topCopy = strings.board.topBar;
  const trpc = useTRPC();

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<BoardMembersTab>('members');

  // Bekleyen erişim talebi sayısı — buton + "Talepler" sekmesi rozeti. Query
  // yalnız admin için etkin (`list` procedure non-admin'e FORBIDDEN döner).
  // `BoardAccessRequestsSection` aynı query key'i paylaşır — TanStack Query
  // dedupe eder, çift fetch olmaz.
  const requests = useQuery(
    trpc.board.accessRequests.list.queryOptions({ boardId }, { enabled: canManage }),
  );
  const pendingCount = canManage ? (requests.data?.length ?? 0) : 0;
  const badgeLabel = pendingCount > 9 ? '9+' : String(pendingCount);

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('relative font-semibold', boardChromeButtonClass)}
          aria-label={
            pendingCount > 0 ? topCopy.membersWithRequests(pendingCount) : topCopy.members
          }
          onClick={() => setActiveTab('members')}
        >
          <UsersIcon className="size-4" />
          {topCopy.members}
          {pendingCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full px-1 text-[10px] leading-none tabular-nums"
            >
              {badgeLabel}
            </Badge>
          )}
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
          {settingsCopy.membersDropdownTitle}
        </DropdownMenuLabel>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as BoardMembersTab)}
          className="gap-3"
        >
          <div className="max-w-full overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="flex h-auto min-w-full w-max justify-start gap-1">
              <TabsTrigger value="members" className="h-8 shrink-0 flex-none px-3">
                <UsersIcon className="size-3.5" />
                {settingsCopy.tabMembers}
              </TabsTrigger>
              <TabsTrigger value="invitations" className="h-8 shrink-0 flex-none px-3">
                <MailIcon className="size-3.5" />
                {settingsCopy.tabInvitations}
              </TabsTrigger>
              <TabsTrigger value="accessRequests" className="h-8 shrink-0 flex-none gap-1.5 px-3">
                <KeyRoundIcon className="size-3.5" />
                {settingsCopy.tabAccessRequests}
                {pendingCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="h-4 min-w-4 rounded-full px-1 text-[10px] leading-none tabular-nums"
                  >
                    {badgeLabel}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="members" className="max-h-[60vh] overflow-y-auto px-1 pt-1">
            <MembersPanel
              icon={<UsersIcon className="size-3.5" />}
              title={settingsCopy.membersTitle}
              description={settingsCopy.membersDescription}
              info={{ label: settingsCopy.membersInfoLabel, content: settingsCopy.membersInfo }}
            >
              <BoardMembersSection
                boardId={boardId}
                workspaceId={workspaceId}
                canManage={canManage}
              />
            </MembersPanel>
          </TabsContent>

          <TabsContent value="invitations" className="max-h-[60vh] overflow-y-auto px-1 pt-1">
            <MembersPanel
              icon={<MailIcon className="size-3.5" />}
              title={settingsCopy.sentInvitationsTitle}
              description={settingsCopy.sentInvitationsDescription}
              info={{
                label: settingsCopy.invitationsInfoLabel,
                content: settingsCopy.invitationsInfo,
              }}
            >
              <BoardInvitationsSection boardId={boardId} canManage={canManage} />
            </MembersPanel>
          </TabsContent>

          <TabsContent value="accessRequests" className="max-h-[60vh] overflow-y-auto px-1 pt-1">
            <MembersPanel
              icon={<KeyRoundIcon className="size-3.5" />}
              title={settingsCopy.accessRequestsTitle}
              description={settingsCopy.accessRequestsDescription}
              info={{
                label: settingsCopy.accessRequestsInfoLabel,
                content: settingsCopy.accessRequestsInfo,
              }}
            >
              <BoardAccessRequestsSection boardId={boardId} canManage={canManage} />
            </MembersPanel>
          </TabsContent>
        </Tabs>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
