import { useState } from 'react';
import { Pressable, ScrollView, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useMutation } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { EntityAvatar } from '@/components/entity-avatar';
import { FormMessage } from '@/components/form-message';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { SettingsGroup } from '@/components/settings/settings-group';
import { SettingsRow } from '@/components/settings/settings-row';
import { clearRegisteredPushToken, getRegisteredPushToken } from '@/lib/push-token-store';
import { strings } from '@/lib/strings';
import type { ThemePreference } from '@/theme/theme-preference';
import { useThemePreference } from '@/theme/theme-provider';
import { themeFor } from '@/theme/tokens';
import { useTRPC } from '@/trpc/provider';

/** Görünüm grubundaki tema seçenekleri — sırası UI'da da bu sıradır. */
const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; icon: 'sun' | 'moon' | 'smartphone' }> =
  [
    { value: 'light', icon: 'sun' },
    { value: 'dark', icon: 'moon' },
    { value: 'system', icon: 'smartphone' },
  ];

/**
 * "Hesap" sekmesi (DEM-208) — gruplu ayar ekranı. Profil (→ düzenleme),
 * Görünüm (tema seçici — DEM-207), Bildirimler (→ bildirim ayarları), Hesap &
 * güvenlik (→ şifre değiştir), Hakkında (sürüm) ve Çıkış. signOut sonrası
 * `useSession` boşalır → `(app)/_layout` `(auth)/sign-in`'e yönlendirir.
 */
export default function AccountScreen() {
  const { data: session } = authClient.useSession();
  const trpc = useTRPC();
  const theme = themeFor(useColorScheme());
  const { preference, setPreference } = useThemePreference();
  const revokeToken = useMutation(trpc.push.tokens.revoke.mutationOptions());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = session?.user.name || session?.user.email || '';
  const email = session?.user.email ?? '';
  const appVersion = Constants.expoConfig?.version ?? '—';

  const handleSignOut = async () => {
    setPending(true);
    setError(null);
    try {
      // Faz 7K: oturum kapanmadan ÖNCE bu cihazın push token'ını iptal et —
      // signOut sonrası istek kimliksiz gider, revoke başarısız olurdu. Token
      // yoksa adım atlanır; revoke best-effort, hatası logout'u bloklamaz.
      const token = getRegisteredPushToken();
      if (token) {
        try {
          await revokeToken.mutateAsync({ token });
        } catch {
          // Revoke başarısız olsa da çıkışa devam.
        }
        clearRegisteredPushToken();
      }
      await authClient.signOut();
    } catch (caught) {
      setError(authErrorMessage(caught));
      setPending(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-muted">
      <ScrollView contentContainerClassName="gap-5 p-4">
        <Text weight="semibold" className="text-2xl text-foreground">
          {strings.account.title}
        </Text>

        {/* Profil — avatar + ad + e-posta; dokununca düzenleme ekranı. */}
        <SettingsGroup>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.profileEdit.title}
            onPress={() => router.push('/profile-edit')}
            className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted"
          >
            <EntityAvatar name={displayName || strings.app.name} image={session?.user.image} size={44} />
            <View className="flex-1 gap-0.5">
              {displayName ? (
                <Text weight="semibold" numberOfLines={1} className="text-base text-foreground">
                  {displayName}
                </Text>
              ) : null}
              {email ? (
                <Text numberOfLines={1} className="text-sm text-muted-foreground">
                  {email}
                </Text>
              ) : null}
            </View>
            <Icon name="chevron-right" size={18} color={theme.mutedForeground} />
          </Pressable>
        </SettingsGroup>

        {/* Görünüm — tema seçici (DEM-207). Seçili satır check işareti taşır. */}
        <SettingsGroup title={strings.account.appearanceTitle}>
          {THEME_OPTIONS.map((option) => (
            <SettingsRow
              key={option.value}
              icon={option.icon}
              label={strings.account.theme[option.value]}
              onPress={() => setPreference(option.value)}
              hideChevron
              selected={preference === option.value}
              trailing={
                preference === option.value ? (
                  <Icon name="check" size={18} color={theme.primary} />
                ) : undefined
              }
            />
          ))}
        </SettingsGroup>

        {/* Bildirimler — mevcut bildirim ayarları ekranına köprü. */}
        <SettingsGroup title={strings.account.notificationsTitle}>
          <SettingsRow
            icon="bell"
            label={strings.account.notificationSettingsRow}
            onPress={() => router.push('/notification-settings')}
          />
        </SettingsGroup>

        {/* Hesap & güvenlik. */}
        <SettingsGroup title={strings.account.securityTitle}>
          <SettingsRow
            icon="lock"
            label={strings.account.changePasswordRow}
            onPress={() => router.push('/change-password')}
          />
          <SettingsRow
            icon="trash-2"
            label={strings.account.deleteAccountRow}
            destructive
            onPress={() => router.push('/delete-account')}
          />
        </SettingsGroup>

        {/* Hakkında — uygulama sürümü (salt-gösterim). */}
        <SettingsGroup title={strings.account.aboutTitle}>
          <SettingsRow icon="info" label={strings.account.versionRow} value={appVersion} />
        </SettingsGroup>

        {error ? <FormMessage>{error}</FormMessage> : null}

        {/* Çıkış. */}
        <SettingsGroup>
          <SettingsRow
            icon="log-out"
            label={strings.auth.signOut}
            destructive
            hideChevron
            pending={pending}
            onPress={handleSignOut}
          />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
