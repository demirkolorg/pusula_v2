import { ScrollView, View } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { SettingsGroup } from '@/components/settings/settings-group';
import { SettingsRow } from '@/components/settings/settings-row';
import { strings } from '@/lib/strings';
import { useFloatingNavInset } from '@/lib/use-floating-nav-inset';
import { useTheme } from '@/theme/theme-provider';

/** Pusula web adresleri — bağlantılar in-app tarayıcıda açılır (gizlilik
 *  ekranı WebView tercihiyle tutarlı; harici tarayıcıya atmaz). */
const WEBSITE_URL = 'https://pusulaportal.com';
const TERMS_URL = 'https://pusulaportal.com/terms';

/** Öne çıkanlar — web landing `features` anlatımıyla hizalı (ikon + metin). */
const FEATURES: ReadonlyArray<{
  icon: IconName;
  key: 'boards' | 'permissions' | 'notifications' | 'sync';
}> = [
  { icon: 'layout', key: 'boards' },
  { icon: 'shield', key: 'permissions' },
  { icon: 'bell', key: 'notifications' },
  { icon: 'refresh-cw', key: 'sync' },
];

/**
 * "Hakkında" görünümü — uygulama kimliği (logo ikonu + ad + tagline), ürün
 * anlatımı, öne çıkan özellikler, sürüm + bağlantılar (web sitesi / şartlar) ve
 * telif. Telefonda `(account)/about` route'unda push edilir; tablet hesap detail
 * pane'inde gömülü gösterilir (DEM-303 V2). Bağlantılar `expo-web-browser` ile
 * in-app açılır.
 */
export function AboutView() {
  const theme = useTheme();
  const navInset = useFloatingNavInset();
  const appVersion = Constants.expoConfig?.version ?? '—';
  const about = strings.about;

  const openUrl = (url: string) => {
    void WebBrowser.openBrowserAsync(url);
  };

  return (
    <ScrollView
      className="flex-1 bg-muted"
      contentContainerClassName="gap-6 p-4"
      contentContainerStyle={{ paddingBottom: navInset || 40 }}
    >
      {/* Uygulama kimliği — ortalanmış logo ikonu + ad + tagline. */}
      <View className="items-center gap-3 pt-4">
        <View className="h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
          <Icon name="compass" size={44} color={theme.primary} />
        </View>
        <View className="items-center gap-1">
          <Text weight="semibold" className="text-2xl text-foreground">
            {strings.app.name}
          </Text>
          <Text className="text-sm text-muted-foreground">{strings.app.tagline}</Text>
        </View>
      </View>

      {/* Ürün anlatımı. */}
      <Text className="px-1 text-center text-sm leading-5 text-muted-foreground">
        {about.intro}
      </Text>

      {/* Öne çıkanlar — ikon + başlık + açıklama satırları. */}
      <View className="gap-2">
        <Text weight="semibold" className="px-1 text-xs uppercase text-muted-foreground">
          {about.featuresTitle}
        </Text>
        <View className="overflow-hidden rounded-xl border border-border bg-card">
          {FEATURES.map((feature, index) => (
            <View
              key={feature.key}
              className={`flex-row items-start gap-3 px-4 py-3.5 ${
                index > 0 ? 'border-t border-border' : ''
              }`}
            >
              <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <Icon name={feature.icon} size={18} color={theme.primary} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text weight="medium" className="text-sm text-foreground">
                  {about.features[feature.key].title}
                </Text>
                <Text className="text-xs leading-4 text-muted-foreground">
                  {about.features[feature.key].text}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Bilgi & bağlantılar — sürüm + web sitesi + şartlar. */}
      <SettingsGroup title={about.infoTitle}>
        <SettingsRow icon="tag" label={about.versionLabel} value={appVersion} />
        <SettingsRow
          icon="globe"
          label={about.websiteRow}
          onPress={() => openUrl(WEBSITE_URL)}
          trailing={<Icon name="external-link" size={16} color={theme.mutedForeground} />}
        />
        <SettingsRow
          icon="file-text"
          label={about.termsRow}
          onPress={() => openUrl(TERMS_URL)}
          trailing={<Icon name="external-link" size={16} color={theme.mutedForeground} />}
        />
      </SettingsGroup>

      {/* Telif. */}
      <Text className="px-1 pt-2 text-center text-xs text-muted-foreground">
        {about.copyright}
      </Text>
    </ScrollView>
  );
}
