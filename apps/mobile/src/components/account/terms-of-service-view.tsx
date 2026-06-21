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

/** Kullanım koşullarının tam (web) sürümü — in-app tarayıcıda açılır. */
const TERMS_URL = 'https://pusulaportal.com/terms';

/** Özet kart satırları (ikon + metin `strings.terms.summary`'den). */
const SUMMARY: ReadonlyArray<{
  icon: IconName;
  key: 'ownContent' | 'free' | 'fairUse' | 'leaveAnytime';
}> = [
  { icon: 'file-text', key: 'ownContent' },
  { icon: 'gift', key: 'free' },
  { icon: 'check-circle', key: 'fairUse' },
  { icon: 'log-out', key: 'leaveAnytime' },
];

/** Ayrıntı bölümü `key` → ikon eşlemesi (metin framework-bağımsız `strings`'te). */
const SECTION_ICONS: Record<string, IconName> = {
  provider: 'user',
  account: 'lock',
  ownership: 'file-text',
  acceptableUse: 'alert-triangle',
  pricing: 'credit-card',
  availability: 'activity',
  termination: 'user-x',
  liability: 'alert-octagon',
  thirdParty: 'share-2',
  ip: 'award',
  changes: 'refresh-cw',
  law: 'book',
};

/**
 * "Kullanım Koşulları" görünümü — WebView yerine native, i18n uyumlu zengin
 * görünüm (`PrivacyPolicyView` ile simetrik; içerik web `terms/page.tsx` ile
 * birebir). Kimlik (belge ikonu + başlık + son güncelleme), özet kart, ayrıntılı
 * bölümler ve iletişim + tam metin bağlantısı. Telefonda `(account)/terms`
 * route'unda push edilir; tablet hesap detail pane'inde gömülü gösterilir.
 *
 * İletişim satırı `mailto:` ile cihaz e-posta istemcisini açar (`Linking`);
 * tam metin bağlantısı in-app tarayıcıda açılır (`expo-web-browser`).
 */
export function TermsOfServiceView() {
  const theme = useTheme();
  const navInset = useFloatingNavInset();
  const terms = strings.terms;

  const openUrl = (url: string) => {
    void WebBrowser.openBrowserAsync(url);
  };

  return (
    <ScrollView
      className="flex-1 bg-muted"
      contentContainerClassName="gap-6 p-4"
      contentContainerStyle={{ paddingBottom: navInset || 40 }}
    >
      {/* Kimlik — ortalanmış belge ikonu + başlık + son güncelleme. */}
      <AccountPageHeader
        icon="file-text"
        title={terms.title}
        subtitle={terms.lastUpdatedLabel(terms.lastUpdated)}
      />

      {/* Giriş. */}
      <Text className="px-1 text-center text-sm leading-5 text-muted-foreground">{terms.intro}</Text>

      {/* Özet — ikon + başlık + açıklama satırları. */}
      <View className="gap-2">
        <Text weight="semibold" className="px-1 text-xs uppercase text-muted-foreground">
          {terms.summaryTitle}
        </Text>
        <View className="overflow-hidden rounded-xl border border-border bg-card">
          {SUMMARY.map((item, index) => (
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
                  {terms.summary[item.key].title}
                </Text>
                <Text className="text-xs leading-4 text-muted-foreground">
                  {terms.summary[item.key].text}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Ayrıntılı bölümler — her biri ikon + başlık + paragraf/madde kartı. */}
      <View className="gap-2">
        <Text weight="semibold" className="px-1 text-xs uppercase text-muted-foreground">
          {terms.sectionsTitle}
        </Text>
        <View className="gap-3">
          {terms.sections.map((section) => {
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
      <SettingsGroup title={terms.contactTitle}>
        <SettingsRow
          icon="mail"
          label={terms.contactRow}
          value={terms.contactEmail}
          onPress={() => void Linking.openURL(`mailto:${terms.contactEmail}`)}
          trailing={<Icon name="external-link" size={16} color={theme.mutedForeground} />}
        />
        <SettingsRow
          icon="external-link"
          label={terms.fullTermsRow}
          onPress={() => openUrl(TERMS_URL)}
          trailing={<Icon name="external-link" size={16} color={theme.mutedForeground} />}
        />
      </SettingsGroup>

      {/* Telif. */}
      <Text className="px-1 pt-2 text-center text-xs text-muted-foreground">{terms.copyright}</Text>
    </ScrollView>
  );
}
