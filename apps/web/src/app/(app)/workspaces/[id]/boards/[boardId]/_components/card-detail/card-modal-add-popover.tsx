'use client';

import { type ReactNode } from 'react';
import {
  ArrowLeftIcon,
  CalendarIcon,
  ImageIcon,
  PaperclipIcon,
  PlusIcon,
  TagIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from '@pusula/ui';
import { strings } from '@/lib/strings';

export type CardAddView = 'main' | 'members' | 'labels' | 'due' | 'cover' | 'attachment';

type CardModalAddPopoverProps = {
  /** Karta düzenleme yetkisi yoksa trigger render edilmez. */
  canEdit: boolean;
  /** Üst-bar rengi içerik üzerindeyse (kapak rengi varsa) trigger tonu değişir. */
  onColored?: boolean;
  membersContent: ReactNode;
  labelsContent: ReactNode;
  dueContent: ReactNode;
  coverContent: ReactNode;
  attachmentContent: ReactNode;
  /**
   * Aktif view — `null` popover kapalı demektir. Klavye kısayolları (`d` ⇒
   * `'due'`, `m` ⇒ `'members'`, `t` ⇒ `'labels'`) doğrudan ilgili alt panele
   * götürebilmek için tamamen controlled.
   */
  view: CardAddView | null;
  onViewChange: (view: CardAddView | null) => void;
};

type ViewMeta = {
  key: CardAddView;
  label: string;
  description: string;
  icon: LucideIcon;
};

/**
 * "+ Ekle" popover — Trello'daki "Karta ekle" pattern'i. Tek Radix Popover
 * içinde view stack ile ana menü ⇄ alt panel arasında geçilir; alt panele
 * girince sol üstte geri oku, sağ üstte kapat çıkar. Üye / etiket / son tarih /
 * kapak / ek için ayrı chip dropdown yok — tüm ekleme aksiyonları burada.
 */
export function CardModalAddPopover({
  canEdit,
  onColored = false,
  membersContent,
  labelsContent,
  dueContent,
  coverContent,
  attachmentContent,
  view,
  onViewChange,
}: CardModalAddPopoverProps) {
  const copy = strings.card.detail.modal;
  const open = view != null;
  const setOpen = (next: boolean) => onViewChange(next ? 'main' : null);

  if (!canEdit) return null;

  const views: ViewMeta[] = [
    {
      key: 'labels',
      label: copy.addMenuLabels,
      description: copy.addMenuLabelsDescription,
      icon: TagIcon,
    },
    {
      key: 'due',
      label: copy.addMenuDue,
      description: copy.addMenuDueDescription,
      icon: CalendarIcon,
    },
    {
      key: 'members',
      label: copy.addMenuMembers,
      description: copy.addMenuMembersDescription,
      icon: UsersIcon,
    },
    {
      key: 'cover',
      label: copy.addMenuCover,
      description: copy.addMenuCoverDescription,
      icon: ImageIcon,
    },
    {
      key: 'attachment',
      label: copy.addMenuAttachment,
      description: copy.addMenuAttachmentDescription,
      icon: PaperclipIcon,
    },
  ];

  const subContent: Record<Exclude<CardAddView, 'main'>, ReactNode> = {
    members: membersContent,
    labels: labelsContent,
    due: dueContent,
    cover: coverContent,
    attachment: attachmentContent,
  };

  const activeMeta = view === 'main' ? null : views.find((v) => v.key === view) ?? null;
  const headerLabel = activeMeta ? activeMeta.label : copy.addPopoverTitle;

  const triggerClass = cn(
    'inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
    onColored
      ? 'text-current hover:bg-current/15 data-[state=open]:bg-current/15'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground',
  );

  const iconBtnClass = cn(
    'inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none [&_svg]:size-3.5',
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClass} aria-label={copy.addMeta}>
        <PlusIcon aria-hidden className="size-3.5" />
        {copy.addMeta}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        onClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="w-[min(360px,calc(100vw-2rem))] p-0 shadow-popover"
      >
        <div className="flex items-center justify-between gap-2 border-b px-2 py-2">
          <div className="flex min-w-0 items-center gap-1">
            {activeMeta && (
              <button
                type="button"
                className={iconBtnClass}
                onClick={() => onViewChange('main')}
                aria-label={copy.addPopoverBack}
              >
                <ArrowLeftIcon aria-hidden />
              </button>
            )}
            <span className="truncate px-1 text-sm font-medium">{headerLabel}</span>
          </div>
          <button
            type="button"
            className={iconBtnClass}
            onClick={() => onViewChange(null)}
            aria-label={copy.addPopoverClose}
          >
            <XIcon aria-hidden />
          </button>
        </div>

        <div
          className={cn(
            'max-h-[min(480px,70vh)] overflow-y-auto',
            view === 'main' || view == null ? 'p-2' : 'p-3',
          )}
        >
          {view === 'main' || view == null ? (
            <ul className="flex flex-col gap-0.5">
              {views.map((meta) => {
                const Icon = meta.icon;
                return (
                  <li key={meta.key}>
                    <button
                      type="button"
                      aria-label={meta.label}
                      onClick={() => onViewChange(meta.key)}
                      className="flex w-full cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none"
                    >
                      <Icon
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-sm font-medium leading-tight">{meta.label}</span>
                        <span className="text-xs leading-tight text-muted-foreground">
                          {meta.description}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            subContent[view]
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
