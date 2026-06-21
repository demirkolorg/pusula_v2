import { ScrollView, View } from 'react-native';
import { AccountPageHeader } from '@/components/account/account-page-header';
import { ColorThemePicker } from '@/components/account/color-theme-picker';
import { FontFamilyPicker } from '@/components/account/font-family-picker';
import { FontSizePicker } from '@/components/account/font-size-picker';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { SettingsGroup } from '@/components/settings/settings-group';
import { SettingsRow } from '@/components/settings/settings-row';
import { strings } from '@/lib/strings';
import { useFloatingNavInset } from '@/lib/use-floating-nav-inset';
import type { ThemePreference } from '@/theme/theme-preference';
import { useTheme, useThemePreference } from '@/theme/theme-provider';

/**
 * Görünüm grubundaki tema seçenekleri — sırası UI'da da bu sıradır. Hesap
 * ekranı (telefon inline grup) ve `AppearanceView` (tablet detail pane) tek
 * kaynaktan kullanır.
 */
export const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  icon: 'sun' | 'moon' | 'smartphone';
}> = [
  { value: 'light', icon: 'sun' },
  { value: 'dark', icon: 'moon' },
  { value: 'system', icon: 'smartphone' },
];

/**
 * Görünüm / tema seçici görünümü (DEM-207) — tablet hesap detail pane'inde
 * gösterilir. Seçili satır check işareti taşır; seçim anında uygulanır
 * (`useThemePreference`). Telefonda bu içerik hesap ekranında inline grup olarak
 * çizilir (push yok), bu görünüm yalnız tablet detail için.
 */
export function AppearanceView() {
  const theme = useTheme();
  const navInset = useFloatingNavInset();
  const { preference, setPreference } = useThemePreference();

  return (
    <ScrollView
      className="flex-1 bg-muted"
      // Geniş ekranda (tablet pane / landscape) içerik edge-to-edge gerilmesin:
      // ortalanmış max-width kolon (`mx-auto w-full max-w-2xl`). Telefonda tam
      // genişlik (ekran < max-w → no-op).
      contentContainerClassName="mx-auto w-full max-w-2xl gap-6 p-4"
      contentContainerStyle={{ paddingBottom: navInset || 16 }}
    >
      <AccountPageHeader
        icon="sun"
        title={strings.account.appearanceTitle}
        subtitle={strings.account.appearanceSubtitle}
      />

      {/* Tema (mod) — açık / koyu / sistem. */}
      <View className="gap-2">
        <Text weight="semibold" className="px-1 text-xs uppercase text-muted-foreground">
          {strings.account.appearanceModeLabel}
        </Text>
        <SettingsGroup>
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
      </View>

      {/* Renk paleti — mod seçiminin altında; 15 palet swatch grid (§13.7.7).
          Kendi uppercase "Renk teması" bölüm etiketini çizer. */}
      <ColorThemePicker />

      {/* Yazı tipi ailesi — 8 seçenek, her satır kendi fontuyla önizlenir
          (§13.7.7 Faz 3). Kendi "Yazı tipi" bölüm etiketini çizer. */}
      <FontFamilyPicker />

      {/* Yazı boyutu — %90-120, ±%5 adım + canlı önizleme (§13.7.7 Faz 4). */}
      <FontSizePicker />
    </ScrollView>
  );
}
