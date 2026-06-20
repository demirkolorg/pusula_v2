import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/icon';
import { useIsTablet } from '@/lib/use-device-class';
import { themeFor } from '@/theme/tokens';

export type MasterDetailFallback = 'master' | 'detail';

export interface MasterDetailLayoutProps {
  /** Sol (master) tarafa render edilecek içerik — tablet'te sidebar, phone'da varsayılan view. */
  master: ReactNode;
  /** Sağ (detail) tarafa render edilecek içerik — tablet'te main pane, phone'da `selectedDetail` ile gösterilir. */
  detail: ReactNode;
  /**
   * Phone'da `selectedDetail` yokken hangi taraf render edilsin.
   * Default `'master'` — kullanıcı seçim yapana kadar liste/sidebar gözükür.
   */
  fallback?: MasterDetailFallback;
  /** Phone branch için: `true` ise `detail` render edilir; `false` ise `fallback` taraf çizilir. Tablet branch'inde yok sayılır. */
  selectedDetail?: boolean;
  /** Tablet sidebar (master) genişliği — px. Default 320, önerilen aralık 320–400 ([`13-ui-tasarim-dili.md`](../../../../docs/architecture/13-ui-tasarim-dili.md) §13.12.1). */
  sidebarWidth?: number;
  /**
   * `true` ise tablet branch'inde sidebar bir kenar tutamacıyla (chevron butonu)
   * açılıp kapatılabilir. Default `false` → eski davranış (sidebar sabit görünür),
   * collapsible vermeyen ekranlar etkilenmez. OTA-uyumlu, saf JS (reanimated).
   */
  collapsible?: boolean;
  /**
   * Daraltma durumunu **dışarıdan** yönetmek için (2026-06-19). Verilirse bileşen
   * kontrollü çalışır: iç state yerine bu değeri kullanır ve **kenar tutamacını
   * çizmez** (toggle'ı çağıran ekran kendi header'ında gösterir; bkz. board
   * ekranı). Verilmezse eski davranış: iç state + yüzen kenar tutamacı.
   */
  collapsed?: boolean;
  /** Test/E2E erişimi için ekran kökü id'si; `${testID}-master` / `${testID}-detail` alt slot id'leri tablet branch'inde üretilir. */
  testID?: string;
}

/**
 * Faz 15C (DEM-303) — master-detail layout primitive'i.
 *
 * **Tablet** (`useIsTablet() === true`): `flex-row` yan yana — sol sidebar
 * sabit genişlikte (`sidebarWidth`, default 320), sağ main `flex-1`. Hem
 * `master` hem `detail` render edilir; `selectedDetail` yok sayılır.
 *
 * **Tablet + `collapsible`** (DEM-303 V2 — 2026-06-17): sidebar bir kenar
 * tutamacıyla daraltılabilir. Tutamaç sidebar/detail sınırında dikey ortada
 * yüzer; daralt animasyonu reanimated `width` geçişidir (240ms), içerik
 * `overflow-hidden` ile kırpılır ve sabit iç genişlikle reflow etmez. Native
 * bağımlılık yok → `eas build` gerektirmeden `eas update` (OTA) ile dağıtılır.
 *
 * **Phone** (`useIsTablet() === false`): tek view. `selectedDetail` truthy ise
 * `detail`, aksi halde `fallback` (default `'master'`) tarafı render edilir.
 */
export function MasterDetailLayout({
  master,
  detail,
  fallback = 'master',
  selectedDetail = false,
  sidebarWidth = 320,
  collapsible = false,
  collapsed: collapsedProp,
  testID,
}: MasterDetailLayoutProps) {
  const isTablet = useIsTablet();
  const theme = themeFor(useColorScheme());

  // Hook'lar koşulsuz çağrılır (Rules of Hooks). Phone/non-collapsible branch'te
  // kullanılmasalar da ucuzdur. `width` shared value sidebar genişliğini taşır;
  // toggle'da 0 ↔ sidebarWidth arası withTiming.
  // `collapsedProp` verilirse kontrollü (dış state); yoksa iç state + kenar
  // tutamacı (eski davranış).
  const controlled = collapsedProp !== undefined;
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlled ? collapsedProp : internalCollapsed;
  const width = useSharedValue(sidebarWidth);

  // Genişliği hem daraltma durumuna hem rotasyon/Split View'a (sidebarWidth)
  // göre senkronla: kapalı → 0, açık → güncel sidebarWidth (board ekranı
  // landscape'te 384, portrait'te 320 verir). Kontrollü modda tercih async
  // yüklenince (kapalı) tek seferlik aç→kapa animasyonu görünebilir — kabul.
  useEffect(() => {
    width.value = withTiming(collapsed ? 0 : sidebarWidth, { duration: 240 });
  }, [sidebarWidth, collapsed, width]);

  const sidebarAnimStyle = useAnimatedStyle(() => ({ width: width.value }));
  // Tutamaç sidebar'ın sağ kenarına yapışır (translateX = güncel genişlik);
  // kapalıyken (width 0) ekranın sol kenarına gelir.
  const handleAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: width.value }],
  }));

  if (isTablet && collapsible) {
    // Yalnız kontrolsüz modda kullanılır (iç kenar tutamacı). Genişlik
    // animasyonunu yukarıdaki effect `collapsed`'a bakarak yürütür.
    const toggle = () => setInternalCollapsed((prev) => !prev);

    return (
      <View testID={testID} className="flex-1 flex-row bg-background">
        {/* NativeWind className Animated.View'a uygulanmadığından (interop yok,
            bkz. swipe-row.tsx) görsel stiller token ile inline verilir. */}
        <Animated.View
          testID={testID ? `${testID}-master` : undefined}
          style={[
            sidebarAnimStyle,
            {
              overflow: 'hidden',
              borderRightWidth: 1,
              borderRightColor: theme.border,
              backgroundColor: theme.card,
            },
          ]}
        >
          {/* Sabit iç genişlik: daralma animasyonu sırasında master içeriği
              reflow edip metni sıkıştırmasın; dış kapsayıcı kırpar. */}
          <View style={{ width: sidebarWidth, flex: 1 }}>{master}</View>
        </Animated.View>
        <View
          testID={testID ? `${testID}-detail` : undefined}
          className="flex-1 bg-background"
        >
          {detail}
        </View>
        {/* Kenar tutamacı — yalnız KONTROLSÜZ modda. Kontrollü modda (board
            ekranı) toggle header'a taşındığından (2026-06-19) tutamaç çizilmez.
            Sidebar/detail sınırında dikey ortada yüzer; kapalıyken de erişilebilir. */}
        {!controlled ? (
          <Animated.View
            pointerEvents="box-none"
            style={[
              { position: 'absolute', top: '50%', left: 0, marginTop: -18 },
              handleAnimStyle,
            ]}
          >
            <Pressable
              onPress={toggle}
              accessibilityRole="button"
              accessibilityLabel={collapsed ? 'Paneli aç' : 'Paneli kapat'}
              accessibilityState={{ expanded: !collapsed }}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full border border-border bg-card active:opacity-70"
              style={{
                marginLeft: -18,
                shadowColor: '#000',
                shadowOpacity: 0.18,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 8,
              }}
            >
              <Icon
                name={collapsed ? 'chevron-right' : 'chevron-left'}
                size={20}
                color={theme.mutedForeground}
              />
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    );
  }

  if (isTablet) {
    return (
      <View testID={testID} className="flex-1 flex-row bg-background">
        <View
          testID={testID ? `${testID}-master` : undefined}
          className="border-r border-border bg-card"
          style={{ width: sidebarWidth }}
        >
          {master}
        </View>
        <View
          testID={testID ? `${testID}-detail` : undefined}
          className="flex-1 bg-background"
        >
          {detail}
        </View>
      </View>
    );
  }

  const showDetail = selectedDetail || fallback === 'detail';
  return (
    <View testID={testID} className="flex-1 bg-background">
      {showDetail ? detail : master}
    </View>
  );
}
