import { Pressable, View } from 'react-native';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { AppSpinner } from '@/components/app-spinner';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

type ConfirmSheetProps = {
  visible: boolean;
  /** Başlık (Sheet üst çubuğu) — örn. "Notu sil". */
  title: string;
  /** Açıklama gövdesi — "Bu işlem geri alınamaz." gibi. */
  message: string;
  /** Onay butonu etiketi — örn. "Sil". */
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  /**
   * `true` (varsayılan) → onay butonu kırmızı (`destructive`) + çöp ikonu.
   * `false` → primary tonlu (yıkıcı olmayan onaylar için).
   */
  destructive?: boolean;
  /** Onay ikonu — verilmezse destructive'de `trash-2`, primary'de `check`. */
  icon?: IconName;
  /** Async iş sürerken — spinner gösterir, butonları kilitler. */
  pending?: boolean;
};

/**
 * Yıkıcı/önemli aksiyonlar için ortak onay sayfası — native `Alert.alert`
 * yerine tema-uyumlu, alttan açılan (tablet'te center) güzel panel. `Sheet`
 * kabuğu üzerine kurulu: backdrop tap / X ile kapanır, klavye-güvenli.
 *
 * Vurgulu onay butonu üstte (destructive → kırmızı zemin), altında düz "Vazgeç".
 * Silme akışları için: `quick-note-row` ve ileride diğer Alert tabanlı onaylar
 * bu bileşene taşınabilir (proje genelinde tutarlı onay deneyimi).
 */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  destructive = true,
  icon,
  pending = false,
}: ConfirmSheetProps) {
  const theme = useTheme();
  const confirmIcon: IconName = icon ?? (destructive ? 'trash-2' : 'check');
  const confirmTone = destructive ? 'bg-destructive' : 'bg-primary';
  const confirmTextTone = destructive ? 'text-white' : 'text-primary-foreground';
  const spinnerColor = destructive ? '#ffffff' : theme.primaryForeground;

  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <Text className="text-sm leading-relaxed text-muted-foreground">{message}</Text>
      <View className="gap-2 pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          accessibilityState={{ disabled: pending, busy: pending }}
          disabled={pending}
          onPress={onConfirm}
          className={`h-12 flex-row items-center justify-center gap-2 rounded-lg px-4 ${confirmTone} ${
            pending ? 'opacity-50' : 'active:opacity-80'
          }`}
        >
          {pending ? (
            <AppSpinner size="sm" color={spinnerColor} />
          ) : (
            <Icon name={confirmIcon} size={18} color={destructive ? '#ffffff' : theme.primaryForeground} />
          )}
          <Text weight="semibold" className={`text-base ${confirmTextTone}`}>
            {confirmLabel}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.common.cancel}
          disabled={pending}
          onPress={onClose}
          className={`h-12 items-center justify-center rounded-lg px-4 ${
            pending ? 'opacity-50' : 'active:opacity-60'
          }`}
        >
          <Text weight="medium" className="text-base text-foreground">
            {strings.common.cancel}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
