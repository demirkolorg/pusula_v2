'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, MinusIcon } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  MATRIX_GROUPS,
  MATRIX_ROWS,
  NOTIFICATION_CHANNEL_KEYS,
  PREFERENCE_DEFAULTS,
  type ChannelCellState,
  type MatrixGroupKey,
  type MatrixRow,
  type NotificationChannelKey,
  type PreferenceGetData,
} from './notifications-shared';

/**
 * Section 2 — Tip × Kanal matrisi (Faz 10D / DEM-138).
 *
 * Kapsam kararı (10.0 önce-belge — Seçenek A): Backend `notification_preferences`
 * şeması global `email_enabled` / `push_enabled` flag tutar; tip-bazlı kayıt
 * yok. UI matrix'teki Switch'ler global flag'i toggle eder; her satırda
 * `typeToggleHint` tooltip'iyle "tip-bazlı yakında" not düşer. Mute-bypass
 * tipler her zaman ✓ disabled gösterilir; rule-engine'de bu tipler için kanal
 * kararı zaten override edilemez (`notification-rules.ts:418`).
 *
 * Genel Email/Push (Section 1) kapatılınca ilgili sütunda tüm Switch'ler
 * disabled + tooltip "Önce genel ...'ı aç". Toplu işlem butonları üstte:
 * "Hepsini aç" / "Hepsini kapat" / "Sadece e-postayı kapat" tek mutation
 * gönderir.
 *
 * Detay: `docs/architecture/15-bildirim-ayar-ekrani.md` §15.3 Section 2.
 */
export function NotificationsTypeMatrix() {
  const copy = strings.account.notifications;
  const matrixCopy = copy.matrix;
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
          // Faz 10F (DEM-140) — kanal mutasyonu quiet-hours alanlarını ezmesin.
          quietFrom: input.quietFrom ?? null,
          quietTo: input.quietTo ?? null,
          quietTimezone: input.quietTimezone ?? null,
          // Faz 10H (DEM-142) — snooze global'de yazılmaz; tip uyumu için
          // mevcut değeri taşı.
          muteUntil: previous?.muteUntil ?? null,
          // Faz 10G (DEM-141) — matrix sadece global kanal flag'lerini
          // okur; digest mod'una dokunmaz, mevcut değeri korur.
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

  const submitChannels = (next: { emailEnabled: boolean; pushEnabled: boolean }) => {
    upsert.mutate({
      muteLevel: effective.muteLevel,
      mentionOnly: effective.mentionOnly,
      emailEnabled: next.emailEnabled,
      pushEnabled: next.pushEnabled,
      // Faz 10F: aynı global tercih satırını paylaşan QuietHoursForm'un
      // değerlerini ezmeyelim.
      quietFrom: effective.quietFrom,
      quietTo: effective.quietTo,
      quietTimezone: effective.quietTimezone,
      clientMutationId: crypto.randomUUID(),
    });
  };

  const rowsByGroup = useMemo(() => groupMatrixRows(MATRIX_ROWS), []);

  return (
    <TooltipProvider delayDuration={150}>
      <Card>
        <CardHeader>
          <CardTitle>{matrixCopy.title}</CardTitle>
          <CardDescription>{matrixCopy.typeToggleHint}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isLoading || upsert.isPending}
              onClick={() =>
                submitChannels({ emailEnabled: true, pushEnabled: true })
              }
            >
              {matrixCopy.bulkAll}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isLoading || upsert.isPending}
              onClick={() =>
                submitChannels({ emailEnabled: false, pushEnabled: false })
              }
            >
              {matrixCopy.bulkNone}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isLoading || upsert.isPending}
              onClick={() =>
                submitChannels({
                  emailEnabled: false,
                  pushEnabled: effective.pushEnabled,
                })
              }
            >
              {matrixCopy.bulkNoEmail}
            </Button>
          </div>

          {isLoading ? (
            <p className="text-muted-foreground text-sm">{copy.loading}</p>
          ) : (
            <div role="table" aria-label={matrixCopy.title} className="space-y-4">
              <MatrixHeader />
              {MATRIX_GROUPS.map((groupKey) => {
                const groupRows = rowsByGroup[groupKey];
                if (!groupRows || groupRows.length === 0) return null;
                return (
                  <section key={groupKey} className="space-y-1">
                    <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                      {matrixCopy.groups[groupKey]}
                    </h3>
                    <div role="rowgroup" className="divide-border divide-y">
                      {groupRows.map((row) => (
                        <MatrixRowView
                          key={row.type}
                          row={row}
                          effective={effective}
                          disabled={upsert.isPending}
                          onToggleChannel={(channel) =>
                            submitChannels({
                              emailEnabled:
                                channel === 'email'
                                  ? !effective.emailEnabled
                                  : effective.emailEnabled,
                              pushEnabled:
                                channel === 'push'
                                  ? !effective.pushEnabled
                                  : effective.pushEnabled,
                            })
                          }
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

function MatrixHeader() {
  const matrixCopy = strings.account.notifications.matrix;
  const channels = strings.account.notifications.channels;
  const channelLabels: Record<NotificationChannelKey, string> = {
    in_app: channels.inApp,
    email: channels.email,
    push: channels.push,
  };
  return (
    <div
      role="row"
      className="text-muted-foreground grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-1 pb-2 text-xs font-medium uppercase"
    >
      <span role="columnheader" aria-label={matrixCopy.title}>
        &nbsp;
      </span>
      {NOTIFICATION_CHANNEL_KEYS.map((channel) => (
        <span
          key={channel}
          role="columnheader"
          className="w-16 text-center"
        >
          {channelLabels[channel]}
        </span>
      ))}
    </div>
  );
}

type MatrixRowViewProps = {
  row: MatrixRow;
  effective: NonNullable<PreferenceGetData>;
  disabled: boolean;
  onToggleChannel: (channel: 'email' | 'push') => void;
};

function MatrixRowView({ row, effective, disabled, onToggleChannel }: MatrixRowViewProps) {
  const matrixCopy = strings.account.notifications.matrix;
  const typeLabel = matrixCopy.types[row.i18nKey as keyof typeof matrixCopy.types];

  return (
    <div
      role="row"
      className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-2 text-sm"
    >
      <span role="cell" className="truncate" title={typeLabel}>
        {typeLabel}
      </span>
      {NOTIFICATION_CHANNEL_KEYS.map((channel) => {
        const cell = row.channels[channel];
        return (
          <div role="cell" key={channel} className="flex w-16 items-center justify-center">
            <ChannelCell
              cellState={cell}
              type={row.type}
              channel={channel}
              effective={effective}
              disabled={disabled}
              onToggle={() => {
                if (channel === 'email' || channel === 'push') onToggleChannel(channel);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

type ChannelCellProps = {
  cellState: ChannelCellState;
  type: MatrixRow['type'];
  channel: NotificationChannelKey;
  effective: NonNullable<PreferenceGetData>;
  disabled: boolean;
  onToggle: () => void;
};

function ChannelCell({
  cellState,
  type,
  channel,
  effective,
  disabled,
  onToggle,
}: ChannelCellProps) {
  const matrixCopy = strings.account.notifications.matrix;

  if (cellState === 'unavailable') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="text-muted-foreground inline-flex items-center"
            aria-label={matrixCopy.unavailable}
          >
            <MinusIcon aria-hidden className="size-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{matrixCopy.unavailable}</TooltipContent>
      </Tooltip>
    );
  }

  if (cellState === 'mute_bypass') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="text-primary inline-flex items-center"
            aria-label={matrixCopy.muteBypassTooltip}
          >
            <CheckIcon aria-hidden className="size-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{matrixCopy.muteBypassTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  // Cell is `'on'`: actual user-toggleable Switch (currently global flag-bound).
  if (channel === 'in_app') {
    // in_app is always on; never user-toggleable.
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="text-primary inline-flex items-center"
            aria-label={strings.account.notifications.channels.alwaysOnTooltip}
          >
            <CheckIcon aria-hidden className="size-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{strings.account.notifications.channels.alwaysOnTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  const globalChecked = channel === 'email' ? effective.emailEnabled : effective.pushEnabled;
  const globalDisabledReason = !globalChecked
    ? channel === 'email'
      ? matrixCopy.disabledByGlobalEmail
      : matrixCopy.disabledByGlobalPush
    : null;

  // Tip-bazlı kayıt henüz backend'de yok — Switch global flag'i toggle eder;
  // her satırda info tooltip ile durum açıklanır. Genel kanal kapalı ise
  // Switch tıklanamaz (Section 1'den önce açılması beklenir).
  const switchDisabled = disabled || globalDisabledReason !== null;
  const switchEl = (
    <Switch
      id={`matrix-${type}-${channel}`}
      checked={globalChecked}
      disabled={switchDisabled}
      aria-disabled={switchDisabled || undefined}
      aria-label={`${channel} ${type}`}
      onCheckedChange={() => onToggle()}
    />
  );

  if (globalDisabledReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{switchEl}</span>
        </TooltipTrigger>
        <TooltipContent>{globalDisabledReason}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{switchEl}</span>
      </TooltipTrigger>
      <TooltipContent>{matrixCopy.typeToggleHint}</TooltipContent>
    </Tooltip>
  );
}

function groupMatrixRows(rows: readonly MatrixRow[]): Record<MatrixGroupKey, MatrixRow[]> {
  const map = MATRIX_GROUPS.reduce(
    (acc, key) => {
      acc[key] = [];
      return acc;
    },
    {} as Record<MatrixGroupKey, MatrixRow[]>,
  );
  for (const row of rows) map[row.group].push(row);
  return map;
}
