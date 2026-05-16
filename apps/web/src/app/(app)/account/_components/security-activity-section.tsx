'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LaptopIcon, ShieldCheckIcon, SmartphoneIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  toast,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

/**
 * /account "Güvenlik" sekmesi "Bilinen cihazlar" section'ı (Faz 10I — DEM-143).
 * Better Auth `databaseHooks.session.create.after` hook'u her başarılı login'de
 * `auth_known_devices`'a (UA hash + IP /24/48 subnet) parmak izi yazıyor; bu
 * component o satırları listeler ve `auth.devices.revoke` ile cihaza ait
 * Better Auth oturumlarını kapatır. Detay:
 * `docs/architecture/15-bildirim-ayar-ekrani.md` §15.4 Section 8.
 */

type DateLike = string | Date;

function pickIcon(userAgent: string): typeof LaptopIcon {
  const lower = userAgent.toLowerCase();
  if (lower.includes('iphone') || lower.includes('android') || lower.includes('mobile')) {
    return SmartphoneIcon;
  }
  return LaptopIcon;
}

function formatDate(value: DateLike): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function SecurityActivitySection() {
  const copy = strings.account.security.devices;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const devicesQueryFilter = useMemo(() => trpc.auth.devices.list.queryFilter(), [trpc]);

  const devicesQuery = useQuery(trpc.auth.devices.list.queryOptions());

  const revoke = useMutation(
    trpc.auth.devices.revoke.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries(devicesQueryFilter);
        const count = result.revokedSessionCount;
        if (count > 0) {
          toast.success(copy.revokeSuccess.replace('{count}', String(count)));
        }
      },
      onError: () => toast.error(copy.revokeError),
    }),
  );

  const devices = devicesQuery.data ?? [];
  const isLoading = devicesQuery.isPending;
  const isError = devicesQuery.isError;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheckIcon aria-hidden className="text-muted-foreground size-4" />
          <CardTitle>{copy.title}</CardTitle>
        </div>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-muted-foreground text-sm">{copy.loading}</p>}
        {isError && <p className="text-destructive text-sm">{copy.loadFailed}</p>}
        {!isLoading && !isError && devices.length === 0 && (
          <EmptyState
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
              const Icon = pickIcon(device.userAgent);
              return (
                <li
                  key={device.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <Icon
                      aria-hidden
                      className="text-muted-foreground mt-0.5 size-5 shrink-0"
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium" title={device.userAgent}>
                          {device.userAgent}
                        </p>
                        {device.isCurrent && (
                          <Badge variant="secondary" className="shrink-0">
                            {copy.currentBadge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        <span>{copy.location}:</span>{' '}
                        <span className="font-mono">{device.ipSubnet}</span>
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {copy.lastSeen.replace('{date}', formatDate(device.lastSeenAt))}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={device.isCurrent || revoke.isPending}
                    onClick={() => revoke.mutate({ deviceId: device.id })}
                    aria-label={copy.signOutAriaLabel.replace('{device}', device.userAgent)}
                    className="shrink-0"
                  >
                    {revoke.isPending && revoke.variables?.deviceId === device.id
                      ? copy.signingOut
                      : copy.signOut}
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
