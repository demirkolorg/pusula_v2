import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/icon';
import { CreateMenuSheet } from '@/components/create-menu-sheet';
import { useQuickNoteDraft } from '@/lib/quick-note-draft';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

type CreateTabButtonProps = {
  /**
   * Faz 15H — pill içinde kompakt mod. `true` ise `flex-1` wrapper ve
   * yükseltme (`marginTop: -18`) kaldırılır; buton diğer pill sekmeleri kadar
   * yer kaplar (`w-11 h-11`). Default `false` → mevcut phone davranışı.
   */
  compact?: boolean;
};

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
 *
 * Faz 15H — iPad floating pill nav (`FloatingPillTabBar`) bu butonu pill içinde
 * render eder. `compact={true}` props'u ile `flex-1` wrap + yükseltme kapatılır,
 * buton diğer pill sekmeleriyle eşit boyutta (`w-11 h-11`) kalır.
 */
export function CreateTabButton({ compact = false }: CreateTabButtonProps = {}) {
  const router = useRouter();
  const theme = useTheme();
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
    // Phone (default): `flex-1` ile diğer 4 sekmeyle eşit pay alır.
    // Tablet pill (compact): kompakt `items-center justify-center`; pill içinde
    // diğer sekmelerle aynı boyutta kalır.
    <View className={compact ? 'items-center justify-center' : 'flex-1 items-center justify-center'}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.create.buttonLabel}
        accessibilityHint={strings.create.buttonHint}
        onPress={handlePress}
        onLongPress={() => setMenuVisible(true)}
        // Phone: ~18px yukarı taşar + büyük gölge. Tablet pill: yükseltme yok,
        // pill kendi gölgesini taşır — buton sade `primary` dairesi.
        style={
          compact
            ? { backgroundColor: theme.primary }
            : {
                backgroundColor: theme.primary,
                marginTop: -18,
                shadowColor: '#000',
                shadowOpacity: 0.2,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 3 },
                elevation: 5,
              }
        }
        className={
          compact
            ? 'h-11 w-11 items-center justify-center rounded-full active:opacity-80'
            : 'h-16 w-16 items-center justify-center rounded-full active:opacity-80'
        }
      >
        <Icon name="plus" size={compact ? 24 : 34} color={theme.primaryForeground} />
      </Pressable>
      <CreateMenuSheet visible={menuVisible} onClose={() => setMenuVisible(false)} />
    </View>
  );
}
