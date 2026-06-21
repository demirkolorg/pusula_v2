import { Linking, ScrollView, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { AccountPageHeader } from '@/components/account/account-page-header';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { SettingsGroup } from '@/components/settings/settings-group';
import { SettingsRow } from '@/components/settings/settings-row';
import { strings } from '@/lib/strings';
import { useFloatingNavInset } from '@/lib/use-floating-nav-inset';
import { useTheme } from '@/theme/theme-provider';

/** Gizlilik politikasının tam (web) sürümü — in-app tarayıcıda açılır. */
const PRIVACY_POLICY_URL = 'https://pusulaportal.com/gizlilik';

/** Özet güvence kartı satırları (ikon + metin `strings.privacy.assurances`'tan). */
const ASSURANCES: ReadonlyArray<{
  icon: IconName;
  key: 'noAds' | 'noSell' | 'secured' | 'deletable';
}> = [
  { icon: 'eye-off', key: 'noAds' },
  { icon: 'tag', key: 'noSell' },
  { icon: 'lock', key: 'secured' },
  { icon: 'trash-2', key: 'deletable' },
];

/** Ayrıntı bölümü `key` → ikon eşlemesi (metin framework-bağımsız `strings`'te). */
const SECTION_ICONS: Record<string, IconName> = {
  controller: 'user',
  data: 'database',
  purpose: 'target',
  legal: 'book',
  providers: 'share-2',
  ads: 'eye-off',
  retention: 'trash-2',
  security: 'lock',
  rights: 'shield',
  children: 'users',
  changes: 'refresh-cw',
};

/**
 * "Gizlilik Politikası" görünümü — WebView yerine native, i18n uyumlu zengin
 * görünüm (`AboutView` ile simetrik; içerik web `gizlilik/page.tsx` ile birebir).
 * Kimlik (kalkan ikonu + başlık + son güncelleme), özet güvenceler, ayrıntılı
 * bölümler ve iletişim + tam metin bağlantısı. Telefonda `(account)/privacy-policy`
 * route'unda push edilir; tablet hesap detail pane'inde gömülü gösterilir.
 *
 * İletişim satırı `mailto:` ile cihaz e-posta istemcisini açar (`Linking`);
 * tam politika bağlantısı in-app tarayıcıda açılır (`expo-web-browser`).
 */
export function PrivacyPolicyView() {
  const theme = useTheme();
  const navInset = useFloatingNavInset();
  const privacy = strings.privacy;

  const openUrl = (url: string) => {
    void WebBrowser.openBrowserAsync(url);
  };

  return (
    <ScrollView
      className="flex-1 bg-muted"
      contentContainerClassName="gap-6 p-4"
      contentContainerStyle={{ paddingBottom: navInset || 40 }}
    >
      {/* Kimlik — ortalanmış kalkan ikonu + başlık + son güncelleme. */}
      <AccountPageHeader
        icon="shield"
        title={privacy.title}
        subtitle={privacy.lastUpdatedLabel(privacy.lastUpdated)}
      />

      {/* Giriş. */}
      <Text className="px-1 text-center text-sm leading-5 text-muted-foreground">
        {privacy.intro}
      </Text>

      {/* Özet güvenceler — ikon + başlık + açıklama satırları. */}
      <View className="gap-2">
        <Text weight="semibold" className="px-1 text-xs uppercase text-muted-foreground">
          {privacy.assurancesTitle}
        </Text>
        <View className="overflow-hidden rounded-xl border border-border bg-card">
          {ASSURANCES.map((item, index) => (
            <View
              key={item.key}
              className={`flex-row items-start gap-3 px-4 py-3.5 ${
                index > 0 ? 'border-t border-border' : ''
              }`}
            >
              <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <Icon name={item.icon} size={18} color={theme.primary} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text weight="medium" className="text-sm text-foreground">
                  {privacy.assurances[item.key].title}
                </Text>
                <Text className="text-xs leading-4 text-muted-foreground">
                  {privacy.assurances[item.key].text}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Ayrıntılı bölümler — her biri ikon + başlık + paragraf/madde kartı. */}
      <View className="gap-2">
        <Text weight="semibold" className="px-1 text-xs uppercase text-muted-foreground">
          {privacy.sectionsTitle}
        </Text>
        <View className="gap-3">
          {privacy.sections.map((section) => {
            const intro = 'intro' in section ? section.intro : undefined;
            const bullets = 'bullets' in section ? section.bullets : undefined;
            const outro = 'outro' in section ? section.outro : undefined;
            return (
              <View key={section.key} className="gap-2.5 rounded-xl border border-border bg-card p-4">
                <View className="flex-row items-center gap-3">
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                    <Icon
                      name={SECTION_ICONS[section.key] ?? 'file-text'}
                      size={18}
                      color={theme.primary}
                    />
                  </View>
                  <Text weight="semibold" className="flex-1 text-sm text-foreground">
                    {section.title}
                  </Text>
                </View>
                {intro ? (
                  <Text className="text-sm leading-5 text-muted-foreground">{intro}</Text>
                ) : null}
                {bullets ? (
                  <View className="gap-1.5">
                    {bullets.map((bullet) => (
                      <View key={bullet} className="flex-row gap-2">
                        <Text className="text-sm leading-5 text-primary">•</Text>
                        <Text className="flex-1 text-sm leading-5 text-muted-foreground">
                          {bullet}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {outro ? (
                  <Text className="text-sm leading-5 text-muted-foreground">{outro}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>

      {/* İletişim + tam metin bağlantısı. */}
      <SettingsGroup title={privacy.contactTitle}>
        <SettingsRow
          icon="mail"
          label={privacy.contactRow}
          value={privacy.contactEmail}
          onPress={() => void Linking.openURL(`mailto:${privacy.contactEmail}`)}
          trailing={<Icon name="external-link" size={16} color={theme.mutedForeground} />}
        />
        <SettingsRow
          icon="external-link"
          label={privacy.fullPolicyRow}
          onPress={() => openUrl(PRIVACY_POLICY_URL)}
          trailing={<Icon name="external-link" size={16} color={theme.mutedForeground} />}
        />
      </SettingsGroup>

      {/* Telif. */}
      <Text className="px-1 pt-2 text-center text-xs text-muted-foreground">
        {privacy.copyright}
      </Text>
    </ScrollView>
  );
}
