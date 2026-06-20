import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View, useColorScheme } from 'react-native';
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
};

/**
 * Hızlı-not dock'unun sunum katmanı (DEM-230) — anasayfanın altına statik
 * olarak yerleşen, tam satırı kaplayan **çok satırlı** hızlı-not metin alanı
 * + sağında küçük yuvarlak send butonu. Klavye yönetimi üst katmandaki
 * `KeyboardAvoidingView` tarafından üstlenilir (artık `position:absolute` değil).
 *
 * Saf presentational; değer/callback'ler çağırandan gelir (`QuickNoteDock`
 * bağlar) — trpc / native bağımlılığı yoktur, birim test edilebilir.
 *
 * Send butonu sonrası UX: `onSubmit()` çağrılır, üst katman taslağı temizler;
 * aynı anda iç state `showSavedFeedback`'i 1.5 sn'lik görsel onaya açar.
 */
export function QuickNoteDockView({
  value,
  onChangeText,
  onSubmit,
  canSubmit,
}: QuickNoteDockViewProps) {
  const theme = themeFor(useColorScheme());

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

  return (
    <View className="border-b border-border bg-card px-4 py-2.5">
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
          multiline
          textAlignVertical="top"
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
  );
}
