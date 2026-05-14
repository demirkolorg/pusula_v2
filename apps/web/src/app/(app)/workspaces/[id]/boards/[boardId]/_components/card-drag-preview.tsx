'use client';

import {
  AlignLeftIcon,
  CalendarIcon,
  CheckSquareIcon,
  MessageSquareIcon,
  TagIcon,
} from 'lucide-react';
import { MetaChip, MetaRow, cn } from '@pusula/ui';
import { CARD_COVER_COLORS, type CardCoverColor } from '@pusula/domain';
import { formatDate } from '@/lib/format';
import type { BoardCard } from './card-item';

function asCoverColor(value: string | null): CardCoverColor | null {
  return value != null && (CARD_COVER_COLORS as readonly string[]).includes(value)
    ? (value as CardCoverColor)
    : null;
}

const COVER_BAR: Record<CardCoverColor, string> = {
  kirmizi: 'bg-palet-kirmizi',
  turuncu: 'bg-palet-turuncu',
  sari: 'bg-palet-sari',
  lime: 'bg-palet-lime',
  yesil: 'bg-palet-yesil',
  sky: 'bg-palet-sky',
  mavi: 'bg-palet-mavi',
  indigo: 'bg-palet-indigo',
  mor: 'bg-palet-mor',
  pembe: 'bg-palet-pembe',
  gri: 'bg-palet-gri',
  siyah: 'bg-palet-siyah',
};

export type CardDragPreviewProps = {
  card: BoardCard;
  width: number;
};

/**
 * Live drag preview for a board card (DEM-87). Mounted into a body portal by
 * the board DnD hook *after* `disableNativeDragPreview` has hidden the
 * browser's HTML5 drag image — so this is a regular React element in the live
 * DOM, not a bitmap snapshot. That sidesteps every transparent-pixel /
 * soft-shadow / rotated-corner bug the HTML5 drag-image bitmap path produces.
 */
export function CardDragPreview({ card, width }: CardDragPreviewProps) {
  const coverColor = asCoverColor(card.coverColor);
  const hasDescription = card.description != null && card.description.trim() !== '';
  const hasLabels = card.labels.length > 0;
  const hasChecklist = card.checklistTotal > 0;
  const hasComments = card.commentCount > 0;
  const showMeta = hasDescription || hasLabels || hasChecklist || hasComments || card.dueAt != null;

  return (
    <div
      style={{ width }}
      className={cn(
        'pointer-events-none flex flex-col gap-1 rounded-md border border-[color:var(--board-card-border)] bg-[color:var(--board-card-bg)] p-2 text-sm',
        'rotate-2 shadow-md',
      )}
    >
      {coverColor && (
        <div
          className={cn('-mx-2 -mt-2 mb-1.5 h-1 rounded-t-md', COVER_BAR[coverColor])}
          aria-hidden
        />
      )}
      <div
        className={cn(
          'min-w-0 font-medium leading-snug break-words line-clamp-3',
          card.completed && 'text-muted-foreground line-through',
        )}
      >
        {card.title}
      </div>
      {showMeta && (
        <MetaRow className="mt-1.5">
          {card.dueAt != null && (
            <MetaChip icon={<CalendarIcon className="size-3" aria-hidden />}>
              {formatDate(card.dueAt)}
            </MetaChip>
          )}
          {hasDescription && <MetaChip icon={<AlignLeftIcon className="size-3" aria-hidden />} />}
          {hasLabels && (
            <MetaChip icon={<TagIcon className="size-3" aria-hidden />}>
              {card.labels.length}
            </MetaChip>
          )}
          {hasChecklist && (
            <MetaChip icon={<CheckSquareIcon className="size-3" aria-hidden />}>
              {card.checklistDone}/{card.checklistTotal}
            </MetaChip>
          )}
          {hasComments && (
            <MetaChip icon={<MessageSquareIcon className="size-3" aria-hidden />}>
              {card.commentCount}
            </MetaChip>
          )}
        </MetaRow>
      )}
    </div>
  );
}
