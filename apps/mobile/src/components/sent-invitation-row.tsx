import { Alert, Pressable, View } from 'react-native';
import { EntityAvatar } from '@/components/entity-avatar';
import { Icon } from '@/components/icon';
import { RoleBadge } from '@/components/role-badge';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

type SentInvitationRowProps = {
  /** Davet edilen e-posta adresi — satırın birincil kimliği. */
  email: string;
  /** Önceden Türkçe'ye çevrilmiş rol etiketi. */
  roleLabel: string;
  /** Daveti gönderen kişinin adı — opsiyonel alt satır. */
  invitedByName?: string | null;
  /** Davet iptali uçuşta mı (buton kilidi + "İptal ediliyor…"). */
  pending: boolean;
  /**
   * Tanımlıysa satır sonunda iptal tetikleyicisi gösterilir (DEM-210 —
   * `admin+` için). `Alert` onayı bu bileşende yönetilir; onaylanırsa çağrılır.
   */
  onCancel?: () => void;
};

/**
 * DEM-210 — gönderilen (bekleyen) davet satırı. E-posta + rol rozeti + davet
 * eden; `admin+` için satır sonu ⋮ tetikleyicisi `Alert` onayıyla daveti iptal
 * eder (`{workspace,board}.invitations.revoke`). `onCancel` verilmezse satır
 * salt görüntülemedir.
 */
export function SentInvitationRow({
  email,
  roleLabel,
  invitedByName,
  pending,
  onCancel,
}: SentInvitationRowProps) {
  const theme = useTheme();

  const handlePress = () => {
    Alert.alert(
      strings.invitations.cancelConfirmTitle,
      strings.invitations.cancelConfirmMessage,
      [
        { text: strings.invitations.decline, style: 'cancel' },
        {
          text: strings.invitations.cancelConfirm,
          style: 'destructive',
          onPress: () => onCancel?.(),
        },
      ],
      { cancelable: true },
    );
  };

  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-3">
      <EntityAvatar name={email} size={40} />
      <View className="flex-1 gap-0.5">
        <Text weight="semibold" className="text-base text-foreground" numberOfLines={1}>
          {email}
        </Text>
        {invitedByName ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {`${strings.invitations.invitedByPrefix} ${invitedByName}`}
          </Text>
        ) : null}
      </View>
      <RoleBadge label={pending ? strings.invitations.cancelling : roleLabel} />
      {onCancel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.invitations.actionsLabel}
          accessibilityState={{ disabled: pending }}
          disabled={pending}
          hitSlop={8}
          onPress={handlePress}
          className={pending ? 'opacity-40' : 'active:opacity-60'}
        >
          <Icon name="x-circle" size={20} color={theme.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}
