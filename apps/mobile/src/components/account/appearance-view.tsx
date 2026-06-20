import { ScrollView, useColorScheme } from 'react-native';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { SettingsGroup } from '@/components/settings/settings-group';
import { SettingsRow } from '@/components/settings/settings-row';
import { strings } from '@/lib/strings';
import type { ThemePreference } from '@/theme/theme-preference';
import { useThemePreference } from '@/theme/theme-provider';
import { themeFor } from '@/theme/tokens';

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
  const theme = themeFor(useColorScheme());
  const { preference, setPreference } = useThemePreference();

  return (
    <ScrollView className="flex-1 bg-muted" contentContainerClassName="gap-5 p-4">
      <Text weight="semibold" className="text-2xl text-foreground">
        {strings.account.appearanceTitle}
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
    </ScrollView>
  );
}
