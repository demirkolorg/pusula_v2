import { useState } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/icon';
import { CreateMenuSheet } from '@/components/create-menu-sheet';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

/**
 * Merkezi "Ekle" tab butonu — DEM-203.
 *
 * `<Tabs>`'in `create` ekranının `tabBarButton`'ı olarak takılır; gezinme
 * sekmesi değil bir aksiyon yüzeyidir (belgelenmiş "4 sekme" kararı korunur):
 * - **Dokunma** → tab navigasyonu intercept edilir, `router.push` ile Hızlı
 *   Notlar ekranına gidilir (`create` ekranı asla gösterilmez).
 * - **Uzun basış** → oluşturma menüsü (`CreateMenuSheet`) açılır.
 *
 * Görsel olarak tab bar düzleminin üstüne hafif taşan, `primary` arka planlı,
 * yuvarlak, büyük "+" ikonlu yükseltilmiş buton. Sheet state'i bu bileşende
 * yönetilir ve sheet burada render edilir.
 *
 * `<Tabs>` `tabBarButton` `props` (basış davranışı dahil) sağlar; bunları
 * bilerek yok sayarız — kendi `onPress`/`onLongPress`'imizi kullanırız.
 */
export function CreateTabButton() {
  const router = useRouter();
  const theme = themeFor(useColorScheme());
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    // `pointerEvents` kapsayıcısı tab bar yüksekliğini bozmadan butonu yukarı
    // taşır — buton tab bar'ın üst kenarından ~14px taşar.
    <View className="w-16 items-center justify-center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.create.buttonLabel}
        accessibilityHint={strings.create.buttonHint}
        onPress={() => router.push('/(app)/(boards)/quick-notes')}
        onLongPress={() => setMenuVisible(true)}
        // ~14px yukarı taşar; gölge ile tab bar düzleminden ayrışır.
        style={{
          backgroundColor: theme.primary,
          marginTop: -14,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 5,
        }}
        className="h-14 w-14 items-center justify-center rounded-full active:opacity-80"
      >
        <Icon name="plus" size={28} color={theme.primaryForeground} />
      </Pressable>
      <CreateMenuSheet visible={menuVisible} onClose={() => setMenuVisible(false)} />
    </View>
  );
}
