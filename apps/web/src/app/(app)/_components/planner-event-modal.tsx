'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CalendarIcon,
  ExternalLinkIcon,
  MapPinIcon,
  UsersIcon,
} from 'lucide-react';
import type { PlannerEvent, PlannerEventAttendee } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Avatar,
  Badge,
  buttonVariants,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type PlannerEventModalProps = {
  /** Google Calendar event ID; `?event=<id>` URL param'dan gelir. */
  eventId: string;
  /**
   * Etkinliğin geldiği takvim ID'si — `?calendar=<id>` URL param'dan gelir.
   * Faz 16 hızlı revize (2026-06-01): primary dışındaki bir takvimdeki
   * etkinliğin detayı `events.get?calendarId=…`'a yönlendirilmeli, yoksa
   * primary'de aranır ve 404 → "Etkinlik yüklenemedi." görünür.
   */
  calendarId?: string;
  open: boolean;
  /** URL param'ı temizle + modal'ı kapat. */
  onClose: () => void;
};

/**
 * Faz 16C (DEM-312) — Etkinlik detay modal'ı. Pusula içi read-only görünüm:
 * başlık + tarih/saat + konum + açıklama + katılımcılar (RSVP rozeti) +
 * "Google'da aç" link. Düzenleme/silme/yeniden zamanlama YOK (V1 disiplini).
 *
 * Data: tRPC `planner.events.get` (16C router'ı `packages/api/src/routers/
 * planner.ts`). Hata mapping (`UNAUTHORIZED GOOGLE_RECONNECT_REQUIRED` /
 * `INTERNAL_SERVER_ERROR`) panel'in reconnect/error UI'sına bırakıldı;
 * modal'da basit "yüklenemedi" mesajı gösterilir.
 *
 * Bkz. `docs/architecture/19-takvim-entegrasyonu.md` §6 + §11.
 */
export function PlannerEventModal({ eventId, open, onClose }: PlannerEventModalProps) {
  const copy = strings.board.planner.event;
  const trpc = useTRPC();

  const eventQuery = useQuery({
    ...trpc.planner.events.get.queryOptions({ eventId }),
    enabled: open,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const event = eventQuery.data;
  const isLoading = eventQuery.isPending;
  const error = eventQuery.error;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent
        closeLabel={copy.close}
        className="w-[min(560px,92vw)] sm:max-w-none"
      >
        <DialogHeader>
          <DialogTitle>
            {event ? eventDisplayTitle(event) : copy.modalTitle}
          </DialogTitle>
          {event?.status === 'cancelled' && (
            <DialogDescription>
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                {copy.statusCancelled}
              </Badge>
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading && (
          <p className="text-muted-foreground py-4 text-center text-sm">
            {strings.common.loading}
          </p>
        )}
        {error && !isLoading && (
          <Alert variant="destructive">
            <AlertDescription>{copy.loadError}</AlertDescription>
          </Alert>
        )}

        {event && !isLoading && !error && (
          <div className="space-y-4 text-sm">
            <p className="text-foreground flex items-center gap-2">
              <CalendarIcon className="size-4 opacity-70" aria-hidden />
              {formatEventRange(event)}
            </p>

            {event.location && (
              <p className="text-muted-foreground flex items-start gap-2">
                <MapPinIcon className="size-4 shrink-0 opacity-70" aria-hidden />
                <span className="break-words">{event.location}</span>
              </p>
            )}

            {event.description && (
              <section className="space-y-1">
                <h3 className="text-foreground text-xs font-semibold uppercase tracking-wide">
                  {copy.description}
                </h3>
                <p className="text-muted-foreground whitespace-pre-wrap break-words">
                  {event.description}
                </p>
              </section>
            )}

            {event.attendees && event.attendees.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                  <UsersIcon className="size-3.5" aria-hidden />
                  {copy.attendeesCount(event.attendees.length)}
                </h3>
                <ul className="space-y-1.5">
                  {event.attendees.map((attendee) => (
                    <li
                      key={attendee.email}
                      className="flex items-center gap-2"
                    >
                      <Avatar
                        size="sm"
                        name={attendee.displayName ?? attendee.email}
                      />
                      <span className="text-foreground flex-1 truncate text-sm">
                        {attendee.displayName ?? attendee.email}
                      </span>
                      {attendee.responseStatus && (
                        <AttendeeRsvpBadge status={attendee.responseStatus} />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          {event && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noreferrer noopener"
              className={buttonVariants({ variant: 'outline' })}
            >
              <ExternalLinkIcon className="size-4" aria-hidden />
              <span className="ml-2">{copy.openInGoogle}</span>
            </a>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function eventDisplayTitle(event: PlannerEvent): string {
  const raw = event.summary?.trim();
  return raw ? raw : strings.board.planner.event.untitled;
}

/**
 * "1 Haziran Pazartesi · 10:30 — 11:30" gibi insan-okunur biçim. Tüm-gün
 * etkinliklerinde saat aralığı yerine "Tüm gün" rozeti dökülür.
 */
function formatEventRange(event: PlannerEvent): string {
  const start = pickInstant(event.start);
  if (!start) return strings.board.planner.allDayLabel;

  const dateFmt = new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeFmt = new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const datePart = dateFmt.format(start);

  if (event.start.date && !event.start.dateTime) {
    return `${datePart} · ${strings.board.planner.allDayLabel}`;
  }

  const end = pickInstant(event.end);
  if (!end) return `${datePart} · ${timeFmt.format(start)}`;
  return `${datePart} · ${timeFmt.format(start)} — ${timeFmt.format(end)}`;
}

function pickInstant(time: PlannerEvent['start']): Date | null {
  if (time.dateTime) return new Date(time.dateTime);
  if (time.date) return new Date(`${time.date}T00:00:00`);
  return null;
}

function AttendeeRsvpBadge({
  status,
}: {
  status: NonNullable<PlannerEventAttendee['responseStatus']>;
}) {
  const copy = strings.board.planner.event.rsvp;
  const label = copy[status];
  const className = {
    accepted: 'border-success/40 text-success bg-success/10',
    declined: 'border-destructive/40 text-destructive bg-destructive/10',
    tentative: 'border-warning/40 text-warning bg-warning/10',
    needsAction: 'border-muted-foreground/40 text-muted-foreground bg-muted/40',
  }[status];

  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}
