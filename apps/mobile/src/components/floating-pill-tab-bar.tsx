import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Text } from '@/components/text';
import {
  DEFAULT_NAV_PILL_POSITION,
  loadNavPillPosition,
  saveNavPillPosition,
  type NavPillPosition,
} from '@/lib/nav-pill-preference';
import { themeFor } from '@/theme/tokens';

/** Pill kenar boşluğu (snap uçlarında ekran kenarıyla pill arası px). */
const EDGE_MARGIN = 8;

/**
 * Faz 15H — iPad floating pill bottom nav (2026-05-31 2. tur revizyonu).
 *
 * `apps/mobile/app/(app)/_layout.tsx` `<Tabs tabBar={…}>` prop'una takılır;
 * tablet'te (`useIsTablet()`) bu bileşen, phone'da React Navigation default
 * `BottomTabBar` render edilir. Phone parite garantisi — iPhone'da hiç
 * çağrılmaz.
 *
 * Anatomi (`13-ui-tasarim-dili.md` §13.12.6.1):
 * - Pozisyon: scroll içeriğin **üstünde** yüzer (Apple Music iPad / Trello
 *   iPad pattern). `position: absolute`, `alignSelf: 'center'`, `bottom:
 *   safeArea.bottom + 12`.
 * - Pill: `rounded-full bg-card border border-border` + gölge (iOS shadow*,
 *   Android elevation), iç padding `px-2 py-1.5`.
 * - Sekme: `flex-row items-center gap-1.5 px-3 py-2 rounded-full`, ikon
 *   (size 20) + label (text-sm). Aktif sekme alt-tone background (`bg-muted`).
 * - Aktif/inaktif tint: mevcut `tabBarActiveTintColor` / `tabBarInactiveTintColor`
 *   `screenOptions`'tan alınır (theme `primary` / `mutedForeground`).
 * - Badge: `options.tabBarBadge` mevcutsa sağ-üst overlay (`bg-destructive`).
 *
 * K4 revize gerekçesi → [`docs/architecture/18-ipad-uyarlamasi.md`](../../../docs/architecture/18-ipad-uyarlamasi.md)
 * §2.4 + revizyon notu. 15E rollback: `tabBarPosition: 'top'` kaldırıldı,
 * `tabBarHideOnKeyboard: true` default'a döndü.
 *
 * Sınırlamalar:
 * - `pointerEvents="box-none"` ile pill dışındaki area touch'ı geçirir
 *   (altındaki scroll içeriği etkileşebilir).
 * - Scroll içeriği pill arkasına geçmemeli — her ekranda
 *   `useBottomTabBarHeight()` + 24px breath ile `contentContainerStyle.
 *   paddingBottom` ayarlanması 15F kapsamında smoke test edilir.
 * - `options.tabBarButton` (CreateTabButton) `compact={isTablet}` ile pill
 *   içinde küçük (`w-11 h-11`) render olur — `_layout.tsx`'te wiring var.
 */
export function FloatingPillTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const theme = themeFor(useColorScheme());
  const { width: screenWidth } = useWindowDimensions();

  // DEM-303 V2 (2026-06-17) — pill sürüklenip sol/orta/sağ üç sabit konuma
  // oturtulabilir. Gerekçe: pill ekran ortasında sabitken altındaki listenin
  // "Kart ekle" butonunu örtüyordu; kullanıcı pill'i kaydırıp butona erişebilir.
  // `translateX` ebeveynin `alignItems: 'center'` merkezinden sapma; saf JS
  // (reanimated/gesture-handler zaten kurulu) → OTA ile dağıtılır.
  const translateX = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  // Merkezden azami sapma — pill kenara `EDGE_MARGIN` kalana dek kayar.
  const maxShift = useSharedValue(0);
  const [pillWidth, setPillWidth] = useState(0);

  const onPillLayout = (e: LayoutChangeEvent) => {
    setPillWidth(e.nativeEvent.layout.width);
  };

  // Kalıcılık (2026-06-19) — bırakılan konumu (sol/orta/sağ) hatırla. Açılışta
  // yükle; sürükleme bitince (snap) yaz. Konum bir faktör (-1/0/+1) olarak
  // saklanır; gerçek translateX = faktör × güncel maxShift, böylece
  // rotation/Split View'da da doğru kenara yapışık kalır.
  const [position, setPosition] = useState<NavPillPosition>(DEFAULT_NAV_PILL_POSITION);
  useEffect(() => {
    let active = true;
    void loadNavPillPosition().then((stored) => {
      if (active) setPosition(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  // Konum (yüklenince/değişince) ya da ekran/pill genişliği (rotasyon/Split View)
  // değişince azami sapmayı yeniden hesapla ve pill'i konumuna yayla. Hem ilk
  // restorasyonu hem yeniden boyutlandırmada doğru kenarı korur.
  useEffect(() => {
    const m = Math.max(0, (screenWidth - pillWidth) / 2 - EDGE_MARGIN);
    maxShift.value = m;
    const factor = position === 'left' ? -1 : position === 'right' ? 1 : 0;
    translateX.value = withSpring(factor * m, { damping: 18, stiffness: 180 });
  }, [position, screenWidth, pillWidth, maxShift, translateX]);

  // Snap sonrası konumu kaydet (UI thread'den `runOnJS` ile çağrılır).
  const persistPosition = useCallback((next: NavPillPosition) => {
    setPosition(next);
    void saveNavPillPosition(next);
  }, []);

  const panGesture = Gesture.Pan()
    // Yatay eşik: pill içindeki sekme dokunuşlarını/dikey hareketi çalmadan
    // yalnız belirgin yatay sürüklemede aktive olur (tap'ler Pressable'a gider).
    .activeOffsetX([-12, 12])
    .onStart(() => {
      dragStartX.value = translateX.value;
    })
    .onUpdate((e) => {
      const m = maxShift.value;
      let next = dragStartX.value + e.translationX;
      if (next > m) next = m;
      else if (next < -m) next = -m;
      translateX.value = next;
    })
    .onEnd(() => {
      // En yakın hedefe (sol = -m / orta = 0 / sağ = +m) yaylanarak otur.
      // Eşik m/2 — yarı yolu geçince bir sonraki konuma kilitlenir.
      const m = maxShift.value;
      const x = translateX.value;
      let nearest = 0;
      let next: NavPillPosition = 'center';
      if (x <= -m / 2) {
        nearest = -m;
        next = 'left';
      } else if (x >= m / 2) {
        nearest = m;
        next = 'right';
      }
      translateX.value = withSpring(nearest, { damping: 18, stiffness: 180 });
      // Konumu kalıcı yaz — `setPosition` state'i de senkron tutar (apply effect
      // aynı değere idempotent yaylar). UI thread → JS thread köprüsü.
      runOnJS(persistPosition)(next);
    });

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: insets.bottom + 12,
        left: 0,
        right: 0,
        alignItems: 'center',
      }}
    >
      {/* NativeWind className Animated.View'a uygulanmaz (interop yok, bkz.
          swipe-row.tsx) → Animated.View yalnız transform taşır, pill görünümü
          içteki normal View'da className ile kalır. onLayout pill genişliğini
          ölçer (snap sınırı hesabı). */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={pillStyle}>
          <View
            onLayout={onPillLayout}
            className="flex-row items-center gap-1 rounded-full border border-border bg-card px-2 py-1.5"
            style={{
              // Pill yüzen his — iOS shadow + Android elevation. Border'a ek olarak
              // gölge "card düzleminin üstünde" hissini güçlendirir.
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 10,
            }}
          >
            {state.routes.map((route, index) => {
          // Gizli `index` route'u (cold-start redirect) tab bar'da hiç görünmez —
          // güvenlik için açıkça skip et (React Navigation `href: null` zaten
          // gizler, çift güvence).
          if (route.name === 'index') return null;

          // `descriptors` map'i string indeksli `BottomTabDescriptor | undefined`
          // döner; `noUncheckedIndexedAccess` aktif olduğundan açık guard gerekir.
          // `state.routes`'taki her route'un descriptor'ı garanti edilir — undefined
          // teorik durum için defansif skip.
          const descriptor = descriptors[route.key];
          if (!descriptor) return null;
          const { options } = descriptor;
          const isFocused = state.index === index;

          // `tabBarButton` (CreateTabButton) — kendi onPress/onLongPress'i var,
          // descriptor üzerinden çağırıp pill'in `gap` boşluğuna oturt.
          // CreateTabButton `flex-1` wrap yapmadığı (compact=true) için pill
          // içinde diğer sekmelerle eşit boyutta kalır. React Navigation v7
          // `BottomTabBarButtonProps` imzası `children` + 10+ field bekler;
          // CreateTabButton bunları görmezden geldiği için boş prop seti
          // güvenli — TS imzasını `unknown` üzerinden gevşetiyoruz.
          if (options.tabBarButton) {
            const renderTabBarButton = options.tabBarButton as unknown as (
              props: Record<string, unknown>,
            ) => React.ReactNode;
            return (
              <View key={route.key} className="mx-0.5">
                {renderTabBarButton({})}
              </View>
            );
          }

          const labelText =
            typeof options.title === 'string' && options.title.length > 0
              ? options.title
              : route.name;
          const color = isFocused ? theme.primary : theme.mutedForeground;
          const accessibilityLabel = options.tabBarAccessibilityLabel ?? labelText;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              // React Navigation 7 nested-typed overload'u TS tarafında karışır;
              // tek-argüman overload `navigate(name)` tab route'ları için yeter
              // (parametresiz). `as never` ile generic type-arg gevşetilir.
              navigation.navigate(route.name as never);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          const badge = options.tabBarBadge;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={accessibilityLabel}
              onPress={onPress}
              onLongPress={onLongPress}
              className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 ${
                isFocused ? 'bg-muted' : 'active:opacity-70'
              }`}
            >
              {options.tabBarIcon
                ? options.tabBarIcon({ focused: isFocused, color, size: 20 })
                : null}
              <Text
                weight={isFocused ? 'semibold' : 'medium'}
                // Pill içinde label kompakt kalsın — tablet typography auto-scale
                // (1.125×) burada `text-sm` 14px → 16px yapardı, pill yüksekliği
                // büyür; opt-out ile sabit 14px.
                tabletScale={1.0}
                className="text-sm"
                style={{ color }}
              >
                {labelText}
              </Text>
              {badge != null ? (
                <View
                  // Badge: pill sekmesinin sağ-üstüne overlay; `absolute` ile
                  // pill içeriğin akışından çıkar, sekme genişliğini etkilemez.
                  className="absolute -right-0.5 -top-0.5 min-w-[18px] items-center justify-center rounded-full px-1"
                  style={{ backgroundColor: theme.destructive }}
                >
                  <Text
                    weight="semibold"
                    tabletScale={1.0}
                    className="text-[10px]"
                    style={{ color: '#ffffff' }}
                  >
                    {String(badge)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            );
          })}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
