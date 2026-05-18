import { View } from 'react-native';
import { AppSpinner } from '@/components/app-spinner';

/** Tam ekran yükleniyor göstergesi — oturum çözülürken route layout'ları kullanır. */
export function LoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <AppSpinner size="lg" showLabel />
    </View>
  );
}
