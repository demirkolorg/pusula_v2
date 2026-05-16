'use client';

import { useState } from 'react';
import { ActivityIcon } from 'lucide-react';
import { EmptyState } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { ActivityDetailDialog, ActivityRow } from './activity-feed';
import type { CardActivityEvent } from './activity-summary';

type CardDetailActivityProps = {
  events: CardActivityEvent[];
  pending?: boolean;
  error?: string | null;
};

/**
 * Card activity feed: newest-first list of readable summary rows (each built by
 * the pure `summarizeCardActivity` helper) — actor avatar + summary + relative
 * time. The per-row info button opens the shared activity detail modal.
 * Rendered inside the modal's right-panel "İşlemler" tab.
 */
export function CardDetailActivity({ events, pending = false, error }: CardDetailActivityProps) {
  const copy = strings.card.activity;
  const [detailEvent, setDetailEvent] = useState<CardActivityEvent | null>(null);

  if (pending) {
    return (
      <ul className="space-y-2" aria-busy>
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-2.5 rounded-lg border px-2.5 py-2">
            <span className="bg-muted size-5 shrink-0 animate-pulse rounded-full" />
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
    <>
      <ul className="space-y-1.5">
        {events.map((event) => (
          <ActivityRow
            key={event.id}
            event={event}
            unknownActor={copy.unknownActor}
            onShowDetail={(next) => setDetailEvent(next)}
          />
        ))}
      </ul>
      <ActivityDetailDialog
        event={detailEvent}
        open={detailEvent != null}
        onOpenChange={(next) => {
          if (!next) setDetailEvent(null);
        }}
        unknownActor={copy.unknownActor}
      />
    </>
  );
}
