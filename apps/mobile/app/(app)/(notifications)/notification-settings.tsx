import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { NotificationDevices } from '@/components/notifications/notification-devices';
import { NotificationQuietHours } from '@/components/notifications/notification-quiet-hours';
import { NotificationScopes } from '@/components/notifications/notification-scopes';
import { NotificationTypeMatrix } from '@/components/notifications/notification-type-matrix';
import { SettingsRow, SettingsSection } from '@/components/notifications/settings-section';
import { RoleSelect } from '@/components/role-select';
import { Text } from '@/components/text';
import { Toggle } from '@/components/toggle';
import {
  useNotificationPreferences,
  type GlobalPreferenceFields,
} from '@/lib/use-notification-preferences';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/provider';

type MuteLevel = 'none' | 'mentions_only' | 'all';

/** Tercih satırı yokken kullanılan rule-engine fallback varsayılanları. */
const PREFERENCE_DEFAULTS: GlobalPreferenceFields = {
  muteLevel: 'none',
  mentionOnly: false,
  pushEnabled: true,
  emailEnabled: true,
  quietFrom: null,
  quietTo: null,
  quietTimezone: null,
};

/**
 * Bildirim ayarları ekranı (Faz 7K) — `(notifications)` stack'inde pushed
 * route; "Bildirimler" sekmesi header'ındaki dişli butonundan açılır.
 *
 * Bölümler (web Faz 10 paritesi, NativeWind'e uyarlı):
 *  - Genel kanallar — global tercihin email/push toggle + sustur seviyesi.
 *  - Bildirim tipleri — tip × kanal referans matrisi (salt-okunur).
 *  - Kapsam ayarları — workspace/board/card override satırları.
 *  - Sessiz saatler — global pencere (aç/kapa + HH:MM saat girişi).
 *  - Cihazlar — anlık bildirim alan aktif cihazlar.
 *
 * Tüm yazmalar optimistic + rollback + `clientMutationId`
 * (`useNotificationPreferences`).
 */
export default function NotificationSettingsScreen() {
  const trpc = useTRPC();
  const header = (
    <Stack.Screen options={{ title: strings.notificationSettings.title }} />
  );

  const preferenceQuery = useQuery(trpc.notifications.preferences.get.queryOptions({}));
  const { saveGlobal, isSavingGlobal } = useNotificationPreferences();

  if (preferenceQuery.isPending) {
    return (
      <>
        {header}
        <LoadingScreen />
      </>
    );
  }
  if (preferenceQuery.isError) {
    return (
      <>
        {header}
        <EmptyState
          icon="alert-triangle"
          title={strings.notificationSettings.loadError}
          description={strings.common.unknownError}
        >
          <View className="w-40">
            <Button
              label={strings.common.retry}
              variant="ghost"
              onPress={() => preferenceQuery.refetch()}
            />
          </View>
        </EmptyState>
      </>
    );
  }

  // `preferences.get` null → kullanıcının yazılmış satırı yok; fallback default.
  const effective: GlobalPreferenceFields = preferenceQuery.data
    ? {
        muteLevel: preferenceQuery.data.muteLevel,
        mentionOnly: preferenceQuery.data.mentionOnly,
        pushEnabled: preferenceQuery.data.pushEnabled,
        emailEnabled: preferenceQuery.data.emailEnabled,
        quietFrom: preferenceQuery.data.quietFrom,
        quietTo: preferenceQuery.data.quietTo,
        quietTimezone: preferenceQuery.data.quietTimezone,
      }
    : PREFERENCE_DEFAULTS;

  /** Tek bir alanı değiştirip tam satırı yazar (diğer alanlar korunur). */
  const patch = (next: Partial<GlobalPreferenceFields>) => {
    saveGlobal({ ...effective, ...next });
  };

  const channels = strings.notificationSettings.channels;
  const mute = strings.notificationSettings.mute;
  const muteOptions: readonly { value: MuteLevel; label: string }[] = [
    { value: 'none', label: mute.none },
    { value: 'mentions_only', label: mute.mentionsOnly },
    { value: 'all', label: mute.all },
  ];

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-6 p-4 pb-10"
      >
        {/* Genel kanallar + sustur seviyesi. */}
        <SettingsSection title={channels.title} description={channels.description}>
          <SettingsRow
            label={channels.inApp}
            hint={channels.inAppHint}
            control={
              <Toggle
                value
                onValueChange={() => {}}
                disabled
                accessibilityLabel={channels.inApp}
              />
            }
          />
          <SettingsRow
            label={channels.email}
            control={
              <Toggle
                value={effective.emailEnabled}
                onValueChange={(value) => patch({ emailEnabled: value })}
                disabled={isSavingGlobal}
                accessibilityLabel={channels.email}
              />
            }
          />
          <SettingsRow
            label={channels.push}
            control={
              <Toggle
                value={effective.pushEnabled}
                onValueChange={(value) => patch({ pushEnabled: value })}
                disabled={isSavingGlobal}
                accessibilityLabel={channels.push}
              />
            }
          />
          <View className="gap-2 border-t border-border pt-3">
            <RoleSelect
              label={mute.title}
              options={muteOptions}
              value={effective.muteLevel}
              onChange={(level) => patch({ muteLevel: level })}
              disabled={isSavingGlobal}
            />
            <Text className="text-xs text-muted-foreground">{mute.bypassNote}</Text>
          </View>
        </SettingsSection>

        {/* Tip × kanal referans matrisi. */}
        <SettingsSection
          title={strings.notificationSettings.matrix.title}
          description={strings.notificationSettings.matrix.description}
        >
          <NotificationTypeMatrix />
        </SettingsSection>

        {/* Workspace/board/card override satırları. */}
        <SettingsSection
          title={strings.notificationSettings.scopes.title}
          description={strings.notificationSettings.scopes.description}
        >
          <NotificationScopes />
        </SettingsSection>

        {/* Global sessiz saatler. */}
        <SettingsSection
          title={strings.notificationSettings.quiet.title}
          description={strings.notificationSettings.quiet.description}
        >
          <NotificationQuietHours
            preference={effective}
            onSave={(next) => patch(next)}
            disabled={isSavingGlobal}
          />
        </SettingsSection>

        {/* Anlık bildirim alan cihazlar. */}
        <SettingsSection
          title={strings.notificationSettings.devices.title}
          description={strings.notificationSettings.devices.description}
        >
          <NotificationDevices />
        </SettingsSection>
      </ScrollView>
    </>
  );
}
