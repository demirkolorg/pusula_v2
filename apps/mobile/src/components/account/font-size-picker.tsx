import { Pressable, View } from 'react-native';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';
import {
  FONT_SCALE_STEP,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  fontScalePercent,
} from '@/theme/theme-preference';
import { useTheme, useThemePreference } from '@/theme/theme-provider';

type StepButtonProps = {
  icon: 'minus' | 'plus';
  label: string;
  disabled: boolean;
  onPress: () => void;
};

/**
 * Tek ölçek adım butonu (küçült / büyüt). Sınıra ulaşınca pasifleşir; pasifken
 * dokunma kapalı + soluk. Düz `Pressable` — Animated+className interop yok.
 */
function StepButton({ icon, label, disabled, onPress }: StepButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      className={`size-11 items-center justify-center rounded-lg border border-border bg-muted active:opacity-70 ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      <Icon
        name={icon}
        size={20}
        color={disabled ? theme.mutedForeground : theme.foreground}
      />
    </Pressable>
  );
}

/**
 * Yazı boyutu seçici (§13.7.7, Faz 4) — %90-120, adım %5. RN built-in Slider
 * olmadığından ±adım butonları + yüzde göstergesi kullanılır (web dropdown'daki
 * küçült/büyüt/sıfırla simetriği). Üstte seçili boyutta canlı önizleme satırı;
 * dokununca `setFontScale` anında uygular + saklar.
 *
 * Önizleme `Text`'i global `fontScale`'i zaten otomatik uygular (merkezi Text);
 * boyut değişince anında büyür/küçülür — ayrı manuel ölçekleme gerekmez.
 */
export function FontSizePicker() {
  const { fontScale, setFontScale } = useThemePreference();
  const theme = useTheme();

  const percent = fontScalePercent(fontScale);
  const canDecrease = fontScale > MIN_FONT_SCALE;
  const canIncrease = fontScale < MAX_FONT_SCALE;
  const isDefault = percent === 100;

  return (
    <View className="gap-2">
      <Text weight="semibold" className="px-1 text-xs uppercase text-muted-foreground">
        {strings.account.fontSizeTitle}
      </Text>
      <View className="gap-4 rounded-xl border border-border bg-card p-4">
        {/* Canlı önizleme — global fontScale merkezi Text üzerinden uygulanır. */}
        <View className="items-center rounded-lg bg-muted px-4 py-5">
          <Text weight="semibold" className="text-2xl text-foreground">
            {strings.account.fontPreview}
          </Text>
        </View>

        {/* Kontrol satırı: küçült − yüzde − büyüt; sağda sıfırla. */}
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-row items-center gap-3">
            <StepButton
              icon="minus"
              label={strings.account.fontSizeDecrease}
              disabled={!canDecrease}
              onPress={() => setFontScale(fontScale - FONT_SCALE_STEP)}
            />
            <Text
              weight="semibold"
              tabletScale={1}
              className="w-14 text-center text-base text-foreground"
            >
              {percent}%
            </Text>
            <StepButton
              icon="plus"
              label={strings.account.fontSizeIncrease}
              disabled={!canIncrease}
              onPress={() => setFontScale(fontScale + FONT_SCALE_STEP)}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.account.fontSizeReset}
            accessibilityState={{ disabled: isDefault }}
            disabled={isDefault}
            hitSlop={8}
            onPress={() => setFontScale(1)}
            className={`flex-row items-center gap-1.5 rounded-lg px-3 py-2 active:opacity-70 ${
              isDefault ? 'opacity-40' : ''
            }`}
          >
            <Icon name="rotate-ccw" size={16} color={theme.mutedForeground} />
            <Text tabletScale={1} className="text-sm text-muted-foreground">
              {strings.account.fontSizeReset}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
