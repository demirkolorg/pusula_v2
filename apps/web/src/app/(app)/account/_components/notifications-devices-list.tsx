'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellIcon, MonitorIcon, SmartphoneIcon, TabletIcon } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  toast,
} from '@pusula/ui';
import { formatRelativeTime } from '@/lib/format';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

/**
 * Section 4 — Bildirim ayar ekranı "Push bildirim cihazları" listesi
 * (Faz 10E / DEM-139). Kullanıcının `push_tokens.revoked_at IS NULL`
 * satırlarını listeler ve `revokeById` ile satır iptal eder.
 *
 *  - Veri: `push.tokens.list` (Faz 10B / DEM-136) — `lastUsedAt`,
 *    `createdAt` DESC sırada gelir. Ham token string'i privacy gereği
 *    dönmez (`packages/api/src/routers/push.ts:list` doc-comment).
 *  - Mutation: `push.tokens.revokeById` (Faz 10E / DEM-139) — optimistic
 *    remove + rollback. Mobil client logout akışında hâlâ
 *    `revoke({ token })` kullanır; web UI elindeki anahtar `id`'dir.
 *  - Empty state: Faz 7 mobile aktivasyonu yokken token=[] beklenen
 *    davranış; `BellIcon` rozeti + ipucu metniyle gösterilir
 *    (§13.9 NotificationCenter empty pattern'iyle simetrik).
 *
 * Detay: `docs/architecture/15-bildirim-ayar-ekrani.md` §15.3 Section 4.
 */

/**
 * `push.tokens.list` row tipi — DB `platform` kolonu `text` + CHECK constraint
 * olduğu için Drizzle inference `string` döner. Runtime'da daima üç değerden
 * biri (`packages/db/src/schema/notifications.ts:179` `push_tokens_platform_check`),
 * UI tarafında daraltarak güvenli switch + index erişimi sağlıyoruz.
 */
type PushTokenPlatform = 'ios' | 'android' | 'web';

type PushTokenRow = {
  id: string;
  platform: string;
  deviceName: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

function asPlatform(value: string): PushTokenPlatform {
  return value === 'ios' || value === 'android' ? value : 'web';
}

function pickPlatformIcon(platform: PushTokenPlatform) {
  switch (platform) {
    case 'ios':
      return SmartphoneIcon;
    case 'android':
      return TabletIcon;
    case 'web':
    default:
      return MonitorIcon;
  }
}

function fallbackDeviceName(
  deviceName: string | null,
  platform: PushTokenPlatform,
  copy: typeof strings.account.notifications.devices,
): string {
  if (deviceName && deviceName.trim() !== '') return deviceName;
  return copy.unnamedDevice[platform];
}

export function NotificationsDevicesList() {
  const copy = strings.account.notifications.devices;
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const listQueryFilter = useMemo(() => trpc.push.tokens.list.queryFilter(), [trpc]);
  const devicesQuery = useQuery(trpc.push.tokens.list.queryOptions());

  const revoke = useMutation(
    trpc.push.tokens.revokeById.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(listQueryFilter);
        const previous = queryClient.getQueryData<PushTokenRow[]>(listQueryFilter.queryKey);
        if (previous) {
          queryClient.setQueryData<PushTokenRow[]>(
            listQueryFilter.queryKey,
            previous.filter((row) => row.id !== input.id),
          );
        }
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context && 'previous' in context && context.previous !== undefined) {
          queryClient.setQueryData(listQueryFilter.queryKey, context.previous);
        }
        toast.error(copy.revokeError);
      },
      onSettled: () => {
        void queryClient.invalidateQueries(listQueryFilter);
      },
    }),
  );

  const devices = devicesQuery.data ?? [];
  const isLoading = devicesQuery.isPending;
  const isError = devicesQuery.isError;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <SmartphoneIcon aria-hidden className="text-muted-foreground size-4" />
          <CardTitle>{copy.title}</CardTitle>
        </div>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <ul className="divide-border divide-y" aria-busy="true" aria-label={copy.loading}>
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <div className="bg-muted size-10 shrink-0 animate-pulse rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="bg-muted h-3 w-1/3 animate-pulse rounded" />
                  <div className="bg-muted h-2 w-1/2 animate-pulse rounded" />
                </div>
              </li>
            ))}
          </ul>
        )}
        {!isLoading && isError && <p className="text-destructive text-sm">{copy.loadFailed}</p>}
        {!isLoading && !isError && devices.length === 0 && (
          <EmptyState
            icon={<BellIcon aria-hidden className="size-8" />}
            message={
              <span className="flex flex-col items-center gap-1">
                <span className="text-foreground text-sm font-medium">{copy.emptyTitle}</span>
                <span>{copy.emptyBody}</span>
              </span>
            }
          />
        )}
        {!isLoading && !isError && devices.length > 0 && (
          <ul className="divide-border divide-y">
            {devices.map((device) => {
              const platform = asPlatform(device.platform);
              const Icon = pickPlatformIcon(platform);
              const displayName = fallbackDeviceName(device.deviceName, platform, copy);
              const lastSeen = device.lastUsedAt ?? device.createdAt;
              const lastSeenLabel = copy.lastUsed.replace(
                '{time}',
                formatRelativeTime(lastSeen),
              );
              const isPending = revoke.isPending && revoke.variables?.id === device.id;
              return (
                <li
                  key={device.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <Icon aria-hidden className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium" title={displayName}>
                        {displayName}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        <span>{copy.platform[platform]}</span>
                        <span aria-hidden> · </span>
                        <span>{lastSeenLabel}</span>
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => revoke.mutate({ id: device.id })}
                    aria-label={copy.removeAriaLabel.replace('{device}', displayName)}
                    className="shrink-0"
                  >
                    {isPending ? copy.removing : copy.remove}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
