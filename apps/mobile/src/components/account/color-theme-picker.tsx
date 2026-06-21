import { Pressable, View, useColorScheme } from 'react-native';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import {
  COLOR_THEMES,
  colorThemeVars,
  type ColorThemeName,
} from '@/theme/color-themes.generated';
import { strings } from '@/lib/strings';
import { useThemePreference } from '@/theme/theme-provider';

/** "R G B" kanalını `rgb(r, g, b)` string'ine çevirir; eksikse siyaha düşer. */
function channelsToRgb(channels: string | undefined): string {
  return `rgb(${(channels ?? '0 0 0').trim().split(/\s+/).join(', ')})`;
}

/**
 * Bir paletin etkin moddaki birincil rengi (dolu daire) + üzerine binecek
 * kontrast rengi (check ikonu). Kontrast, o paletin *kendi* `primary-foreground`
 * değeridir — aktif tema yerine swatch'ın paleti baz alınır ki açık primary'li
 * paletlerde (amber/orange/cyan) check görünür kalsın.
 */
function swatchColors(name: ColorThemeName, scheme: 'light' | 'dark'): {
  fill: string;
  onFill: string;
} {
  const vars = colorThemeVars[name][scheme];
  return {
    fill: channelsToRgb(vars['--color-primary']),
    onFill: channelsToRgb(vars['--color-primary-foreground']),
  };
}

type SwatchProps = {
  label: string;
  /** O paletin etkin moddaki birincil rengi (dolu daire). */
  color: string;
  /** Dolu daire üzerindeki kontrast rengi (check ikonu). */
  onColor: string;
  selected: boolean;
  onPress: () => void;
};

/**
 * Tek palet swatch'ı — birincil renkle dolu yuvarlak daire + seçili işareti.
 *
 * NativeWind `className` ↔ Animated interop sorunundan kaçınmak için (memory:
 * className Animated bileşene otomatik uygulanmaz) daire **düz View** + inline
 * `backgroundColor` ile çizilir; dinamik renk zaten className ile ifade
 * edilemez. Seçili daire çevreleyen `border-primary` halka ile vurgulanır.
 */
function Swatch({ label, color, onColor, selected, onPress }: SwatchProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      // 5 sütunlu grid: her hücre satırın %20'si (inline yüzde — RN'de güvenli;
      // NativeWind `w-[18%]` bazı build'lerde çözülmeyip swatch'ları tek satıra
      // sıkıştırıyordu). İçerik ortalı → daire hücreden dar, doğal yatay boşluk.
      style={{ width: '20%' }}
      className="items-center gap-1.5 px-0.5 active:opacity-70"
    >
      {/* Daire boyutları inline numeric — `size-12`/`size-9` yerine kesin px
          (NativeWind size sınıfı çözülmese bile daire görünür kalsın). */}
      <View
        style={{ width: 48, height: 48 }}
        className={`items-center justify-center rounded-full border-2 ${
          selected ? 'border-primary' : 'border-transparent'
        }`}
      >
        <View
          style={{ width: 36, height: 36, backgroundColor: color }}
          className="items-center justify-center rounded-full"
        >
          {selected ? <Icon name="check" size={18} color={onColor} /> : null}
        </View>
      </View>
      <Text
        numberOfLines={1}
        className={`text-[11px] ${selected ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Renk paleti seçici (§13.7.7) — 15 paletin swatch grid'i. Her swatch o paletin
 * etkin moddaki (`useColorScheme`) birincil rengiyle dolu; dokununca
 * `setColorTheme` anında uygular + saklar. ~5 sütunlu satır sarmalı grid
 * (15 palet = 3 satır); tablet detay pane ve telefon inline grup için aynı.
 *
 * Mod (light/dark) seçiminden bağımsızdır — yalnız aktif paleti değiştirir.
 */
export function ColorThemePicker() {
  const { colorTheme, setColorTheme } = useThemePreference();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  return (
    <View className="gap-2">
      <Text weight="semibold" className="px-1 text-xs uppercase text-muted-foreground">
        {strings.account.colorThemeTitle}
      </Text>
      {/* 5 sütunlu sarmalı grid — sütun boşluğu hücre genişliğinden (içerik ortalı)
          gelir; satır arası `gap-y-4` (numeric — RN gap yüzde kabul etmez). */}
      <View className="flex-row flex-wrap gap-y-4 rounded-xl border border-border bg-card p-4">
        {COLOR_THEMES.map((name) => {
          const { fill, onFill } = swatchColors(name, scheme);
          return (
            <Swatch
              key={name}
              label={strings.account.colorThemes[name]}
              color={fill}
              onColor={onFill}
              selected={colorTheme === name}
              onPress={() => setColorTheme(name)}
            />
          );
        })}
      </View>
    </View>
  );
}
