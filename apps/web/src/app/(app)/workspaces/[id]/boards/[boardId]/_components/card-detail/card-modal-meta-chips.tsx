'use client';

import { CalendarIcon, PaletteIcon, ShieldIcon, TagIcon } from 'lucide-react';
import { type CardCoverColor } from '@pusula/domain';
import { LabelSwatch, MetaChip, MetaRow, cn } from '@pusula/ui';
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

/** Which inline editor section is open below the meta-chip row (or `null`). */
export type CardMetaSection = 'members' | 'due' | 'labels' | 'cover' | null;

type CardModalMetaChipsProps = {
  memberCount: number;
  labelCount: number;
  /** Persisted due date (`null` ⇒ none). */
  dueAt: Date | string | null;
  /** Persisted cover colour (`null` ⇒ none). */
  coverColor: CardCoverColor | null;
  /** Whether the viewer may add/edit (board `member+`, board/list/card active). */
  canEdit: boolean;
  /** Currently-open inline section. */
  open: CardMetaSection;
  /** Toggle an inline editor section open/closed. */
  onToggle: (section: Exclude<CardMetaSection, null>) => void;
};

/**
 * The card-modal meta chip row: members / due date / labels / cover-colour + an
 * "add" chip. Each chip toggles its inline editor section below (a `Popover`
 * would also satisfy the spec; we use inline sections to avoid pulling in
 * another primitive and to reuse the existing picker components verbatim). The
 * due chip carries the overdue / due-soon emphasis; the cover-colour chip shows
 * the current swatch when set.
 */
export function CardModalMetaChips({
  memberCount,
  labelCount,
  dueAt,
  coverColor,
  open,
  onToggle,
}: CardModalMetaChipsProps) {
  const copy = strings.card.detail.modal;
  const state = dueAt != null ? dueState(dueAt) : 'normal';
  const overdue = state === 'overdue';
  const soon = state === 'soon';

  return (
    <MetaRow variant="modal" className="-ml-2 gap-0.5">
      <MetaChip
        variant="modal"
        interactive
        icon={<ShieldIcon className="size-3.5" aria-hidden />}
        aria-label={copy.membersChip}
        aria-expanded={open === 'members'}
        className={cn(open === 'members' && 'bg-muted text-foreground')}
        onClick={() => onToggle('members')}
      >
        {memberCount}
      </MetaChip>

      <MetaChip
        variant="modal"
        interactive
        tone={overdue ? 'overdue' : 'default'}
        icon={<CalendarIcon className="size-3.5" aria-hidden />}
        aria-label={copy.dueChip}
        aria-expanded={open === 'due'}
        className={cn(open === 'due' && !overdue && 'bg-muted text-foreground')}
        onClick={() => onToggle('due')}
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

      <MetaChip
        variant="modal"
        interactive
        icon={<TagIcon className="size-3.5" aria-hidden />}
        aria-label={copy.labelsChip}
        aria-expanded={open === 'labels'}
        className={cn(open === 'labels' && 'bg-muted text-foreground')}
        onClick={() => onToggle('labels')}
      >
        {labelCount}
      </MetaChip>

      <MetaChip
        variant="modal"
        interactive
        icon={<PaletteIcon className="size-3.5" aria-hidden />}
        aria-label={copy.coverColor}
        aria-expanded={open === 'cover'}
        className={cn(open === 'cover' && 'bg-muted text-foreground')}
        onClick={() => onToggle('cover')}
      >
        {coverColor != null ? (
          <LabelSwatch color={coverColor} className="size-2.5" />
        ) : (
          copy.coverColor
        )}
      </MetaChip>
    </MetaRow>
  );
}
