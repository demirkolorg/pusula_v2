'use client';

/**
 * Card-detail snooze dropdown — Faz 10H (DEM-142).
 *
 * Card modal header'ındaki bildirim ikonunun arkasındaki dropdown:
 *   - Snooze yokken `BellIcon` + "Bildirimleri sustur" tooltip.
 *   - Snooze aktifken `BellOffIcon` + kalan süreyi tooltip + label gösterir.
 *
 * Aksiyonlar (`notifications.preferences.snooze` mutation):
 *   1 saatlik / 4 saatlik / 1 günlük / 1 haftalık / Belirli tarihe kadar…
 *   ───
 *   Susturmayı kaldır (yalnız snooze aktifken görünür)
 *
 * Optimistic UI: `setQueryData` ile `preferences.get({ cardId })` cache'i
 * anında güncellenir; hata olursa rollback + toast.error. `until_date`
 * dialog'u native `<input type="datetime-local">` kullanır (shadcn'in
 * resmi DateTimePicker'ı yok ve bu UI küçük).
 *
 * Detay: `docs/architecture/06-bildirim-altyapisi.md` "Snooze (Faz 10H)" +
 * `docs/architecture/15-bildirim-ayar-ekrani.md` §15.4 Section 7.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellIcon, BellOffIcon } from 'lucide-react';
import type { SnoozeDuration } from '@pusula/domain';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
  toast,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { formatRemainingTime } from '@/lib/format';
import { useTRPC } from '@/trpc/client';

type CardDetailSnoozeProps = {
  cardId: string;
  /**
   * Header rengi: cover renkli mod açıkken header ikonu cover rengiyle
   * uyumlu olmalı; aksi halde muted-foreground kullanır. Card modal header
   * `onColored` flag'ini bu prop üzerinden iletir.
   */
  onColored?: boolean;
  /** İkon yanına metin etiketi göster (kart modal header — kompakt yerine geniş varyant). */
  showLabel?: boolean;
};

/** Snooze aktif mi — `mute_until` future ise. tRPC superjson Date olarak teslim eder. */
function isSnoozeActive(value: Date | null | undefined): value is Date {
  if (value == null) return false;
  return value.getTime() > Date.now();
}

export function CardDetailSnooze({
  cardId,
  onColored = false,
  showLabel = false,
}: CardDetailSnoozeProps) {
  const copy = strings.account.notifications.snooze;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [untilDateOpen, setUntilDateOpen] = useState(false);
  const [untilDateValue, setUntilDateValue] = useState('');
  const [untilDateError, setUntilDateError] = useState<string | null>(null);

  const getQueryFilter = useMemo(
    () => trpc.notifications.preferences.get.queryFilter({ cardId }),
    [trpc, cardId],
  );

  const preferenceQuery = useQuery(
    trpc.notifications.preferences.get.queryOptions({ cardId }),
  );

  const muteUntil = preferenceQuery.data?.muteUntil ?? null;
  const active = isSnoozeActive(muteUntil);
  // DEM-174 — `formatRemainingTime` doğal Türkçe geri sayım verir ("3 gün
  // kaldı"); eski `formatRelativeTime` "3 gün sonra" döndürüp "Kalan:" prefix'i
  // ile birlikte bozuk "Kalan: 3 gün sonra" ifadesi üretiyordu.
  const remainingLabel = active && muteUntil ? formatRemainingTime(muteUntil) : '';

  const snooze = useMutation(
    trpc.notifications.preferences.snooze.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(getQueryFilter);
        // setQueryData generic'ini KASITLI vermiyoruz: tRPC `preferences.get`
        // için inferred Updater type'ı `emailMode: string` (required) ister;
        // shared `PreferenceGetData` tipinde `emailMode` optional yapıldığı
        // için generic'i explicit verirsek çakışıyor (paralel DEM-141
        // gevşemesi). Inference yeterli — type-safe kalır.
        const previous = queryClient.getQueryData(getQueryFilter.queryKey);
        const untilDate = input.untilDate instanceof Date ? input.untilDate : undefined;
        const optimisticUntil = computeOptimisticUntil(input.duration, untilDate);
        queryClient.setQueryData(getQueryFilter.queryKey, (old) => ({
          muteLevel: old?.muteLevel ?? 'none',
          mentionOnly: old?.mentionOnly ?? false,
          pushEnabled: old?.pushEnabled ?? true,
          emailEnabled: old?.emailEnabled ?? true,
          quietFrom: old?.quietFrom ?? null,
          quietTo: old?.quietTo ?? null,
          quietTimezone: old?.quietTimezone ?? null,
          // Faz 10G (DEM-141) — `emailMode` global tercih satırında anlamlı,
          // kart-scope satırında DB default'u (`'instant'`) olarak korunur.
          // Optimistic veride var olan değeri ya da default'u taşıyoruz.
          emailMode: old?.emailMode ?? 'instant',
          muteUntil: optimisticUntil,
        }));
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context && 'previous' in context) {
          queryClient.setQueryData(getQueryFilter.queryKey, context.previous);
        }
        toast.error(copy.snoozeError);
      },
      onSettled: () => {
        void queryClient.invalidateQueries(getQueryFilter);
        // Aktif snooze listesi (`AccountTabs` Section 7) `preferences.list()`
        // üzerinden render eder — yeni snooze sonrası invalidate edilmeli.
        void queryClient.invalidateQueries(
          trpc.notifications.preferences.list.queryFilter(),
        );
      },
    }),
  );

  const unsnooze = useMutation(
    trpc.notifications.preferences.unsnooze.mutationOptions({
      onMutate: async () => {
        await queryClient.cancelQueries(getQueryFilter);
        const previous = queryClient.getQueryData(getQueryFilter.queryKey);
        if (previous) {
          queryClient.setQueryData(getQueryFilter.queryKey, {
            ...previous,
            muteUntil: null,
          });
        }
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context && 'previous' in context) {
          queryClient.setQueryData(getQueryFilter.queryKey, context.previous);
        }
        toast.error(copy.unsnoozeError);
      },
      onSettled: () => {
        void queryClient.invalidateQueries(getQueryFilter);
        void queryClient.invalidateQueries(
          trpc.notifications.preferences.list.queryFilter(),
        );
      },
    }),
  );

  const triggerLabel = active ? `${copy.button} · ${remainingLabel}` : copy.button;

  const submitDuration = (duration: SnoozeDuration) => {
    snooze.mutate({ cardId, duration, clientMutationId: crypto.randomUUID() });
  };

  const handleUntilDateSubmit = () => {
    setUntilDateError(null);
    if (!untilDateValue) {
      setUntilDateError(copy.untilDateInvalid);
      return;
    }
    const date = new Date(untilDateValue);
    const now = Date.now();
    const oneYearLater = now + 365 * 24 * 60 * 60 * 1000;
    if (Number.isNaN(date.getTime()) || date.getTime() <= now || date.getTime() > oneYearLater) {
      setUntilDateError(copy.untilDateInvalid);
      return;
    }
    snooze.mutate({
      cardId,
      duration: 'until_date',
      untilDate: date,
      clientMutationId: crypto.randomUUID(),
    });
    setUntilDateOpen(false);
    setUntilDateValue('');
  };

  // Native datetime-local için minimum değer (şimdiyi geçmiş seçimi engellemek
  // için input attribute'u). Saniye taşıma yok, milisaniye taşıma yok.
  const datetimeMin = useMemo(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  const Icon = active ? BellOffIcon : BellIcon;

  return (
    <TooltipProvider delayDuration={150}>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={triggerLabel}
                disabled={preferenceQuery.isPending || snooze.isPending || unsnooze.isPending}
                data-snooze-active={active ? 'true' : undefined}
                className={cn(
                  'inline-flex h-7 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-4',
                  showLabel ? 'gap-1.5 px-2 text-xs' : 'w-7',
                  onColored
                    ? 'text-current hover:bg-current/15'
                    : active
                      ? 'text-foreground hover:bg-accent'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon aria-hidden />
                {showLabel ? (
                  <span className="truncate">
                    {active ? `${copy.button} · ${remainingLabel}` : copy.button}
                  </span>
                ) : null}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            {active ? remainingLabel : copy.button}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem
            disabled={snooze.isPending}
            onSelect={(e) => {
              e.preventDefault();
              submitDuration('1h');
            }}
          >
            {copy.durations['1h']}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={snooze.isPending}
            onSelect={(e) => {
              e.preventDefault();
              submitDuration('4h');
            }}
          >
            {copy.durations['4h']}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={snooze.isPending}
            onSelect={(e) => {
              e.preventDefault();
              submitDuration('1d');
            }}
          >
            {copy.durations['1d']}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={snooze.isPending}
            onSelect={(e) => {
              e.preventDefault();
              submitDuration('1w');
            }}
          >
            {copy.durations['1w']}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={snooze.isPending}
            onSelect={(e) => {
              e.preventDefault();
              setUntilDateOpen(true);
            }}
          >
            {copy.durations.untilDate}
          </DropdownMenuItem>
          {active && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={unsnooze.isPending}
                onSelect={(e) => {
                  e.preventDefault();
                  unsnooze.mutate({ cardId, clientMutationId: crypto.randomUUID() });
                }}
              >
                {copy.unsnooze}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={untilDateOpen} onOpenChange={setUntilDateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.untilDateDialogTitle}</DialogTitle>
            <DialogDescription>{copy.untilDateDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="card-snooze-until-date">{copy.untilDateLabel}</Label>
            <Input
              id="card-snooze-until-date"
              type="datetime-local"
              min={datetimeMin}
              value={untilDateValue}
              onChange={(e) => {
                setUntilDateValue(e.target.value);
                setUntilDateError(null);
              }}
              aria-invalid={untilDateError ? true : undefined}
              aria-describedby={untilDateError ? 'card-snooze-until-error' : undefined}
            />
            {untilDateError ? (
              <p id="card-snooze-until-error" className="text-destructive text-xs">
                {untilDateError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setUntilDateOpen(false);
                setUntilDateValue('');
                setUntilDateError(null);
              }}
              disabled={snooze.isPending}
            >
              {copy.untilDateCancel}
            </Button>
            <Button
              type="button"
              onClick={handleUntilDateSubmit}
              disabled={snooze.isPending || !untilDateValue}
            >
              {copy.untilDateSubmit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

/**
 * Optimistic snooze bitiş zamanı: server'la aynı duration mantığı, client
 * saatiyle hesaplanır (UI'da anlık güncelleme için). Server her zaman kendi
 * `Date.now()` ile yeniden hesaplar; küçük client-server saat farkı server
 * sonucu cache'e yazılınca düzelir.
 */
function computeOptimisticUntil(duration: SnoozeDuration, untilDate?: Date): Date {
  const now = Date.now();
  switch (duration) {
    case '1h':
      return new Date(now + 60 * 60 * 1000);
    case '4h':
      return new Date(now + 4 * 60 * 60 * 1000);
    case '1d':
      return new Date(now + 24 * 60 * 60 * 1000);
    case '1w':
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
    case 'until_date':
      return untilDate instanceof Date ? untilDate : new Date(now + 60 * 60 * 1000);
  }
}
