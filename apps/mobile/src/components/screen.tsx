import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

type ScreenProps = {
  children: ReactNode;
  /** Ek NativeWind sınıfları (hizalama, boşluk vb.). */
  className?: string;
};

/**
 * Ekran kabuğu — güvenli alan + tema arka planı. Mobil bileşenler NativeWind
 * ile kurulur; `@pusula/ui` shadcn web bileşenleri mobilde kullanılmaz
 * (7.0 kararı).
 */
export function Screen({ children, className }: ScreenProps) {
  return (
    <SafeAreaView className={`flex-1 bg-background px-6 ${className ?? ''}`}>
      {children}
    </SafeAreaView>
  );
}
