'use client';

import { useMemo } from 'react';
import { ActivityIcon, InfoIcon } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pusula/ui';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { strings } from '@/lib/strings';
import { activityCategoryLabel, buildActivityChanges } from './activity-detail';
import { summarizeCardActivity, type CardActivityEvent } from './activity-summary';

type ActivityRowProps = {
  event: CardActivityEvent;
  unknownActor: string;
  onShowDetail: (event: CardActivityEvent) => void;
};

/**
 * One activity feed row — actor avatar, readable summary, relative time, and a
 * hover-revealed info button that opens the detail modal. Shared by the board
 * activity dropdown and the card detail "İşlemler" tab.
 */
export function ActivityRow({ event, unknownActor, onShowDetail }: ActivityRowProps) {
  const copy = strings.activityDetail;

  return (
    <li className="group bg-card/55 hover:bg-accent/40 flex items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors">
      <Avatar name={event.actorName} image={event.actorImage} size="xs" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs leading-snug break-words">
          {summarizeCardActivity(event, unknownActor)}
        </p>
        <p className="text-muted-foreground text-[11px]" title={formatDateTime(event.createdAt)}>
          {formatRelativeTime(event.createdAt)}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 touch:size-11 touch:opacity-100"
        aria-label={copy.infoLabel}
        onClick={() => onShowDetail(event)}
      >
        <InfoIcon className="size-3.5" />
      </Button>
    </li>
  );
}

type ActivityDetailDialogProps = {
  event: CardActivityEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unknownActor: string;
};

/**
 * Activity detail modal — event summary, meta fields (actor / date / category /
 * type code / record id), payload-derived before→after changes, and a
 * collapsible raw payload view so the full detail of any event is visible.
 */
export function ActivityDetailDialog({
  event,
  open,
  onOpenChange,
  unknownActor,
}: ActivityDetailDialogProps) {
  const copy = strings.activityDetail;

  const changes = useMemo(
    () => (event ? buildActivityChanges(event.payload) : []),
    [event],
  );
  const rawPayload = useMemo(() => {
    if (!event) return '';
    try {
      return JSON.stringify(event.payload, null, 2);
    } catch {
      return String(event.payload);
    }
  }, [event]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={strings.common.close} className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ActivityIcon className="size-4" aria-hidden />
            {copy.title}
          </DialogTitle>
          <DialogDescription className="sr-only">{copy.description}</DialogDescription>
        </DialogHeader>

        {event && (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-sm">
            <div className="bg-muted/40 flex items-start gap-2.5 rounded-lg border p-3">
              <Avatar name={event.actorName} image={event.actorImage} size="sm" />
              <p className="min-w-0 flex-1 break-words">
                {summarizeCardActivity(event, unknownActor)}
              </p>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
              <dt className="text-muted-foreground">{copy.metaActor}</dt>
              <dd className="break-words">{event.actorName?.trim() || unknownActor}</dd>

              <dt className="text-muted-foreground">{copy.metaDate}</dt>
              <dd>{formatDateTime(event.createdAt)}</dd>

              <dt className="text-muted-foreground">{copy.metaCategory}</dt>
              <dd>
                <Badge variant="secondary">{activityCategoryLabel(event.type)}</Badge>
              </dd>

              <dt className="text-muted-foreground">{copy.metaType}</dt>
              <dd>
                <code className="bg-muted rounded px-1.5 py-0.5 text-[11px]">{event.type}</code>
              </dd>

              <dt className="text-muted-foreground">{copy.metaId}</dt>
              <dd>
                <code className="text-muted-foreground text-[11px] break-all">{event.id}</code>
              </dd>
            </dl>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold">{copy.changesTitle}</h3>
              {changes.length === 0 ? (
                <p className="text-muted-foreground text-xs">{copy.changesEmpty}</p>
              ) : (
                <ul className="space-y-2">
                  {changes.map((change, index) => (
                    <li key={`${change.label}-${index}`} className="rounded-md border p-2 text-xs">
                      <p className="text-muted-foreground mb-1.5 font-medium">{change.label}</p>
                      {change.kind === 'diff' ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-rose-500/10 px-1.5 py-1 break-words text-rose-700 dark:text-rose-300">
                            {change.from || copy.emptyValue}
                          </span>
                          <span className="text-muted-foreground" aria-hidden>
                            →
                          </span>
                          <span className="rounded bg-emerald-500/10 px-1.5 py-1 break-words text-emerald-700 dark:text-emerald-300">
                            {change.to || copy.emptyValue}
                          </span>
                        </div>
                      ) : (
                        <p className="break-words">{change.value}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <details className="text-xs">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer font-medium select-none">
                {copy.rawTitle}
              </summary>
              <pre className="bg-muted mt-2 max-h-48 overflow-auto rounded-md p-2 text-[11px] leading-relaxed">
                {rawPayload}
              </pre>
            </details>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
