import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useMutation } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { AboutView } from '@/components/account/about-view';
import { AppearanceView, THEME_OPTIONS } from '@/components/account/appearance-view';
import { ColorThemePicker } from '@/components/account/color-theme-picker';
import { FontFamilyPicker } from '@/components/account/font-family-picker';
import { FontSizePicker } from '@/components/account/font-size-picker';
import { PrivacyPolicyView } from '@/components/account/privacy-policy-view';
import { ProfileEditView } from '@/components/account/profile-edit-view';
import { SecurityView } from '@/components/account/security-view';
import { TermsOfServiceView } from '@/components/account/terms-of-service-view';
import { EntityAvatar } from '@/components/entity-avatar';
import { FormMessage } from '@/components/form-message';
import { Icon } from '@/components/icon';
import { MasterDetailLayout } from '@/components/master-detail-layout';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { NotificationSettingsView } from '@/components/notifications/notification-settings-view';
import { Text } from '@/components/text';
import { SettingsGroup } from '@/components/settings/settings-group';
import { SettingsRow } from '@/components/settings/settings-row';
import { clearRegisteredPushToken, getRegisteredPushToken } from '@/lib/push-token-store';
import { strings } from '@/lib/strings';
import { useFloatingNavInset } from '@/lib/use-floating-nav-inset';
import { useIsTablet } from '@/lib/use-device-class';
import { useTheme, useThemePreference } from '@/theme/theme-provider';
import { useTRPC } from '@/trpc/provider';

/**
 * Tablet hesap master-detail'inde sağ pane'de açılabilecek ayar başlıkları.
 * (Telefonda bu kimlikler kullanılmaz — orada satırlar `router.push` eder.)
 */
type AccountDetailId =
  | 'profile'
  | 'appearance'
  | 'notifications'
  | 'security'
  | 'about'
  | 'privacy'
  | 'terms';

/**
 * "Hesap" sekmesi (DEM-208) — gruplu ayar ekranı. Profil (→ düzenleme),
 * Görünüm (tema seçici — DEM-207), Bildirimler (→ bildirim ayarları), Hesap &
 * güvenlik (→ şifre değiştir / hesabı sil), Hakkında (sürüm + gizlilik) ve Çıkış.
 * signOut sonrası `useSession` boşalır → `(app)/_layout` `(auth)/sign-in`'e
 * yönlendirir.
 *
 * Faz 15C V2 (DEM-303) — **tablet'te gerçek master-detail**: sol ayar nav listesi
 * + sağ pane'de seçili başlığın görünümü (`*View` bileşenleri). Telefonda mevcut
 * Stack push akışı + inline tema seçici **değişmeden** korunur.
 */
export default function AccountScreen() {
  const { data: session } = authClient.useSession();
  const trpc = useTRPC();
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  const revokeToken = useMutation(trpc.push.tokens.revoke.mutationOptions());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTablet = useIsTablet();
  // Tablet'te alttaki nav floating pill — scroll içeriğinin son satırları
  // (master'da "Çıkış yap", detail'de en alt kart) pill arkasında kalmasın.
  const navInset = useFloatingNavInset();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const sidebarWidth = isTablet && viewportWidth > viewportHeight ? 384 : 320;
  // Tablet detail pane'de açık olan başlık — ilk açılışta Profil seçili.
  const [selected, setSelected] = useState<AccountDetailId>('profile');

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
      // app-icon rozetini sıfırla. React Query `enabled:false` olunca cached
      // unreadCount'u silmez (AppShell unmount olur, effect 0 yazmaz) — explicit
      // sıfırlamazsak çıkıştan sonra eski rozet sayısı ikonda takılı kalır.
      await Notifications.setBadgeCountAsync(0);
      await authClient.signOut();
    } catch (caught) {
      setError(authErrorMessage(caught));
      setPending(false);
    }
  };

  /** Profil satırı (avatar + ad + e-posta) — telefon push / tablet select ortak. */
  const profileRow = (onPress: () => void, active = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={strings.profileEdit.title}
      accessibilityState={active ? { selected: true } : undefined}
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-muted ${
        active ? 'bg-muted' : ''
      }`}
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
  );

  // ───────────────────────── Telefon gövdesi (değişmez) ─────────────────────────
  // Mevcut davranış: tema inline 3 satır + diğerleri `router.push`. Telefon
  // akışı bilinçli olarak korunur (regresyon riski olmasın).
  const phoneBody = (
    <ScrollView contentContainerClassName="gap-5 p-4">
      {/* Başlık + bildirim zili (sağ üst) — bildirim sekmesi tab bar'dan
          kaldırıldığından (2026-06-23) bildirim merkezine erişim her ana
          ekranın başlığındaki `<NotificationBell />` üzerinden. */}
      <View className="flex-row items-center justify-between gap-3">
        <Text weight="semibold" numberOfLines={1} className="flex-1 text-2xl text-foreground">
          {strings.account.title}
        </Text>
        <NotificationBell />
      </View>

      {/* Profil — avatar + ad + e-posta; dokununca düzenleme ekranı. */}
      <SettingsGroup>{profileRow(() => router.push('/profile-edit'))}</SettingsGroup>

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

      {/* Renk paleti — mod seçiminin hemen altında inline swatch grid (§13.7.7).
          Telefonda ayrı route yok; tablet'te bu içerik AppearanceView pane'inde. */}
      <ColorThemePicker />

      {/* Yazı tipi ailesi + boyut — renk paletinin altında inline (§13.7.7 Faz 3+4).
          Tablet'te bu içerik AppearanceView pane'inde gösterilir. */}
      <FontFamilyPicker />
      <FontSizePicker />

      {/* Bildirimler — mevcut bildirim ayarları ekranına köprü. */}
      <SettingsGroup title={strings.account.notificationsTitle}>
        <SettingsRow
          icon="bell"
          label={strings.account.notificationSettingsRow}
          onPress={() => router.push('/notification-settings')}
        />
      </SettingsGroup>

      {/* Hesap & güvenlik — şifre değiştir + hesabı sil tek "Güvenlik" ekranında. */}
      <SettingsGroup title={strings.account.securityTitle}>
        <SettingsRow
          icon="lock"
          label={strings.account.securityRow}
          onPress={() => router.push('/security')}
        />
      </SettingsGroup>

      {/* Hakkında — uygulama hakkında (→ ekran) + sürüm + gizlilik politikası
          (uygulama içi WebView ekranında açılır, harici tarayıcı değil — 2026-06-20). */}
      <SettingsGroup title={strings.account.aboutTitle}>
        <SettingsRow icon="tag" label={strings.account.versionRow} value={appVersion} />
        <SettingsRow
          icon="info"
          label={strings.account.aboutRow}
          onPress={() => router.push('/about')}
        />
        <SettingsRow
          icon="shield"
          label={strings.account.privacyPolicyRow}
          onPress={() => router.push('/privacy-policy')}
        />
        <SettingsRow
          icon="file-text"
          label={strings.account.termsRow}
          onPress={() => router.push('/terms')}
        />
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
  );

  if (!isTablet) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-muted">
        {phoneBody}
      </SafeAreaView>
    );
  }

  // ───────────────────────── Tablet master-detail ─────────────────────────
  // Sol nav: ayar başlıkları → `setSelected`. Sağ pane: seçili başlığın görünümü.
  // notification-settings tablet deseniyle simetri; başlıklar `*View`'lerle paylaşılır.
  const tabletMaster = (
    <ScrollView
      contentContainerClassName="gap-5 p-4"
      contentContainerStyle={{ paddingBottom: navInset || 16 }}
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text weight="semibold" numberOfLines={1} className="flex-1 text-2xl text-foreground">
          {strings.account.title}
        </Text>
        <NotificationBell />
      </View>

      {/* Profil. */}
      <SettingsGroup>
        {profileRow(() => setSelected('profile'), selected === 'profile')}
      </SettingsGroup>

      {/* Görünüm — tablet'te tek satır; seçenekler sağ pane'de. */}
      <SettingsGroup title={strings.account.appearanceTitle}>
        <SettingsRow
          icon="sun"
          label={strings.account.appearanceTitle}
          value={strings.account.theme[preference]}
          onPress={() => setSelected('appearance')}
          active={selected === 'appearance'}
        />
      </SettingsGroup>

      {/* Bildirimler. */}
      <SettingsGroup title={strings.account.notificationsTitle}>
        <SettingsRow
          icon="bell"
          label={strings.account.notificationSettingsRow}
          onPress={() => setSelected('notifications')}
          active={selected === 'notifications'}
        />
      </SettingsGroup>

      {/* Hesap & güvenlik — şifre değiştir + hesabı sil tek "Güvenlik" pane'inde. */}
      <SettingsGroup title={strings.account.securityTitle}>
        <SettingsRow
          icon="lock"
          label={strings.account.securityRow}
          onPress={() => setSelected('security')}
          active={selected === 'security'}
        />
      </SettingsGroup>

      {/* Hakkında. */}
      <SettingsGroup title={strings.account.aboutTitle}>
        <SettingsRow icon="tag" label={strings.account.versionRow} value={appVersion} />
        <SettingsRow
          icon="info"
          label={strings.account.aboutRow}
          onPress={() => setSelected('about')}
          active={selected === 'about'}
        />
        <SettingsRow
          icon="shield"
          label={strings.account.privacyPolicyRow}
          onPress={() => setSelected('privacy')}
          active={selected === 'privacy'}
        />
        <SettingsRow
          icon="file-text"
          label={strings.account.termsRow}
          onPress={() => setSelected('terms')}
          active={selected === 'terms'}
        />
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
  );

  // Detail pane içeriği — yalnız seçili başlığın görünümü kurulur (switch ile;
  // seçilmeyen view'lerin WebView/query ağaçları boşuna oluşturulmaz). View'ler
  // gömülü kullanımda `onDone` almaz (geri gidilecek yer yok; pane açık kalır,
  // oturum tazelenir).
  const renderDetail = () => {
    switch (selected) {
      case 'profile':
        return <ProfileEditView />;
      case 'appearance':
        return <AppearanceView />;
      case 'notifications':
        return <NotificationSettingsView />;
      case 'security':
        return <SecurityView />;
      case 'about':
        return <AboutView />;
      case 'privacy':
        return <PrivacyPolicyView />;
      case 'terms':
        return <TermsOfServiceView />;
    }
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-muted">
      <MasterDetailLayout
        master={tabletMaster}
        detail={renderDetail()}
        sidebarWidth={sidebarWidth}
        testID="account-master-detail"
      />
    </SafeAreaView>
  );
}
