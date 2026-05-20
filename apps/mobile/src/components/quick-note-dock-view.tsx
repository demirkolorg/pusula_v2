import { useEffect, useRef } from 'react';
import { Animated, Keyboard, Platform, TextInput, View, useColorScheme } from 'react-native';
import type { KeyboardEvent, LayoutChangeEvent } from 'react-native';
import { strings } from '@/lib/strings';
import { defaultFontFamily } from '@/theme/fonts';
import { themeFor } from '@/theme/tokens';

/** Çok satırlı metin alanının büyüyebileceği en fazla yükseklik (px) — sonrası kayar. */
const MAX_INPUT_HEIGHT = 120;

export type QuickNoteDockViewProps = {
  /** Metin alanının değeri (taslak — `QuickNoteDraftProvider`'dan gelir). */
  value: string;
  /** Her tuş vuruşunda yeni metinle çağrılır. */
  onChangeText: (text: string) => void;
  /** Panel yüksekliği `onLayout` ile ölçülünce çağrılır. */
  onHeightChange: (height: number) => void;
};

/**
 * Hızlı-not dock'unun sunum katmanı (DEM-230) — anasayfanın altına sabit, tam
 * satırı kaplayan **çok satırlı** hızlı-not metin alanı. Buton yok, iç içe kart
 * yok: yalnız not yazma yüzeyi (kullanıcı kararı 2026-05-19). Kaydetme alt tab
 * bar'daki "+" butonuyla yapılır — çok satırlı olduğundan klavye "enter" tuşu
 * satır atlar, gönderim yapmaz.
 *
 * Saf presentational; değer/callback'ler çağırandan gelir (`QuickNoteDock`
 * bağlar) — trpc / native bağımlılığı yoktur, birim test edilebilir.
 *
 * Klavye davranışı (DEM-236 2. tur, 2026-05-20): dock `position: 'absolute'` +
 * `bottom: 0` ile ekran tabanına çividir. `KeyboardAvoidingView` `padding`
 * modu absolute-konumlu kutularla **güvenilir çalışmıyor** (RN dok uyarısı +
 * kullanıcı TestFlight gözlemi) — bunun yerine `Keyboard` event'lerine elle
 * bağlanır ve `bottom` style'ı animasyonlu olarak klavye yüksekliğine taşınır.
 * iOS `keyboardWillShow`/`Hide` doğal animasyon süresiyle (`e.duration`)
 * eşlenir; Android `keyboardDidShow`/`Hide` (iOS'ta `Will` yok). Tab bar
 * `tabBarHideOnKeyboard` ile gizlendiği için dock klavye yüksekliği kadar
 * yukarı çıkar; safe-area home indicator zaten `endCoordinates.height`'a dahil.
 */
export function QuickNoteDockView({ value, onChangeText, onHeightChange }: QuickNoteDockViewProps) {
  const theme = themeFor(useColorScheme());

  // `Animated.Value` ref ile sabit — render'lar arası değişmez.
  const bottomAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      Animated.timing(bottomAnim, {
        toValue: e.endCoordinates.height,
        // iOS'ta klavye animasyon süresini yansıt; yoksa makul default.
        duration: e.duration && e.duration > 0 ? e.duration : 250,
        // `bottom` layout property — native driver desteklemez (JS thread'de
        // çalışır ama klavye animasyon süresinde sorunsuz görünür).
        useNativeDriver: false,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, (e: KeyboardEvent) => {
      Animated.timing(bottomAnim, {
        toValue: 0,
        duration: e.duration && e.duration > 0 ? e.duration : 250,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [bottomAnim]);

  // `onLayout` aynı yükseklikle de (re-render / rotation) tekrar ateşlenebilir;
  // değer değişmedikçe çağıranı (anasayfa `paddingBottom` state'i) dürtmeyiz.
  // Çok satırlı input büyüdükçe panel yüksekliği değişir → bu callback yeniden
  // çağrılır, içerik alt boşluğu güncel kalır.
  const lastHeight = useRef(-1);
  const handleLayout = (event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    if (height === lastHeight.current) return;
    lastHeight.current = height;
    onHeightChange(height);
  };

  return (
    <Animated.View
      // Absolute konum + tam genişlik açıkça `style` ile verilir: NativeWind
      // `inset-x-0` `Animated.View`'da güvenilir uygulanmıyor (dock içeriğe
      // göre büzülüp yarım genişlikte kalıyordu) — `left/right: 0` tam satırı
      // garantiler. `bottom` animasyonlu — klavye eventlerine bağlı.
      style={{ position: 'absolute', left: 0, right: 0, bottom: bottomAnim }}
    >
      <View onLayout={handleLayout} className="border-t border-border bg-card px-4 py-2.5">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={strings.quickNotes.addPlaceholder}
          placeholderTextColor={theme.mutedForeground}
          selectionColor={theme.primary}
          accessibilityLabel={strings.quickNotes.addPlaceholder}
          // Çok satırlı — uzun not tek satıra sıkışmaz; "enter" satır atlar,
          // kaydetme tab bar'daki "+" butonuyla yapılır.
          multiline
          textAlignVertical="top"
          // `TextInput` `Text` değildir — Poppins'i style ile açıkça uygula.
          // Büyüme `MAX_INPUT_HEIGHT`'te durur, sonrası alan içinde kayar.
          style={{ fontFamily: defaultFontFamily, maxHeight: MAX_INPUT_HEIGHT }}
          className="min-h-11 text-sm text-foreground"
        />
      </View>
    </Animated.View>
  );
}
