'use client';

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
 * pure `summarizeCardActivity` helper) with the event date. Read-only — no
 * actions here.
 */
export function CardDetailActivity({ events, pending = false, error }: CardDetailActivityProps) {
  const copy = strings.card.activity;

  if (pending) {
    return (
      <section className="space-y-2">
        <h3 className="text-muted-foreground text-sm font-medium">{copy.title}</h3>
        <p className="text-muted-foreground text-sm">{strings.common.loading}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-2">
        <h3 className="text-muted-foreground text-sm font-medium">{copy.title}</h3>
        <p className="text-destructive text-sm">{error}</p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground text-sm font-medium">{copy.title}</h3>
      {events.length === 0 ? (
        <p className="text-muted-foreground text-sm">{copy.empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {events.map((event) => (
            <li key={event.id} className="text-sm">
              <span className="break-words">{summarizeCardActivity(event, copy.unknownActor)}</span>{' '}
              <span className="text-muted-foreground text-xs">· {formatDate(event.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
