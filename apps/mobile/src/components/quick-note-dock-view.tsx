import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Platform, Pressable, TextInput, View, useColorScheme } from 'react-native';
import type { KeyboardEvent, LayoutChangeEvent } from 'react-native';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';
import { defaultFontFamily } from '@/theme/fonts';
import { themeFor } from '@/theme/tokens';

/** Çok satırlı metin alanının büyüyebileceği en fazla yükseklik (px) — sonrası kayar. */
const MAX_INPUT_HEIGHT = 120;

/** "Kaydedildi" feedback metninin görünür kaldığı süre (ms). */
const FEEDBACK_DURATION_MS = 1500;

export type QuickNoteDockViewProps = {
  /** Metin alanının değeri (taslak — `QuickNoteDraftProvider`'dan gelir). */
  value: string;
  /** Her tuş vuruşunda yeni metinle çağrılır. */
  onChangeText: (text: string) => void;
  /** Send butonuna basılınca çağrılır — boş için no-op (üst katman kararı). */
  onSubmit: () => void;
  /** Send butonu aktif mi (taslak trim'lenmiş hâli boş değil mi). */
  canSubmit: boolean;
  /** Panel yüksekliği `onLayout` ile ölçülünce çağrılır. */
  onHeightChange: (height: number) => void;
};

/**
 * Hızlı-not dock'unun sunum katmanı (DEM-230) — anasayfanın altına sabit, tam
 * satırı kaplayan **çok satırlı** hızlı-not metin alanı + sağında küçük yuvarlak
 * send butonu (DEM-236 2. tur, 2026-05-21). Klavye açıldığında dock klavye
 * üstüne çıkar (manuel `Keyboard` listener'ı) ve send butonu klavye accessory'si
 * gibi davranır — tab bar gizlenince bile (`tabBarHideOnKeyboard:true`) gönderim
 * yolu erişilebilir kalır.
 *
 * Saf presentational; değer/callback'ler çağırandan gelir (`QuickNoteDock`
 * bağlar) — trpc / native bağımlılığı yoktur, birim test edilebilir.
 *
 * Klavye davranışı (DEM-236 2. tur, 2026-05-20/21): dock `position: 'absolute'`
 * + `bottom: 0` ile ekran tabanına çividir. `KeyboardAvoidingView` `padding`
 * modu absolute-konumlu kutularla **güvenilir çalışmıyor** (RN dok uyarısı +
 * kullanıcı TestFlight gözlemi) — bunun yerine `Keyboard` event'lerine elle
 * bağlanır ve `bottom` style'ı animasyonlu olarak klavye yüksekliğine taşınır.
 * iOS `keyboardWillShow`/`Hide` doğal animasyon süresiyle (`e.duration`)
 * eşlenir; Android `keyboardDidShow`/`Hide` (iOS'ta `Will` yok). Tab bar
 * `tabBarHideOnKeyboard` ile gizlendiği için dock klavye yüksekliği kadar
 * yukarı çıkar; safe-area home indicator zaten `endCoordinates.height`'a dahil.
 *
 * Send butonu sonrası UX (DEM-236 2. tur): `onSubmit()` çağrılır, üst katman
 * taslağı temizler; aynı anda iç state `showSavedFeedback`'i 1.5 sn'lik küçük
 * görsel onaya (`"Kaydedildi"`) açar — kullanıcı eylemi başarılı olduğunu
 * bilsin (toast altyapısı yok; mevcut bir hata için `Alert.alert` kullanılıyor
 * ama başarı için tam-ekran modal abartı olur).
 */
export function QuickNoteDockView({
  value,
  onChangeText,
  onSubmit,
  canSubmit,
  onHeightChange,
}: QuickNoteDockViewProps) {
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

  // Send butonu basıldıktan sonra 1.5 sn boyunca görünen "Kaydedildi" feedback'i.
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit();
    setShowSavedFeedback(true);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => {
      setShowSavedFeedback(false);
      feedbackTimer.current = null;
    }, FEEDBACK_DURATION_MS);
  };

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
        {showSavedFeedback ? (
          <View
            accessibilityLiveRegion="polite"
            className="mb-1.5 flex-row items-center gap-1"
          >
            <Icon name="check" size={12} color={theme.primary} />
            <Text className="text-xs text-muted-foreground">{strings.quickNotes.saved}</Text>
          </View>
        ) : null}
        <View className="flex-row items-end gap-2">
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={strings.quickNotes.addPlaceholder}
            placeholderTextColor={theme.mutedForeground}
            selectionColor={theme.primary}
            accessibilityLabel={strings.quickNotes.addPlaceholder}
            // Çok satırlı — uzun not tek satıra sıkışmaz; "enter" satır atlar,
            // gönderim send butonuyla yapılır (multiline'da `onSubmitEditing`
            // bağlamak da pratik değil — kullanıcı satır atlayamaz olur).
            multiline
            textAlignVertical="top"
            // `TextInput` `Text` değildir — Poppins'i style ile açıkça uygula.
            // Büyüme `MAX_INPUT_HEIGHT`'te durur, sonrası alan içinde kayar.
            style={{ fontFamily: defaultFontFamily, maxHeight: MAX_INPUT_HEIGHT }}
            className="min-h-11 flex-1 text-sm text-foreground"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.quickNotes.addSubmit}
            disabled={!canSubmit}
            onPress={handleSubmit}
            style={{
              backgroundColor: canSubmit ? theme.primary : theme.muted,
              opacity: canSubmit ? 1 : 0.6,
            }}
            // Yuvarlak küçük FAB — TextInput'la dikey hizalı (multiline büyüyünce
            // input yukarı doğru genişler, send butonu altta sabit kalır).
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-80"
          >
            <Icon
              name="arrow-up"
              size={20}
              color={canSubmit ? theme.primaryForeground : theme.mutedForeground}
            />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}
