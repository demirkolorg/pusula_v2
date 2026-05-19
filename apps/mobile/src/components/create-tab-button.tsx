import { useState } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/icon';
import { CreateMenuSheet } from '@/components/create-menu-sheet';
import { useQuickNoteDraft } from '@/lib/quick-note-draft';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

/**
 * Merkezi "Ekle" tab butonu — DEM-203.
 *
 * `<Tabs>`'in `create` ekranının `tabBarButton`'ı olarak takılır; gezinme
 * sekmesi değil bir aksiyon yüzeyidir (belgelenmiş "4 sekme" kararı korunur):
 * - **Dokunma (anasayfa dışında)** → tab navigasyonu intercept edilir,
 *   `router.push` ile Hızlı Notlar ekranına gidilir (`create` ekranı asla
 *   gösterilmez).
 * - **Dokunma (anasayfada — hızlı-not dock'u odaktayken)** → ekran açma
 *   baypas edilir; dock'a yazılı taslak doğrudan hızlı nota kaydedilir
 *   (DEM-230 — `useQuickNoteDraft().active`).
 * - **Uzun basış** → oluşturma menüsü (`CreateMenuSheet`) açılır (her ekranda).
 *
 * Görsel olarak tab bar düzleminin üstüne taşan, `primary` arka planlı,
 * yuvarlak, büyük "+" ikonlu yükseltilmiş buton. Kapsayıcısı `flex-1` ile
 * diğer 4 sekmeyle eşit pay alır; böylece navigasyon butonları ortalı dağılır.
 * Sheet state'i bu bileşende yönetilir ve sheet burada render edilir.
 *
 * `<Tabs>` `tabBarButton` `props` (basış davranışı dahil) sağlar; bunları
 * bilerek yok sayarız — kendi `onPress`/`onLongPress`'imizi kullanırız.
 */
export function CreateTabButton() {
  const router = useRouter();
  const theme = themeFor(useColorScheme());
  const [menuVisible, setMenuVisible] = useState(false);
  const { active: dockActive, submit: submitQuickNote } = useQuickNoteDraft();

  // Anasayfada hızlı-not dock'u odaktaysa "+" ekran açmaz, dock taslağını
  // kaydeder (taslak boşsa `submit` no-op'tur); değilse Hızlı Notlar'a gider.
  const handlePress = () => {
    if (dockActive) {
      submitQuickNote();
    } else {
      router.push('/(app)/(boards)/quick-notes');
    }
  };

  return (
    // `flex-1` ile diğer 4 sekmeyle eşit pay alır — böylece navigasyon
    // butonları tab bar'da eşit/ortalı dağılır. Kapsayıcı yüksekliği
    // bozmadan butonu yukarı taşır (buton üst kenardan ~18px taşar).
    <View className="flex-1 items-center justify-center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.create.buttonLabel}
        accessibilityHint={strings.create.buttonHint}
        onPress={handlePress}
        onLongPress={() => setMenuVisible(true)}
        // ~18px yukarı taşar; gölge ile tab bar düzleminden ayrışır.
        style={{
          backgroundColor: theme.primary,
          marginTop: -18,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 5,
        }}
        className="h-16 w-16 items-center justify-center rounded-full active:opacity-80"
      >
        <Icon name="plus" size={34} color={theme.primaryForeground} />
      </Pressable>
      <CreateMenuSheet visible={menuVisible} onClose={() => setMenuVisible(false)} />
    </View>
  );
}
