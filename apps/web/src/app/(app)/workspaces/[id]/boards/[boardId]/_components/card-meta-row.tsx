'use client';

import { AlignLeftIcon, CalendarIcon, MessageSquareIcon, TagIcon } from 'lucide-react';
import { Avatar, MetaChip, MetaRow, Tooltip, TooltipContent, TooltipTrigger } from '@pusula/ui';
import { formatDate } from '@/lib/format';
import { strings } from '@/lib/strings';

/** A card member as carried by `board.get` → `cards[].members`. */
export type CardMember = {
  userId: string;
  name: string | null;
  image: string | null;
  role: 'assignee' | 'watcher';
};

type CardMetaRowProps = {
  description: string | null;
  dueAt: Date | string | null;
  labelCount?: number;
  commentCount: number;
  members: CardMember[];
  /** Injectable "now" for deterministic tests. Defaults to `Date.now()`. */
  now?: number;
};

/** ≤ 72h away (but still in the future) = "soon" — surfaces an amber dot. */
const SOON_WINDOW_MS = 72 * 60 * 60 * 1000;

type DueState = 'overdue' | 'soon' | 'normal';

function dueState(dueAt: Date | string, nowMs: number): DueState {
  const dueMs = (dueAt instanceof Date ? dueAt : new Date(dueAt)).getTime();
  if (Number.isNaN(dueMs)) return 'normal';
  if (dueMs < nowMs) return 'overdue';
  if (dueMs - nowMs <= SOON_WINDOW_MS) return 'soon';
  return 'normal';
}

/** Up to the last `max` members, shown as a stacked avatar group. */
const MAX_AVATARS = 3;

/**
 * The compact metadata strip under a card title: due chip (with overdue / soon
 * emphasis), a "has description" marker, checklist progress, comment count and a
 * stacked member-avatar group. Each cell renders only when the matching data
 * exists; the whole row is `null` when there's nothing to show. Tooltips label
 * the icon-only cells for accessibility. Pure presentational — no data fetching.
 */
export function CardMetaRow({
  description,
  dueAt,
  labelCount = 0,
  commentCount,
  members,
  now,
}: CardMetaRowProps) {
  const copy = strings.board.card;
  const nowMs = now ?? Date.now();

  const hasDescription = description != null && description.trim() !== '';
  const hasLabels = labelCount > 0;
  const hasComments = commentCount > 0;
  const hasMembers = members.length > 0;
  const hasDue = dueAt != null;
  const hasActions = hasDue || hasDescription || hasLabels || hasComments;

  if (!hasActions && !hasMembers) {
    return null;
  }

  const due = hasDue ? dueState(dueAt, nowMs) : 'normal';

  return (
    <div data-slot="card-bottom-meta" className="mt-1.5 flex items-center gap-2">
      {hasMembers && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              data-slot="card-meta-members"
              className="inline-flex shrink-0 items-center -space-x-1"
            >
              {members.slice(0, MAX_AVATARS).map((m) => (
                <Avatar
                  key={`${m.userId}-${m.role}`}
                  name={m.name}
                  image={m.image}
                  size="xs"
                  ring
                />
              ))}
              {members.length > MAX_AVATARS && (
                <span className="bg-muted text-muted-foreground ring-card relative inline-flex size-4 items-center justify-center rounded-full text-[9px] font-medium ring-2">
                  +{members.length - MAX_AVATARS}
                </span>
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {`${copy.membersTooltip} · ${members
              .map((m) => m.name?.trim() || copy.membersTooltip)
              .join(', ')}`}
          </TooltipContent>
        </Tooltip>
      )}

      {hasActions && (
        <MetaRow data-slot="card-meta-actions" className="ml-auto justify-end">
          {hasDue && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1">
                  <MetaChip
                    icon={<CalendarIcon className="size-3" />}
                    tone={due === 'overdue' ? 'overdue' : 'default'}
                  >
                    {formatDate(dueAt)}
                    {due === 'overdue' && (
                      <span className="bg-destructive text-destructive-foreground rounded-sm px-1 text-[9px] font-medium tracking-wide uppercase">
                        {copy.overdueBadge}
                      </span>
                    )}
                  </MetaChip>
                  {due === 'soon' && (
                    <span className="bg-warning size-1.5 shrink-0 rounded-full" aria-hidden />
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {(due === 'overdue'
                  ? copy.overdueTooltip
                  : due === 'soon'
                    ? copy.dueSoonTooltip
                    : copy.dueTooltip) +
                  ' · ' +
                  formatDate(dueAt)}
              </TooltipContent>
            </Tooltip>
          )}

          {hasDescription && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <MetaChip icon={<AlignLeftIcon className="size-3" aria-hidden />}>
                    <span className="sr-only">{copy.descriptionTooltip}</span>
                  </MetaChip>
                </span>
              </TooltipTrigger>
              <TooltipContent>{copy.descriptionTooltip}</TooltipContent>
            </Tooltip>
          )}

          {hasLabels && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <MetaChip icon={<TagIcon className="size-3" aria-hidden />}>
                    {labelCount}
                  </MetaChip>
                </span>
              </TooltipTrigger>
              <TooltipContent>{`${copy.labelsTooltip} · ${labelCount}`}</TooltipContent>
            </Tooltip>
          )}

          {hasComments && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <MetaChip icon={<MessageSquareIcon className="size-3" aria-hidden />}>
                    {commentCount}
                  </MetaChip>
                </span>
              </TooltipTrigger>
              <TooltipContent>{`${copy.commentsTooltip} · ${commentCount}`}</TooltipContent>
            </Tooltip>
          )}
        </MetaRow>
      )}
    </div>
  );
}
