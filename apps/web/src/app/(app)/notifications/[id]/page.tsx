'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BellOffIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Avatar, Badge, Button, Separator, cn } from '@pusula/ui';
import type { RouterOutputs } from '@pusula/api';
import { activitySummary } from '@/lib/activity-summary';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { AppSpinner } from '@/components/app-spinner';
import { buildActivityChanges } from '../../workspaces/[id]/boards/[boardId]/_components/card-detail/activity-detail';
import { notificationTypeIcon } from '../../_components/notification-type-icon';
import { resolveNotificationLink } from '../../_components/notification-link';
import { notificationPayload } from '../../_components/notification-types';

type NotificationDetail = RouterOutputs['notifications']['byId'];

/**
 * Scheduler kaynaklı (aktörsüz) bildirim tipleri — bunları bir kullanıcı
 * tetiklemez, dolayısıyla başlıkta aktör avatarı yerine tip ikonu/rozet
 * gösterilir. `notification-center.tsx`'teki set ile birebir. Bkz.
 * `docs/domain/04-bildirim-kurallari.md` → "Sistem (aktörsüz) bildirimler".
 */
const SYSTEM_NOTIFICATION_TYPES = new Set([
  'due_approaching',
  'due_overdue',
  'due_reminder_1d',
  'due_reminder_1h',
  'report_render_completed',
  'report_render_failed',
]);

function isSystemNotification(type: string): boolean {
  return SYSTEM_NOTIFICATION_TYPES.has(type);
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * `(app)/notifications/[id]` — bildirim detay / audit ekranı (Faz 4,
 * 2026-06-21). Bildirim merkezindeki satıra tıklayınca artık doğrudan karta
 * değil bu ekrana gelinir; "Karta git" burada. İçerik:
 *  - başlık: aktör avatar+ad (sistem bildiriminde tip ikonu/rozet) + zaman,
 *  - özet (`activitySummary`) + tip etiketi/ikonu,
 *  - önce/sonra diff (`activityEventPayload` → web `buildActivityChanges`),
 *  - katlanır ham JSON (varsayılan kapalı),
 *  - "Karta git" (`resolveNotificationLink` → kart+scroll+flash / board / ws).
 *
 * Sözleşme: `docs/architecture/06-bildirim-altyapisi.md` "Bildirim detay /
 * audit ekranı" + `docs/domain/04-bildirim-kurallari.md` "Bildirim detay
 * ekranı". Yalnız shadcn/ui + Tailwind + lucide-react; metinler `strings.ts`.
 */
export default function NotificationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const trpc = useTRPC();
  const copy = strings.notificationDetail;

  const query = useQuery(trpc.notifications.byId.queryOptions({ id }));

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground -ml-2 mb-4 h-8 gap-1.5"
        onClick={() => router.back()}
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        {copy.backToList}
      </Button>

      {query.isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <AppSpinner />
          <p className="text-muted-foreground text-sm">{copy.loading}</p>
        </div>
      ) : query.isError ? (
        <NotificationErrorState
          notFound={
            (query.error as { data?: { code?: string } } | null)?.data?.code === 'NOT_FOUND'
          }
          onRetry={() => void query.refetch()}
        />
      ) : query.data ? (
        <NotificationDetailView notification={query.data} />
      ) : null}
    </main>
  );
}

function NotificationErrorState({
  notFound,
  onRetry,
}: {
  notFound: boolean;
  onRetry: () => void;
}) {
  const copy = strings.notificationDetail;
  const Icon = notFound ? BellOffIcon : TriangleAlertIcon;
  const title = notFound ? copy.notFoundTitle : copy.loadErrorTitle;
  const hint = notFound ? copy.notFoundHint : copy.loadErrorHint;

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-full',
          notFound ? 'bg-muted text-muted-foreground' : 'bg-destructive/10 text-destructive',
        )}
      >
        <Icon className="size-6" aria-hidden />
      </span>
      <h1 className="text-foreground text-base font-semibold">{title}</h1>
      <p className="text-muted-foreground max-w-sm text-sm">{hint}</p>
      {!notFound && (
        <Button type="button" variant="outline" size="sm" className="mt-1" onClick={onRetry}>
          {strings.common.retry}
        </Button>
      )}
    </div>
  );
}

function NotificationDetailView({ notification }: { notification: NotificationDetail }) {
  const router = useRouter();
  const copy = strings.notificationDetail;

  const system = isSystemNotification(notification.type);
  const payload = notificationPayload(notification);
  const actorName = notification.actorName ?? payload.actorName ?? copy.systemActorName;

  // Önce/sonra diff: olayın TAM payload'ı (`activityEventPayload`) önceliklidir;
  // yoksa bildirimin kendi payload'ına düşer (eski / scheduler satırları).
  const changeSource = notification.activityEventPayload ?? notification.payload;
  const changes = useMemo(() => buildActivityChanges(changeSource), [changeSource]);

  // "Karta git" hedefi — kart varsa kart+scroll+flash, yoksa board / workspace.
  // `resolveNotificationLink` byId satırının tüm gerekli alanlarını (payload,
  // workspaceId/boardId/cardId) içerir; hedef yoksa buton gizlenir.
  const targetLink = resolveNotificationLink(notification);
  const goLabel = payload.cardId
    ? copy.goToCard
    : payload.boardId
      ? copy.goToBoard
      : copy.goToTarget;

  const rawActivity = useMemo(
    () => stringify(notification.activityEventPayload),
    [notification.activityEventPayload],
  );
  const rawNotification = useMemo(() => stringify(notification.payload), [notification.payload]);

  return (
    <article className="space-y-6">
      <NotificationMarkRead notificationId={notification.id} readAt={notification.readAt} />

      <header className="flex items-start gap-3">
        {system ? (
          <span className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-full">
            {notificationTypeIcon(notification.type, 'size-5')}
          </span>
        ) : (
          <span className="relative shrink-0">
            <Avatar
              name={actorName}
              image={notification.actorImage ?? payload.actorImage}
              size="lg"
            />
            <span className="bg-card ring-card absolute -right-1 -bottom-1 inline-flex size-6 items-center justify-center rounded-full ring-2">
              {notificationTypeIcon(notification.type, 'size-3.5')}
            </span>
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-foreground text-lg leading-tight font-semibold break-words">
            {actorName}
          </h1>
          <time
            className="text-muted-foreground mt-1 block text-sm"
            dateTime={new Date(notification.createdAt).toISOString()}
            title={formatDateTime(notification.createdAt)}
          >
            {formatRelativeTime(notification.createdAt)} · {formatDateTime(notification.createdAt)}
          </time>
        </div>
      </header>

      {targetLink && (
        <Button
          type="button"
          className="w-full gap-2 sm:w-auto"
          onClick={() => router.push(targetLink)}
        >
          {goLabel}
          <ArrowRightIcon className="size-4" aria-hidden />
        </Button>
      )}

      <Separator />

      <section className="space-y-2" aria-label={copy.actionTitle}>
        <div className="flex items-center gap-2">
          <h2 className="text-foreground text-sm font-semibold">{copy.actionTitle}</h2>
          <Badge variant="secondary" className="gap-1.5 font-normal">
            {notificationTypeIcon(notification.type, 'size-3.5')}
            <code className="text-[11px]">{notification.type}</code>
          </Badge>
        </div>
        <p className="text-foreground text-sm leading-relaxed break-words">
          {activitySummary(notification.type, notification.payload)}
        </p>
      </section>

      <NotificationContext notification={notification} />

      <section className="space-y-2" aria-label={copy.changesTitle}>
        <h2 className="text-foreground text-sm font-semibold">{copy.changesTitle}</h2>
        {changes.length === 0 ? (
          <p className="text-muted-foreground text-sm">{copy.changesEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {changes.map((change, index) => (
              <li key={`${change.label}-${index}`} className="rounded-md border p-2.5 text-xs">
                <p className="text-muted-foreground mb-1.5 flex items-center gap-1.5 font-medium">
                  {change.label}
                  {change.truncated && (
                    <span className="text-muted-foreground/80 text-[10px] uppercase">
                      ({copy.truncatedHint})
                    </span>
                  )}
                </p>
                {change.kind === 'diff' ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="bg-destructive/10 text-destructive rounded px-1.5 py-1 break-words">
                      {change.from || copy.emptyValue}
                    </span>
                    <span className="text-muted-foreground" aria-hidden>
                      →
                    </span>
                    <span className="bg-success/10 text-success rounded px-1.5 py-1 break-words">
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

      <details className="group rounded-md border text-xs">
        <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-medium select-none">
          {copy.rawTitle}
          <ArrowRightIcon
            className="size-3.5 transition-transform group-open:rotate-90"
            aria-hidden
          />
        </summary>
        <div className="space-y-3 border-t p-3">
          <div className="space-y-1">
            <p className="text-muted-foreground text-[11px] font-medium">{copy.rawActivityLabel}</p>
            <pre className="bg-muted max-h-64 overflow-auto rounded-md p-2 text-[11px] leading-relaxed">
              {rawActivity}
            </pre>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-[11px] font-medium">
              {copy.rawNotificationLabel}
            </p>
            <pre className="bg-muted max-h-64 overflow-auto rounded-md p-2 text-[11px] leading-relaxed">
              {rawNotification}
            </pre>
          </div>
        </div>
      </details>
    </article>
  );
}

/**
 * Bağlam satırları (kart / pano / çalışma alanı adları). byId join'lerinden
 * gelir; hiçbiri yoksa bölüm hiç render edilmez (sistem bildiriminde scope
 * olmayabilir).
 */
function NotificationContext({ notification }: { notification: NotificationDetail }) {
  const copy = strings.notificationDetail;
  const rows: Array<{ label: string; value: string }> = [];
  if (notification.cardTitle) rows.push({ label: copy.contextCard, value: notification.cardTitle });
  if (notification.boardTitle)
    rows.push({ label: copy.contextBoard, value: notification.boardTitle });
  if (notification.workspaceName)
    rows.push({ label: copy.contextWorkspace, value: notification.workspaceName });

  if (rows.length === 0) return null;

  return (
    <section className="space-y-2" aria-label={copy.contextTitle}>
      <h2 className="text-foreground text-sm font-semibold">{copy.contextTitle}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-foreground break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Sayfa açılınca bildirim okunmamışsa bir kez `markRead`. `useRef` guard ile
 * React 18 strict-mode çift-mount'ta tek mutation atılır; mutation `onSettled`'da
 * liste + okunmamış sayaç sorgularını tazeler (zil rozeti anında düşsün).
 */
function NotificationMarkRead({
  notificationId,
  readAt,
}: {
  notificationId: string;
  readAt: Date | string | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const markRead = useMutation(
    trpc.notifications.markRead.mutationOptions({
      onSettled: () => {
        void queryClient.invalidateQueries(trpc.notifications.list.infiniteQueryFilter());
        void queryClient.invalidateQueries(trpc.notifications.unreadCount.queryFilter());
      },
    }),
  );
  const fired = useRef(false);

  // notificationId route param (sabit); `fired` ref guard'ı strict-mode
  // çift-mount'ta tek mutation garantiler. `readAt` yalnızca ilk yüklemede
  // okunur — sonradan markRead cache'i tazeleyip readAt'i doldursa bile guard
  // yeniden tetiklemeyi engeller.
  useEffect(() => {
    if (fired.current || readAt != null) return;
    fired.current = true;
    markRead.mutate({ id: notificationId });
  }, [notificationId, readAt, markRead]);

  return null;
}
