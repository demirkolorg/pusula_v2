'use client';

import { ActivityIcon, InfoIcon } from 'lucide-react';
import { Avatar, EmptyState } from '@pusula/ui';
import { formatDate } from '@/lib/format';
import { strings } from '@/lib/strings';
import { summarizeCardActivity, type CardActivityEvent } from './activity-summary';

type CardDetailActivityProps = {
  events: CardActivityEvent[];
  pending?: boolean;
  error?: string | null;
};

/**
 * Card activity feed: newest-first list of readable summary lines (built by the
 * pure `summarizeCardActivity` helper) — actor avatar + summary + date. Read-only.
 * Rendered inside the modal's right-panel "Aktivite" tab.
 */
export function CardDetailActivity({ events, pending = false, error }: CardDetailActivityProps) {
  const copy = strings.card.activity;

  if (pending) {
    return (
      <ul className="space-y-2" aria-busy>
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="bg-muted size-4 shrink-0 animate-pulse rounded-full" />
            <span className="bg-muted h-3 flex-1 animate-pulse rounded" />
          </li>
        ))}
      </ul>
    );
  }

  if (error) {
    return <p className="text-destructive text-sm">{error}</p>;
  }

  if (events.length === 0) {
    return <EmptyState icon={<ActivityIcon className="size-8" />} message={copy.empty} />;
  }

  return (
    <ul className="space-y-2.5">
      {events.map((event) => (
        <li key={event.id} className="flex items-start gap-2 text-xs">
          <Avatar name={event.actorName} size="xs" />
          <span className="min-w-0 flex-1 break-words">
            {summarizeCardActivity(event, copy.unknownActor)}{' '}
            <span className="text-muted-foreground">· {formatDate(event.createdAt)}</span>
          </span>
          <InfoIcon className="text-muted-foreground mt-0.5 size-3 shrink-0" aria-hidden />
        </li>
      ))}
    </ul>
  );
}
