'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailIcon } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
  toast,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import {
  PREFERENCE_DEFAULTS,
  type EmailDigestMode,
  type PreferenceGetData,
} from './notifications-shared';

const DIGEST_OPTIONS: ReadonlyArray<{ value: EmailDigestMode; labelKey: keyof typeof strings.account.notifications.digest }> = [
  { value: 'instant', labelKey: 'instant' },
  { value: 'hourly_digest', labelKey: 'hourly' },
  { value: 'daily_digest', labelKey: 'daily' },
  { value: 'off', labelKey: 'off' },
];

const EMAIL_DIGEST_MODE_VALUES = new Set<EmailDigestMode>([
  'instant',
  'hourly_digest',
  'daily_digest',
  'off',
]);

function isEmailDigestMode(value: unknown): value is EmailDigestMode {
  return typeof value === 'string' && EMAIL_DIGEST_MODE_VALUES.has(value as EmailDigestMode);
}

/**
 * Section 6 — Bildirim ayar ekranı (Faz 10G / DEM-141). Global default
 * `notification_preferences` satırının `email_mode` alanını okur ve
 * günceller. 4 seçenek (instant / hourly_digest / daily_digest / off);
 * mute-bypass tipler (mention + davetler) `bypassNote` ile sabit anlık
 * gönderim disiplinini açıklar.
 *
 * Optimistic UI: `onMutate` get cache'ini set eder, `onError` rollback,
 * `onSettled` invalidates BOTH `get` (kendi satırı) ve `list` (Section 3
 * scope ağacı — global default ağaçta görünmese de upsert sonrası
 * tutarlılık için temizlenir).
 *
 * Detay: `docs/architecture/15-bildirim-ayar-ekrani.md` §15.4 Section 6 +
 * §15.5 optimistic pattern + §15.7 a11y.
 */
export function NotificationsDigestForm() {
  const copy = strings.account.notifications;
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

  const upsert = useMutation(
    trpc.notifications.preferences.upsert.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(getQueryFilter);
        const previous = queryClient.getQueryData<PreferenceGetData>(getQueryFilter.queryKey);
        const base = previous ?? PREFERENCE_DEFAULTS;
        queryClient.setQueryData<PreferenceGetData>(getQueryFilter.queryKey, {
          ...base,
          emailMode: (input.emailMode ?? base.emailMode) as EmailDigestMode,
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

  const effective = preferenceQuery.data ?? PREFERENCE_DEFAULTS;
  const isLoading = preferenceQuery.isPending;
  // `effective.emailMode` backend `text` column'undan geldiği için
  // `EmailDigestMode | string` daraltılmış tip taşıyor; izinli set'e
  // narrow'luyoruz, beklenmedik değerlerde varsayılan `'instant'`.
  const selected: EmailDigestMode = isEmailDigestMode(effective.emailMode)
    ? effective.emailMode
    : 'instant';

  const submit = (mode: EmailDigestMode) => {
    if (mode === selected) return;
    upsert.mutate({
      // Section 1 / 2 alanlarını mevcut değerleriyle taşı — backend
      // upsert tüm tercih alanlarını birlikte yazar; sadece emailMode
      // değişti diye diğerleri varsayılana düşmesin.
      muteLevel: effective.muteLevel,
      mentionOnly: effective.mentionOnly,
      pushEnabled: effective.pushEnabled,
      emailEnabled: effective.emailEnabled,
      emailMode: mode,
      clientMutationId: crypto.randomUUID(),
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MailIcon aria-hidden className="text-muted-foreground size-4" />
          <CardTitle>{copy.digest.title}</CardTitle>
        </div>
        <CardDescription>{copy.digest.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{copy.loading}</p>
        ) : (
          <>
            <RadioGroup
              value={selected}
              onValueChange={(value) => submit(value as EmailDigestMode)}
              disabled={upsert.isPending}
              aria-label={copy.digest.title}
              className="space-y-2"
            >
              {DIGEST_OPTIONS.map((option) => {
                const id = `notifications-digest-${option.value}`;
                return (
                  <div key={option.value} className="flex items-center gap-2">
                    <RadioGroupItem value={option.value} id={id} />
                    <Label htmlFor={id} className="font-normal">
                      {copy.digest[option.labelKey]}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
            <p className="text-muted-foreground text-xs">{copy.digest.bypassNote}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
