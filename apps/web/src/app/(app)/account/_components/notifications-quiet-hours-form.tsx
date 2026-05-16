'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoonStarIcon } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { PREFERENCE_DEFAULTS, type PreferenceGetData } from './notifications-shared';

/**
 * Section 5 — sessiz saatler (Faz 10F / DEM-140). Global `notification_
 * preferences` satırına quiet-hours penceresi yazar; backend worker'ları
 * (email + push) bu pencerede non-bypass kanalları susturur.
 *
 * UI sözleşmesi:
 *  - Toggle OFF → triplet `null` (pencere yok). Form alanları gizlenir.
 *  - Toggle ON  → varsayılan değerleri yerleştir (23:00 / 07:00 / `Intl`
 *    cihaz timezone'u) ve hemen kaydet — kullanıcı zaman seçmek için
 *    formla etkileşmek zorunda kalmasın.
 *  - Time / timezone değişimleri `onBlur` / `onValueChange` ile upsert
 *    tetikler (debounce yok; her commit anlık).
 *
 * Optimistic UI: aynı global `preferences.get` cache'ini paylaşır;
 * NotificationsChannelsForm ile çakışmamak için mutation her zaman tam
 * tercih satırını yazar (channel + mute level alanlarını mevcut effective
 * değerden taşır). Hata → snapshot rollback + toast.
 *
 * Detay: `docs/architecture/15-bildirim-ayar-ekrani.md` §15.4 Section 5 +
 * `docs/architecture/06-bildirim-altyapisi.md` "Quiet hours".
 */

/**
 * Section'da göstereceğimiz timezone seçenekleri. Tam IANA listesi çok büyük
 * ve UI için gereksiz; başlangıçta Türkiye + sık kullanılan bölgeler. UI dili
 * Türkçe — `display` zaten lokalize. ICU `Intl.DateTimeFormat` kabul ettiği
 * IANA id'leri `value` alanında tutulur; tRPC `ianaTimezoneSchema` doğrular.
 */
const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; display: string }> = [
  { value: 'Europe/Istanbul', display: 'Türkiye (Europe/Istanbul)' },
  { value: 'Europe/London', display: 'Londra (Europe/London)' },
  { value: 'Europe/Berlin', display: 'Berlin (Europe/Berlin)' },
  { value: 'Europe/Paris', display: 'Paris (Europe/Paris)' },
  { value: 'America/New_York', display: 'New York (America/New_York)' },
  { value: 'America/Los_Angeles', display: 'Los Angeles (America/Los_Angeles)' },
  { value: 'Asia/Tokyo', display: 'Tokyo (Asia/Tokyo)' },
  { value: 'Asia/Dubai', display: 'Dubai (Asia/Dubai)' },
  { value: 'Etc/UTC', display: 'UTC (Etc/UTC)' },
];

const DEFAULT_FROM = '23:00';
const DEFAULT_TO = '07:00';

/**
 * Browser local timezone — `Intl.DateTimeFormat().resolvedOptions().timeZone`
 * istemcide her zaman dolu; yine de garantiye almak için fallback ekliyoruz
 * (Node-side SSR'de geçersiz olabilir, ama bu component `'use client'`).
 */
function resolveBrowserTimezone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && typeof detected === 'string') return detected;
  } catch {
    // fall through
  }
  return 'Europe/Istanbul';
}

function pickDefaultTimezone(preferred: string | null): string {
  // Eğer kullanıcının daha önce kaydettiği bir zaman dilimi varsa onu koru.
  if (preferred) return preferred;
  const browser = resolveBrowserTimezone();
  // Seçenek listesinde varsa direkt kullan; yoksa Istanbul'a düşür (validator
  // her ICU-tanıdığı id'yi kabul etse de UI Select'i sınırlı bir liste sunar).
  if (TIMEZONE_OPTIONS.some((tz) => tz.value === browser)) return browser;
  return 'Europe/Istanbul';
}

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
function isValidHHMM(value: string): boolean {
  return HHMM_REGEX.test(value);
}

export function NotificationsQuietHoursForm() {
  const copy = strings.account.notifications;
  const quietCopy = copy.quiet;
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const getQueryFilter = useMemo(
    () => trpc.notifications.preferences.get.queryFilter({}),
    [trpc],
  );
  const listQueryFilter = useMemo(
    () => trpc.notifications.preferences.list.queryFilter(),
    [trpc],
  );

  const preferenceQuery = useQuery(trpc.notifications.preferences.get.queryOptions({}));
  const effective = preferenceQuery.data ?? PREFERENCE_DEFAULTS;

  const hasWindow =
    effective.quietFrom !== null &&
    effective.quietTo !== null &&
    effective.quietTimezone !== null;

  // Yerel form state — backend gelene kadar veya kullanıcı yazarken arasında
  // tutarlı kalsın. preferenceQuery yeniden fetch geldiğinde reset edilir.
  const [fromValue, setFromValue] = useState<string>(effective.quietFrom ?? DEFAULT_FROM);
  const [toValue, setToValue] = useState<string>(effective.quietTo ?? DEFAULT_TO);
  const [timezone, setTimezone] = useState<string>(
    effective.quietTimezone ?? pickDefaultTimezone(null),
  );

  useEffect(() => {
    if (!preferenceQuery.isSuccess) return;
    if (effective.quietFrom) setFromValue(effective.quietFrom);
    if (effective.quietTo) setToValue(effective.quietTo);
    if (effective.quietTimezone) setTimezone(effective.quietTimezone);
  }, [
    preferenceQuery.isSuccess,
    effective.quietFrom,
    effective.quietTo,
    effective.quietTimezone,
  ]);

  const upsert = useMutation(
    trpc.notifications.preferences.upsert.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(getQueryFilter);
        const previous = queryClient.getQueryData<PreferenceGetData>(getQueryFilter.queryKey);
        queryClient.setQueryData<PreferenceGetData>(getQueryFilter.queryKey, {
          muteLevel: input.muteLevel,
          mentionOnly: input.mentionOnly,
          pushEnabled: input.pushEnabled,
          emailEnabled: input.emailEnabled,
          quietFrom: input.quietFrom ?? null,
          quietTo: input.quietTo ?? null,
          quietTimezone: input.quietTimezone ?? null,
          // Faz 10H (DEM-142) paralel iş `muteUntil` alanını eklediğinden
          // tip uyumu için mevcut değeri taşı (snooze kart-scope yazıyor,
          // global satırın muteUntil'ı yoktur ama bu cache aynı satırdır).
          muteUntil: previous?.muteUntil ?? null,
          // Faz 10G (DEM-141) — `emailMode` global tercih satırında anlamlı;
          // bu form digest mod'una dokunmaz, mevcut değeri korur.
          emailMode: previous?.emailMode ?? 'instant',
        });
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context && 'previous' in context) {
          queryClient.setQueryData(getQueryFilter.queryKey, context.previous);
        }
        toast.error(copy.errors.saveFailed);
      },
      onSettled: () => {
        void queryClient.invalidateQueries(getQueryFilter);
        void queryClient.invalidateQueries(listQueryFilter);
      },
    }),
  );

  const submit = (
    next: {
      quietFrom: string | null;
      quietTo: string | null;
      quietTimezone: string | null;
    },
  ) => {
    upsert.mutate({
      // Mevcut tercih satırının diğer alanlarını aynen taşı; quiet hours
      // mutation'ı channel/mute ayarlarını sıfırlamasın.
      muteLevel: effective.muteLevel,
      mentionOnly: effective.mentionOnly,
      pushEnabled: effective.pushEnabled,
      emailEnabled: effective.emailEnabled,
      quietFrom: next.quietFrom,
      quietTo: next.quietTo,
      quietTimezone: next.quietTimezone,
      clientMutationId: crypto.randomUUID(),
    });
  };

  const handleToggle = (value: boolean) => {
    if (value) {
      // Toggle açıldı → yerel defaultlarla hemen kaydet (effective dolu değilse).
      const nextFrom = effective.quietFrom ?? DEFAULT_FROM;
      const nextTo = effective.quietTo ?? DEFAULT_TO;
      const nextTz = effective.quietTimezone ?? pickDefaultTimezone(null);
      setFromValue(nextFrom);
      setToValue(nextTo);
      setTimezone(nextTz);
      submit({ quietFrom: nextFrom, quietTo: nextTo, quietTimezone: nextTz });
    } else {
      submit({ quietFrom: null, quietTo: null, quietTimezone: null });
    }
  };

  const handleFromCommit = (value: string) => {
    if (!isValidHHMM(value)) return;
    setFromValue(value);
    if (value === toValue) {
      toast.error(quietCopy.invalidWindow);
      return;
    }
    submit({ quietFrom: value, quietTo: toValue, quietTimezone: timezone });
  };

  const handleToCommit = (value: string) => {
    if (!isValidHHMM(value)) return;
    setToValue(value);
    if (value === fromValue) {
      toast.error(quietCopy.invalidWindow);
      return;
    }
    submit({ quietFrom: fromValue, quietTo: value, quietTimezone: timezone });
  };

  const handleTimezoneCommit = (value: string) => {
    setTimezone(value);
    submit({ quietFrom: fromValue, quietTo: toValue, quietTimezone: value });
  };

  const previewText = quietCopy.preview
    .replace('{from}', fromValue)
    .replace('{to}', toValue)
    .replace('{tz}', timezone);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MoonStarIcon aria-hidden className="text-muted-foreground size-4" />
          <CardTitle>{quietCopy.title}</CardTitle>
        </div>
        <CardDescription>{quietCopy.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <Label htmlFor="quiet-hours-toggle" className="font-normal">
              {quietCopy.toggleLabel}
            </Label>
            <p className="text-muted-foreground text-xs">{quietCopy.toggleHint}</p>
          </div>
          <Switch
            id="quiet-hours-toggle"
            checked={hasWindow}
            disabled={preferenceQuery.isPending || upsert.isPending}
            onCheckedChange={handleToggle}
            aria-label={quietCopy.toggleLabel}
          />
        </div>

        {hasWindow && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="quiet-hours-from">{quietCopy.from}</Label>
              <input
                id="quiet-hours-from"
                type="time"
                value={fromValue}
                disabled={upsert.isPending}
                onChange={(event) => setFromValue(event.target.value)}
                onBlur={(event) => handleFromCommit(event.target.value)}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quiet-hours-to">{quietCopy.to}</Label>
              <input
                id="quiet-hours-to"
                type="time"
                value={toValue}
                disabled={upsert.isPending}
                onChange={(event) => setToValue(event.target.value)}
                onBlur={(event) => handleToCommit(event.target.value)}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quiet-hours-timezone">{quietCopy.timezone}</Label>
              <Select
                value={timezone}
                onValueChange={handleTimezoneCommit}
                disabled={upsert.isPending}
              >
                <SelectTrigger id="quiet-hours-timezone" aria-label={quietCopy.timezone}>
                  <SelectValue placeholder={quietCopy.timezonePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.display}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {hasWindow && (
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs">{previewText}</p>
            <p className="text-muted-foreground text-xs">{quietCopy.bypassNote}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
