import { Pressable } from 'react-native';
import { Icon } from '@/components/icon';
import { hapticLight, hapticSuccess } from '@/lib/haptics';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

type CardCompleteToggleProps = {
  completed: boolean;
  /** `false` ise salt-gösterim (viewer) — dokunulamaz. */
  canEdit: boolean;
  /** Mutation uçuşta — çift gönderim engellenir. */
  pending: boolean;
  onToggle: () => void;
};

/**
 * Kart detay başlığındaki tamamla/geri al toggle'ı (Faz 7G-2 — DEM-195). Web
 * `CardCompleteToggle` simetrisi: tamamlanmış kart dolu yeşil `check-circle`,
 * tamamlanmamış kart `circle` ana hattı. `card.complete`/`uncomplete` çağrısı
 * çağırana (`useCardMutations`) aittir; bu bileşen salt sunum. `canEdit=false`
 * (board `viewer`) durumunda dokunulamaz ikon olarak çizilir.
 */
export function CardCompleteToggle({
  completed,
  canEdit,
  pending,
  onToggle,
}: CardCompleteToggleProps) {
  const theme = useTheme();
  const iconName = completed ? 'check-circle' : 'circle';
  const iconColor = completed ? theme.success : theme.mutedForeground;

  if (!canEdit) {
    return <Icon name={iconName} size={22} color={iconColor} />;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ checked: completed }}
      accessibilityLabel={
        completed ? strings.cardDetail.markIncomplete : strings.cardDetail.markComplete
      }
      disabled={pending}
      hitSlop={8}
      onPress={() => {
        // Tamamlama olumlu sonuç → başarı haptiği; geri alma nazik → hafif.
        if (completed) hapticLight();
        else hapticSuccess();
        onToggle();
      }}
      className={pending ? 'opacity-50' : 'active:opacity-60'}
    >
      <Icon name={iconName} size={22} color={iconColor} />
    </Pressable>
  );
}
