'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellIcon, MailIcon, MessageSquareIcon, SmartphoneIcon } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
  Separator,
  Switch,
  toast,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import {
  PREFERENCE_DEFAULTS,
  type MuteLevel,
  type PreferenceGetData,
} from './notifications-shared';

/**
 * Section 1 — Bildirim ayar ekranı (Faz 10D / DEM-138). Global default
 * `notification_preferences` satırını okur ve günceller. UI:
 *   - 📱 in-app  → kapatılamaz, disabled Switch + tooltip
 *   - ✉️  email   → emailEnabled toggle
 *   - 🔔 push    → pushEnabled toggle
 *   - mute level → 3 option RadioGroup (none / mentions_only / all)
 *
 * Optimistic UI: `onMutate` get cache'ini set eder, `onError` rollback,
 * `onSettled` invalidates BOTH `get` (kendi satırı) ve `list` (Section 3
 * scope ağacı; global default ağaçta görünmese de upsert sonrası tutarlılık
 * için temizlenir).
 *
 * Detay: `docs/architecture/15-bildirim-ayar-ekrani.md` §15.3 Section 1 +
 * §15.5 optimistic pattern + §15.7 a11y.
 */
export function NotificationsChannelsForm() {
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
        queryClient.setQueryData<PreferenceGetData>(getQueryFilter.queryKey, {
          muteLevel: input.muteLevel,
          mentionOnly: input.mentionOnly,
          pushEnabled: input.pushEnabled,
          emailEnabled: input.emailEnabled,
          // Faz 10F (DEM-140) — quiet-hours alanları aynı preferences.get
          // satırından okunur; channels form bu alanları gönderdiğinde
          // korumak için optimistic veride de taşır (QuietHoursForm aynı
          // anda farklı bir kısım yazıyor olabilir — narrowing yapmıyoruz).
          quietFrom: input.quietFrom ?? null,
          quietTo: input.quietTo ?? null,
          quietTimezone: input.quietTimezone ?? null,
          // Faz 10H (DEM-142) — snooze global default için anlamlı değil
          // ama tip parlatması için optimistic'e null taşıyoruz; gerçek
          // snooze kart-scope `preferences.get({ cardId })` üzerinden okunur.
          muteUntil: previous?.muteUntil ?? null,
          // Faz 10G (DEM-141) — emailMode digest-form tarafından yönetilir;
          // channels-form sadece push/email/in-app toggle ve mute level değiştirir.
          // Mevcut değeri (varsa) koruyoruz; satır yoksa default `'instant'`.
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

  const effective = preferenceQuery.data ?? PREFERENCE_DEFAULTS;
  const isLoading = preferenceQuery.isPending;

  const submit = (
    next: Partial<{
      muteLevel: MuteLevel;
      mentionOnly: boolean;
      pushEnabled: boolean;
      emailEnabled: boolean;
    }>,
  ) => {
    upsert.mutate({
      muteLevel: next.muteLevel ?? effective.muteLevel,
      mentionOnly: next.mentionOnly ?? effective.mentionOnly,
      pushEnabled: next.pushEnabled ?? effective.pushEnabled,
      emailEnabled: next.emailEnabled ?? effective.emailEnabled,
      // Quiet-hours alanlarını aynen taşı; channel toggle başka section'ı
      // resetlemesin.
      quietFrom: effective.quietFrom,
      quietTo: effective.quietTo,
      quietTimezone: effective.quietTimezone,
      clientMutationId: crypto.randomUUID(),
    });
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BellIcon aria-hidden className="text-muted-foreground size-4" />
            <CardTitle>{copy.channels.title}</CardTitle>
          </div>
          <CardDescription>{copy.channels.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{copy.loading}</p>
          ) : (
            <>
              <div className="space-y-3">
                <ChannelRow
                  icon={<MessageSquareIcon aria-hidden className="text-muted-foreground size-4" />}
                  label={copy.channels.inApp}
                  hint={copy.channels.alwaysOn}
                  rowId="notifications-channel-in-app"
                  checked
                  disabled
                  tooltip={copy.channels.alwaysOnTooltip}
                  onCheckedChange={() => {}}
                />
                <ChannelRow
                  icon={<MailIcon aria-hidden className="text-muted-foreground size-4" />}
                  label={copy.channels.email}
                  rowId="notifications-channel-email"
                  checked={effective.emailEnabled}
                  disabled={upsert.isPending}
                  onCheckedChange={(value) => submit({ emailEnabled: value })}
                />
                <ChannelRow
                  icon={<SmartphoneIcon aria-hidden className="text-muted-foreground size-4" />}
                  label={copy.channels.push}
                  rowId="notifications-channel-push"
                  checked={effective.pushEnabled}
                  disabled={upsert.isPending}
                  onCheckedChange={(value) => submit({ pushEnabled: value })}
                />
              </div>

              <Separator />

              <fieldset className="space-y-3" aria-describedby="mute-bypass-note">
                <legend className="text-sm font-medium">{copy.mute.title}</legend>
                <RadioGroup
                  value={effective.muteLevel}
                  onValueChange={(value) =>
                    submit({ muteLevel: value as MuteLevel })
                  }
                  disabled={upsert.isPending}
                  aria-label={copy.mute.title}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="none" id="mute-none" />
                    <Label htmlFor="mute-none" className="font-normal">
                      {copy.mute.none}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="mentions_only" id="mute-mentions" />
                    <Label htmlFor="mute-mentions" className="font-normal">
                      {copy.mute.mentionsOnly}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="all" id="mute-all" />
                    <Label htmlFor="mute-all" className="font-normal">
                      {copy.mute.all}
                    </Label>
                  </div>
                </RadioGroup>
                <p id="mute-bypass-note" className="text-muted-foreground text-xs">
                  {copy.mute.bypassNote}
                </p>
              </fieldset>
            </>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

type ChannelRowProps = {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  rowId: string;
  checked: boolean;
  disabled?: boolean;
  tooltip?: string;
  onCheckedChange: (value: boolean) => void;
};

function ChannelRow({
  icon,
  label,
  hint,
  rowId,
  checked,
  disabled,
  tooltip,
  onCheckedChange,
}: ChannelRowProps) {
  const switchEl = (
    <Switch
      id={rowId}
      checked={checked}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onCheckedChange={onCheckedChange}
    />
  );
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon}
        <Label htmlFor={rowId} className="font-normal">
          {label}
        </Label>
        {hint ? (
          <span className="text-muted-foreground text-xs">({hint})</span>
        ) : null}
      </div>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* span wrap: disabled Switch'in pointer event'i tooltip'i tetikleyebilsin. */}
            <span className="inline-flex">{switchEl}</span>
          </TooltipTrigger>
          <TooltipContent side="left">{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        switchEl
      )}
    </div>
  );
}
