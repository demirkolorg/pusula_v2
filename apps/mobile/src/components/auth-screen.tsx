import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import { BrandMark } from './brand-mark';

type AuthScreenProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

/**
 * Auth ekranları için ortak kabuk — marka işareti + başlık + klavyeden
 * kaçınan kaydırılabilir gövde. `(auth)` grubundaki tüm ekranlar kullanır.
 */
export function AuthScreen({ title, subtitle, children }: AuthScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View className="mx-auto w-full max-w-sm">
            <View className="mb-8 items-center gap-3">
              <BrandMark size={56} />
              <Text weight="semibold" className="text-center text-2xl text-foreground">
                {title}
              </Text>
              <Text className="text-center text-sm text-muted-foreground">{subtitle}</Text>
            </View>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
