'use client';

import type { ReactNode } from 'react';
import { CalendarIcon, ImageIcon, PaperclipIcon, ShieldIcon, TagIcon } from 'lucide-react';
import { type CardCoverColor } from '@pusula/domain';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  LabelSwatch,
  MetaChip,
  MetaRow,
  cn,
} from '@pusula/ui';
import { formatDate } from '@/lib/format';
import { strings } from '@/lib/strings';

/** ≤ 72h away (but still in the future) = "soon" — surfaces an amber dot. */
const SOON_WINDOW_MS = 72 * 60 * 60 * 1000;

function dueState(dueAt: Date | string): 'overdue' | 'soon' | 'normal' {
  const dueMs = (dueAt instanceof Date ? dueAt : new Date(dueAt)).getTime();
  if (Number.isNaN(dueMs)) return 'normal';
  const nowMs = Date.now();
  if (dueMs < nowMs) return 'overdue';
  if (dueMs - nowMs <= SOON_WINDOW_MS) return 'soon';
  return 'normal';
}

type CardModalMetaChipsProps = {
  memberCount: number;
  labelCount: number;
  /** Persisted due date (`null` ⇒ none). */
  dueAt: Date | string | null;
  /** Persisted cover colour (`null` ⇒ none). */
  coverColor: CardCoverColor | null;
  /** Whether the viewer may add/edit (board `member+`, board/list/card active). */
  canEdit: boolean;
  membersContent: ReactNode;
  dueContent: ReactNode;
  labelsContent: ReactNode;
  coverContent: ReactNode;
  openMenu?: CardModalMetaMenu;
  onOpenMenuChange?: (menu: CardModalMetaMenu) => void;
  /**
   * Committed-attachment count — drives the "Ek" chip suffix. When omitted the
   * chip is not rendered (keeps the chip optional for read-only contexts).
   */
  attachmentCount?: number;
  /**
   * Click handler for the "Ek" chip — opens the sidebar's attachments tab in
   * the dialog. When omitted the chip is not rendered.
   */
  onOpenAttachments?: () => void;
};

export type CardModalMetaMenu = 'members' | 'due' | 'labels' | 'cover' | null;

function MetaDropdown({
  trigger,
  children,
  className,
  open,
  onOpenChange,
}: {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        onClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className={cn(
          'w-[min(420px,calc(100vw-2rem))] overflow-visible p-3 shadow-popover',
          className,
        )}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The card-modal meta chip row: members / due date / labels / cover-colour + an
 * "add" chip. Each chip opens its editor in a shadcn/Radix dropdown so the modal
 * body no longer jumps when a picker is opened. The due chip carries the overdue
 * / due-soon emphasis; the cover-colour chip shows the current swatch when set.
 */
export function CardModalMetaChips({
  memberCount,
  labelCount,
  dueAt,
  coverColor,
  membersContent,
  dueContent,
  labelsContent,
  coverContent,
  openMenu,
  onOpenMenuChange,
  attachmentCount,
  onOpenAttachments,
}: CardModalMetaChipsProps) {
  const copy = strings.card.detail.modal;
  const state = dueAt != null ? dueState(dueAt) : 'normal';
  const overdue = state === 'overdue';
  const soon = state === 'soon';

  return (
    <MetaRow variant="modal" className="-ml-2 gap-0.5">
      <MetaDropdown
        open={openMenu === undefined ? undefined : openMenu === 'members'}
        onOpenChange={(open) => onOpenMenuChange?.(open ? 'members' : null)}
        trigger={
          <MetaChip
            variant="modal"
            interactive
            icon={<ShieldIcon className="size-3.5" aria-hidden />}
            aria-label={copy.membersChip}
            className="data-[state=open]:bg-muted data-[state=open]:text-foreground"
          >
            {memberCount}
          </MetaChip>
        }
      >
        {membersContent}
      </MetaDropdown>

      <MetaDropdown
        open={openMenu === undefined ? undefined : openMenu === 'due'}
        onOpenChange={(open) => onOpenMenuChange?.(open ? 'due' : null)}
        trigger={
          <MetaChip
            variant="modal"
            interactive
            tone={overdue ? 'overdue' : 'default'}
            icon={<CalendarIcon className="size-3.5" aria-hidden />}
            aria-label={copy.dueChip}
            className={cn(
              'data-[state=open]:bg-muted data-[state=open]:text-foreground',
              overdue && 'data-[state=open]:bg-destructive/12 data-[state=open]:text-destructive',
            )}
          >
            {dueAt != null ? (
              <span className="inline-flex items-center gap-1">
                {soon && <span aria-hidden className="size-1.5 rounded-full bg-warning" />}
                {formatDate(dueAt)}
                {overdue && (
                  <span className="rounded-sm bg-destructive px-1 text-[9px] font-medium tracking-wide text-destructive-foreground uppercase">
                    {copy.overdueBadge}
                  </span>
                )}
              </span>
            ) : (
              copy.dueChip
            )}
          </MetaChip>
        }
        className="w-[min(340px,calc(100vw-2rem))]"
      >
        {dueContent}
      </MetaDropdown>

      <MetaDropdown
        open={openMenu === undefined ? undefined : openMenu === 'labels'}
        onOpenChange={(open) => onOpenMenuChange?.(open ? 'labels' : null)}
        trigger={
          <MetaChip
            variant="modal"
            interactive
            icon={<TagIcon className="size-3.5" aria-hidden />}
            aria-label={copy.labelsChip}
            className="data-[state=open]:bg-muted data-[state=open]:text-foreground"
          >
            {labelCount}
          </MetaChip>
        }
        className="w-[min(460px,calc(100vw-2rem))]"
      >
        {labelsContent}
      </MetaDropdown>

      <MetaDropdown
        open={openMenu === undefined ? undefined : openMenu === 'cover'}
        onOpenChange={(open) => onOpenMenuChange?.(open ? 'cover' : null)}
        trigger={
          <MetaChip
            variant="modal"
            interactive
            icon={<ImageIcon className="size-3.5" aria-hidden />}
            aria-label={copy.coverColor}
            className="data-[state=open]:bg-muted data-[state=open]:text-foreground"
          >
            {coverColor != null ? (
              <LabelSwatch color={coverColor} className="size-2.5" />
            ) : (
              copy.coverColor
            )}
          </MetaChip>
        }
        className="w-[min(320px,calc(100vw-2rem))]"
      >
        {coverContent}
      </MetaDropdown>

      {onOpenAttachments && (
        <MetaChip
          variant="modal"
          interactive
          icon={<PaperclipIcon className="size-3.5" aria-hidden />}
          aria-label={copy.attachmentsChip}
          onClick={onOpenAttachments}
        >
          {attachmentCount != null && attachmentCount > 0
            ? attachmentCount
            : copy.attachmentsChip}
        </MetaChip>
      )}
    </MetaRow>
  );
}
