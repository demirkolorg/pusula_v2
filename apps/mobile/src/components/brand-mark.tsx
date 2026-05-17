import { Text, View } from 'react-native';

type BrandMarkProps = {
  /** Kare kenar uzunluğu (px). Varsayılan 64. */
  size?: number;
};

/**
 * Uygulama içi marka işareti — Pusula rozet logosu. İskelet sürüm: marka
 * renginde yuvarlatılmış kare + baş harf. Vektör pusula logosu ileri faz
 * (react-native-svg) işidir.
 */
export function BrandMark({ size = 64 }: BrandMarkProps) {
  return (
    <View
      className="items-center justify-center rounded-xl bg-primary"
      style={{ width: size, height: size }}
    >
      <Text
        className="font-bold text-primary-foreground"
        style={{ fontSize: size * 0.5 }}
      >
        P
      </Text>
    </View>
  );
}
