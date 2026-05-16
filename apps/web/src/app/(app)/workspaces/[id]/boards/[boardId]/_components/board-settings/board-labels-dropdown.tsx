'use client';

import { useState } from 'react';
import { TagsIcon } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  SectionHeader,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { BoardLabelsSection } from './board-labels-section';

/**
 * Board etiket paletini, üyelik bağlamı gibi (`BoardMembersDropdown`) kendi
 * ikon-butonuna taşır. "Ayar" dropdown'undan ayrıldı: ayarlar yalnız arka plan /
 * pano işlemleri sekmelerini tutar. Buton herkese görünür; düzenleme yetkisi
 * `canEdit` ile (board `member+` + board aktif) sınırlanır — yetkisiz kullanıcı
 * paleti yine görür ama mutasyon kontrolleri pasif kalır.
 */
type BoardLabelsDropdownProps = {
  boardId: string;
  /** Whether the viewer may create/edit/delete labels (board `member+`, board active). */
  canEdit: boolean;
};

const boardChromeButtonClass =
  'text-[color:var(--board-chrome-fg)] hover:bg-white/10 hover:text-[color:var(--board-chrome-fg)] data-[state=open]:bg-white/10 data-[state=open]:text-[color:var(--board-chrome-fg)]';

export function BoardLabelsDropdown({ boardId, canEdit }: BoardLabelsDropdownProps) {
  const settingsCopy = strings.board.settings;
  const topCopy = strings.board.topBar;

  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn('size-8', boardChromeButtonClass)}
              aria-label={topCopy.labels}
            >
              <TagsIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{topCopy.labels}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        onClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="w-[min(440px,calc(100vw-2rem))] overflow-visible p-3 shadow-popover"
      >
        <DropdownMenuLabel className="px-1 pb-2 pt-0 text-base font-semibold">
          {settingsCopy.labelsDropdownTitle}
        </DropdownMenuLabel>
        <section className="max-h-[60vh] space-y-3 overflow-y-auto px-1 pt-1">
          <div className="space-y-1.5">
            <SectionHeader icon={<TagsIcon className="size-3.5" />} className="mb-0">
              {settingsCopy.labelsTitle}
            </SectionHeader>
            <p className="text-muted-foreground text-sm">{settingsCopy.labelsDescription}</p>
          </div>
          <BoardLabelsSection boardId={boardId} canEdit={canEdit} />
        </section>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
