'use client';

import {
  CalendarIcon,
  ImageIcon,
  PaperclipIcon,
  TagIcon,
  UsersIcon,
} from 'lucide-react';
import { type CardCoverColor } from '@pusula/domain';
import { LabelSwatch, cn } from '@pusula/ui';
import { formatDate } from '@/lib/format';
import { strings } from '@/lib/strings';

/** ≤ 72h to due (but still in the future) = "soon" — surfaces a small amber dot. */
const SOON_WINDOW_MS = 72 * 60 * 60 * 1000;

function dueState(dueAt: Date | string): 'overdue' | 'soon' | 'normal' {
  const dueMs = (dueAt instanceof Date ? dueAt : new Date(dueAt)).getTime();
  if (Number.isNaN(dueMs)) return 'normal';
  const nowMs = Date.now();
  if (dueMs < nowMs) return 'overdue';
  if (dueMs - nowMs <= SOON_WINDOW_MS) return 'soon';
  return 'normal';
}

type CardModalMetaInfoProps = {
  memberCount: number;
  labelCount: number;
  dueAt: Date | string | null;
  coverColor: CardCoverColor | null;
  attachmentCount: number;
  /** Üst-bar rengi içerik üzerindeyse (kapak rengi varsa) ton ayarla. */
  onColored?: boolean;
};

/**
 * Card-modal başlık satırının sol tarafında, breadcrumb (`pano / liste`) yanında
 * gösterilen küçük, **salt okunabilir** meta info satırı. Üye sayısı, etiket
 * sayısı, son tarih, kapak rengi/görseli ve ek sayısı — değer varsa görünür,
 * yoksa atlanır. Tıklanmaz; tüm düzenleme/ekleme aksiyonları sağdaki "+ Ekle"
 * popover'ına taşındı.
 */
export function CardModalMetaInfo({
  memberCount,
  labelCount,
  dueAt,
  coverColor,
  attachmentCount,
  onColored = false,
}: CardModalMetaInfoProps) {
  const copy = strings.card.detail.modal;

  const hasAny =
    memberCount > 0 ||
    labelCount > 0 ||
    dueAt != null ||
    coverColor != null ||
    attachmentCount > 0;
  if (!hasAny) return null;

  const due = dueAt != null ? dueState(dueAt) : null;
  const overdue = due === 'overdue';
  const soon = due === 'soon';

  const itemClass = cn(
    'inline-flex items-center gap-1 whitespace-nowrap',
    onColored ? 'text-current/80' : 'text-muted-foreground',
  );

  return (
    <div
      data-slot="card-modal-meta-info"
      className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs"
    >
      {dueAt != null && (
        <span
          className={cn(
            itemClass,
            overdue && 'text-destructive',
            soon && 'font-medium',
          )}
          aria-label={copy.dueChip}
        >
          {soon && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning" />}
          <CalendarIcon aria-hidden className="size-3.5 shrink-0" />
          <span>{formatDate(dueAt)}</span>
          {overdue && (
            <span className="rounded-sm bg-destructive px-1 text-[9px] font-medium tracking-wide text-destructive-foreground uppercase">
              {copy.overdueBadge}
            </span>
          )}
        </span>
      )}

      {memberCount > 0 && (
        <span className={itemClass} aria-label={copy.metaInfoMembers(memberCount)}>
          <UsersIcon aria-hidden className="size-3.5 shrink-0" />
          <span>{memberCount}</span>
        </span>
      )}

      {labelCount > 0 && (
        <span className={itemClass} aria-label={copy.metaInfoLabels(labelCount)}>
          <TagIcon aria-hidden className="size-3.5 shrink-0" />
          <span>{labelCount}</span>
        </span>
      )}

      {coverColor != null && (
        <span className={itemClass} aria-label={copy.metaInfoCover}>
          <ImageIcon aria-hidden className="size-3.5 shrink-0" />
          <LabelSwatch color={coverColor} className="size-2.5" />
        </span>
      )}

      {attachmentCount > 0 && (
        <span className={itemClass} aria-label={copy.metaInfoAttachments(attachmentCount)}>
          <PaperclipIcon aria-hidden className="size-3.5 shrink-0" />
          <span>{attachmentCount}</span>
        </span>
      )}
    </div>
  );
}
