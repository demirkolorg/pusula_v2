import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/icon';
import { CreateMenuSheet } from '@/components/create-menu-sheet';
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
 * Merkezi "Ekle" tab butonu.
 *
 * `<Tabs>`'in `create` ekranının `tabBarButton`'ı olarak takılır; gezinme
 * sekmesi değil bir aksiyon yüzeyidir. **TEK dokunuş** oluşturma menüsünü
 * (`CreateMenuSheet`) açar — kullanıcı yapmak istediği eklemeyi (Hızlı not /
 * Kart / Liste / Pano / Workspace) oradan seçer. `create` ekranı asla render
 * edilmez.
 *
 * Sadeleştirme (kullanıcı kararı): önceki bağlama-duyarlı davranış kaldırıldı —
 * dokunuş artık her ekranda aynı (menü açar); uzun-basış ve anasayfa hızlı-not
 * dock'u kaydetme kısayolu yok. Anasayfa dock'u kendi gönder butonuyla
 * çalışmaya devam eder (bu butona bağlı değil).
 *
 * Görsel olarak tab bar düzleminin üstüne taşan, `primary` arka planlı,
 * yuvarlak, büyük "+" ikonlu yükseltilmiş buton. Kapsayıcısı `flex-1` ile
 * diğer sekmelerle eşit pay alır. Sheet state'i bu bileşende yönetilir.
 *
 * `<Tabs>` `tabBarButton` `props` (basış davranışı dahil) sağlar; bunları
 * bilerek yok sayarız — kendi `onPress`'imizi kullanırız.
 *
 * Faz 15H — iPad floating pill nav (`FloatingPillTabBar`) bu butonu pill içinde
 * render eder. `compact={true}` props'u ile `flex-1` wrap + yükseltme kapatılır,
 * buton diğer pill sekmeleriyle eşit boyutta (`w-11 h-11`) kalır.
 */
export function CreateTabButton({ compact = false }: CreateTabButtonProps = {}) {
  const theme = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    // Phone (default): `flex-1` ile diğer 4 sekmeyle eşit pay alır.
    // Tablet pill (compact): kompakt `items-center justify-center`; pill içinde
    // diğer sekmelerle aynı boyutta kalır.
    <View className={compact ? 'items-center justify-center' : 'flex-1 items-center justify-center'}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.create.buttonLabel}
        accessibilityHint={strings.create.buttonHint}
        onPress={() => setMenuVisible(true)}
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
