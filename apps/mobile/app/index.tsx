import { Text, View } from 'react-native';
import { BrandMark } from '@/components/brand-mark';
import { Screen } from '@/components/screen';
import { strings } from '@/lib/strings';

/**
 * Geçici giriş ekranı — Faz 7A altyapı doğrulaması. Gerçek giriş akışı (7B)
 * ve board ekranları (7C+) sonraki alt işlerde gelir.
 */
export default function Index() {
  return (
    <Screen className="items-center justify-center">
      <View className="items-center gap-4">
        <BrandMark />
        <Text className="text-2xl font-semibold text-foreground">
          {strings.app.name}
        </Text>
        <Text className="text-center text-base font-medium text-foreground">
          {strings.scaffold.title}
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          {strings.scaffold.description}
        </Text>
      </View>
    </Screen>
  );
}
