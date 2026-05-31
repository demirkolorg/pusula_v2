import { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { MasterDetailLayout } from '@/components/master-detail-layout';
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
import { useIsTablet } from '@/lib/use-device-class';
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
type NotificationCategoryId = 'channels' | 'matrix' | 'scopes' | 'quiet' | 'devices';

export default function NotificationSettingsScreen() {
  const trpc = useTRPC();
  const header = (
    <Stack.Screen options={{ title: strings.notificationSettings.title }} />
  );

  const preferenceQuery = useQuery(trpc.notifications.preferences.get.queryOptions({}));
  const { saveGlobal, isSavingGlobal } = useNotificationPreferences();

  // Faz 15C (DEM-303) — tablet master-detail: sol 5 kategori sidebar +
  // sağ seçili kategori detayı. Phone'da değişmez (tek ScrollView, 5 bölüm
  // sırayla). Default seçim ilk kategori (`channels`).
  const isTablet = useIsTablet();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const sidebarWidth = isTablet && viewportWidth > viewportHeight ? 384 : 320;
  const [selectedCategory, setSelectedCategory] =
    useState<NotificationCategoryId>('channels');

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

  // Faz 15C — 5 bölüm tekil değişkenlere ayrıştırıldı; phone tek ScrollView
  // sırayla, tablet master-detail detail pane'inde seçili olan render edilir.
  const channelsSection = (
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
  );

  const matrixSection = (
    <SettingsSection
      title={strings.notificationSettings.matrix.title}
      description={strings.notificationSettings.matrix.description}
    >
      <NotificationTypeMatrix />
    </SettingsSection>
  );

  const scopesSection = (
    <SettingsSection
      title={strings.notificationSettings.scopes.title}
      description={strings.notificationSettings.scopes.description}
    >
      <NotificationScopes />
    </SettingsSection>
  );

  const quietSection = (
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
  );

  const devicesSection = (
    <SettingsSection
      title={strings.notificationSettings.devices.title}
      description={strings.notificationSettings.devices.description}
    >
      <NotificationDevices />
    </SettingsSection>
  );

  const sectionByCategory: Record<NotificationCategoryId, React.ReactNode> = {
    channels: channelsSection,
    matrix: matrixSection,
    scopes: scopesSection,
    quiet: quietSection,
    devices: devicesSection,
  };

  const categories: ReadonlyArray<{ id: NotificationCategoryId; title: string }> = [
    { id: 'channels', title: channels.title },
    { id: 'matrix', title: strings.notificationSettings.matrix.title },
    { id: 'scopes', title: strings.notificationSettings.scopes.title },
    { id: 'quiet', title: strings.notificationSettings.quiet.title },
    { id: 'devices', title: strings.notificationSettings.devices.title },
  ];

  // Tablet master-detail: sol 5 kategori sidebar (seçili = `border-primary`
  // vurgusu), sağ seçili kategori bölümünün tek bir ScrollView'da render'ı.
  // Phone'da değişmez — tek ScrollView'da 5 bölüm sırayla.
  if (isTablet) {
    return (
      <>
        {header}
        <MasterDetailLayout
          master={
            <ScrollView
              className="flex-1"
              contentContainerClassName="gap-2 p-3"
            >
              {categories.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    accessibilityRole="button"
                    accessibilityLabel={cat.title}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setSelectedCategory(cat.id)}
                    className={`rounded-lg border bg-card px-3 py-3 active:opacity-60 ${
                      isSelected ? 'border-primary' : 'border-border'
                    }`}
                  >
                    <Text
                      weight={isSelected ? 'semibold' : 'medium'}
                      className="text-sm text-foreground"
                      numberOfLines={1}
                    >
                      {cat.title}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          }
          detail={
            <ScrollView
              className="flex-1 bg-background"
              contentContainerClassName="p-4 pb-10"
            >
              {sectionByCategory[selectedCategory]}
            </ScrollView>
          }
          sidebarWidth={sidebarWidth}
          testID="notification-settings-master-detail"
        />
      </>
    );
  }

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-6 p-4 pb-10"
      >
        {channelsSection}
        {matrixSection}
        {scopesSection}
        {quietSection}
        {devicesSection}
      </ScrollView>
    </>
  );
}
