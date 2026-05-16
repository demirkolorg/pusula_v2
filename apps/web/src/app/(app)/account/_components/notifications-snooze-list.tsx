'use client';

/**
 * Section 7 — Bildirim ayar ekranı "Aktif susturmalar" listesi
 * (Faz 10H / DEM-142). Asıl snooze aksiyonu kart detay dropdown'ında
 * (`card-detail-snooze.tsx`) alınır; bu sekme yalnız listeleme + iptal:
 *
 *   - Veri: `notifications.preferences.list()` — kullanıcının tüm tercih
 *     satırlarını döner; client `cardId IS NOT NULL AND mute_until > now`
 *     filtrelenir (süresi dolmuş satırlar UI'da gösterilmez ama backend'te
 *     audit için silinmez).
 *   - Mutation: `notifications.preferences.unsnooze({ cardId })` —
 *     optimistic remove + rollback + toast.error.
 *   - Empty state: aktif snooze yokken bilgilendirici metin (kart
 *     detayından nasıl snooze edileceğini söyler).
 *
 * Detay: `docs/architecture/15-bildirim-ayar-ekrani.md` §15.4 Section 7.
 */

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOffIcon } from 'lucide-react';
import type { RouterOutputs } from '@pusula/api';
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
import { formatRemainingTime } from '@/lib/format';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

/**
 * `notifications.preferences.list` çıkışındaki satır tipi — server tarafından
 * döndürülen tüm alanları taşır (id, scope, muteLevel, mentionOnly, kanal
 * toggle'ları, quiet-hours, muteUntil, emailMode). UI yalnız `cardId` +
 * `muteUntil` + `scopeLabel`'a bakar; tipi inferred olarak alıyoruz ki
 * TanStack `setQueryData` Updater imzasıyla uyumlu olsun.
 */
type PreferenceListRow = RouterOutputs['notifications']['preferences']['list'][number];

function isActiveSnooze(value: Date | string | null | undefined): value is Date | string {
  if (value == null) return false;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function NotificationsSnoozeList() {
  const copy = strings.account.notifications.snooze;
  const cardLabel = strings.account.notifications.scopes.scopeKind.card;
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const listQueryFilter = useMemo(
    () => trpc.notifications.preferences.list.queryFilter(),
    [trpc],
  );

  const listQuery = useQuery(trpc.notifications.preferences.list.queryOptions());

  const unsnooze = useMutation(
    trpc.notifications.preferences.unsnooze.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(listQueryFilter);
        const previous = queryClient.getQueryData<PreferenceListRow[]>(listQueryFilter.queryKey);
        if (previous) {
          // Optimistic: satırı listeden çıkartmıyoruz; `muteUntil`'i null'lıyoruz
          // ki client filter'ı zaten gizler ama satırın kalan tercih ayarları
          // (kart-scope mute toggle vb.) Section 3 ağacında görünmeye devam etsin.
          queryClient.setQueryData<PreferenceListRow[]>(
            listQueryFilter.queryKey,
            previous.map((row) =>
              row.cardId === input.cardId ? { ...row, muteUntil: null } : row,
            ),
          );
        }
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context && 'previous' in context && context.previous !== undefined) {
          queryClient.setQueryData(listQueryFilter.queryKey, context.previous);
        }
        toast.error(copy.removeError);
      },
      onSettled: (_data, _err, input) => {
        void queryClient.invalidateQueries(listQueryFilter);
        // Kart-scope `get({ cardId })` cache'i de bu satırı tutar; o sorgu
        // sayfada açıksa (kart detayı açıkken) tutarlı kalsın.
        void queryClient.invalidateQueries(
          trpc.notifications.preferences.get.queryFilter({ cardId: input.cardId }),
        );
      },
    }),
  );

  const isLoading = listQuery.isPending;
  const isError = listQuery.isError;
  const rows = listQuery.data ?? [];
  // Aktif snooze filtresi: yalnız kart-scope satırı + `mute_until > now`.
  // `cardId` darlatma için (string)`row.cardId!` alternatif olabilirdi ama
  // çıkış tipini değiştirmeden filtreleme okunabilirliği için narrow tip.
  const activeRows = rows.filter(
    (row) => row.cardId != null && isActiveSnooze(row.muteUntil),
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BellOffIcon aria-hidden className="text-muted-foreground size-4" />
          <CardTitle>{copy.title}</CardTitle>
        </div>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <ul className="divide-border divide-y" aria-busy="true" aria-label={copy.loading}>
            {[0, 1].map((i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <div className="bg-muted size-8 shrink-0 animate-pulse rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="bg-muted h-3 w-1/2 animate-pulse rounded" />
                  <div className="bg-muted h-2 w-1/3 animate-pulse rounded" />
                </div>
              </li>
            ))}
          </ul>
        )}
        {!isLoading && isError && (
          <p className="text-destructive text-sm">{copy.loadFailed}</p>
        )}
        {!isLoading && !isError && activeRows.length === 0 && (
          <EmptyState
            icon={<BellOffIcon aria-hidden className="size-8" />}
            message={<span>{copy.empty}</span>}
          />
        )}
        {!isLoading && !isError && activeRows.length > 0 && (
          <>
            <ul className="divide-border divide-y">
              {activeRows.map((row) => {
                const until = toDateOrNull(row.muteUntil);
                const remainingLabel = until ? formatRemainingTime(until) : '';
                const isPending =
                  unsnooze.isPending && unsnooze.variables?.cardId === row.cardId;
                return (
                  <li
                    key={row.id}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <BellOffIcon
                        aria-hidden
                        className="text-muted-foreground mt-0.5 size-5 shrink-0"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                            {cardLabel}
                          </Badge>
                          <p
                            className="truncate text-sm font-medium"
                            title={row.scopeLabel}
                          >
                            {row.scopeLabel}
                          </p>
                        </div>
                        <p className="text-muted-foreground text-xs">{remainingLabel}</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => {
                        if (!row.cardId) return;
                        unsnooze.mutate({
                          cardId: row.cardId,
                          clientMutationId: crypto.randomUUID(),
                        });
                      }}
                      aria-label={copy.removeAriaLabel.replace('{card}', row.scopeLabel)}
                      className="shrink-0"
                    >
                      {isPending ? copy.removing : copy.remove}
                    </Button>
                  </li>
                );
              })}
            </ul>
            <p className="text-muted-foreground mt-3 text-xs">{copy.bypassNote}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
