import { Pressable, View } from 'react-native';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';
import {
  FONT_FAMILY_IDS,
  resolveFontFamily,
  type FontFamilyId,
} from '@/theme/font-families';
import { useTheme, useThemePreference } from '@/theme/theme-provider';

type FontFamilyRowProps = {
  id: FontFamilyId;
  label: string;
  selected: boolean;
  onPress: () => void;
};

/**
 * Tek yazı tipi satırı — etiket KENDİ fontuyla render edilir (canlı önizleme);
 * seçili olan check işareti taşır. `system` seçimi için `resolveFontFamily`
 * `undefined` döner → satır platform varsayılan fontuyla çizilir.
 *
 * NativeWind `className` ↔ Animated interop sorunu yok (düz `Pressable`/`View`);
 * `Text` zaten seçili global aileyi uygular, ama burada her satır kendi ailesini
 * gösterdiğinden `style.fontFamily` ile aile açıkça ezilir (semibold ağırlık).
 */
function FontFamilyRow({ id, label, selected, onPress }: FontFamilyRowProps) {
  const theme = useTheme();
  const previewFamily = resolveFontFamily(id, 'semibold');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      className="flex-row items-center justify-between gap-3 px-4 py-3.5 active:bg-muted"
    >
      <Text
        numberOfLines={1}
        weight="semibold"
        // Satır kendi ailesini önizler — global font seçiminden bağımsız.
        style={previewFamily ? { fontFamily: previewFamily } : undefined}
        className={`flex-1 text-base ${selected ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {label}
      </Text>
      {selected ? <Icon name="check" size={18} color={theme.primary} /> : null}
    </Pressable>
  );
}

/**
 * Yazı tipi ailesi seçici (§13.7.7, Faz 3) — 8 seçeneklik liste. Her satır o
 * ailenin önizlemesini kendi fontuyla gösterir; dokununca `setFontFamily`
 * anında uygular + saklar. `color-theme-picker` ile aynı tasarım çizgisi
 * (uppercase bölüm etiketi + bordürlü kart). Mod / renk paletinden bağımsızdır.
 */
export function FontFamilyPicker() {
  const { fontFamily, setFontFamily } = useThemePreference();

  return (
    <View className="gap-2">
      <Text weight="semibold" className="px-1 text-xs uppercase text-muted-foreground">
        {strings.account.fontFamilyTitle}
      </Text>
      <View className="overflow-hidden rounded-xl border border-border bg-card">
        {FONT_FAMILY_IDS.map((id, index) => (
          <View key={id}>
            {index > 0 ? <View className="ml-4 h-px bg-border" /> : null}
            <FontFamilyRow
              id={id}
              label={strings.account.fontFamilies[id]}
              selected={fontFamily === id}
              onPress={() => setFontFamily(id)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
