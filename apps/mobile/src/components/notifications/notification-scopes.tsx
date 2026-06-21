import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { RoleSelect } from '@/components/role-select';
import { Text } from '@/components/text';
import { useNotificationPreferences } from '@/lib/use-notification-preferences';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/provider';
import { useTheme } from '@/theme/theme-provider';

type PreferenceRow = RouterOutputs['notifications']['preferences']['list'][number];
type MuteLevel = 'none' | 'mentions_only' | 'all';

/** Bir tercih satırının kapsam türü. */
function scopeKind(row: {
  workspaceId: string | null;
  boardId: string | null;
  cardId: string | null;
}): 'global' | 'workspace' | 'board' | 'card' {
  if (row.cardId) return 'card';
  if (row.boardId) return 'board';
  if (row.workspaceId) return 'workspace';
  return 'global';
}

const KIND_ICON: Record<'workspace' | 'board' | 'card', IconName> = {
  workspace: 'layers',
  board: 'trello',
  card: 'credit-card',
};

/**
 * Bildirim ayar ekranı "Kapsam ayarları" bölümü (Faz 7K) — workspace/board/
 * card override satırları.
 *
 * `notifications.preferences.list` tüm scope satırlarını hiyerarşi sırasında
 * (global → workspace → board → card) döner; backend `scopeLabel` JOIN ile
 * ekler. Global satır burada gösterilmez (üst "Genel kanallar" bölümü onu
 * yönetir). Her satırda sustur seviyesi seçici + "Kaldır".
 *
 * Mobil MVP override **ekleme** yüzeyi içermez (web `notifications-scope-add-
 * dialog` workspace/board ağacı gerektirir); mevcut override'lar düzenlenir /
 * silinir. Override'lar kart detay/board ekranlarından (ileri faz) ya da web'den
 * oluşturulur.
 */
export function NotificationScopes() {
  const trpc = useTRPC();
  const theme = useTheme();
  const copy = strings.notificationSettings.scopes;
  const query = useQuery(trpc.notifications.preferences.list.queryOptions());
  const { saveScope, removeScope, isRemovingScope } = useNotificationPreferences();

  const muteOptions: readonly { value: MuteLevel; label: string }[] = [
    { value: 'none', label: strings.notificationSettings.mute.none },
    { value: 'mentions_only', label: strings.notificationSettings.mute.mentionsOnly },
    { value: 'all', label: strings.notificationSettings.mute.all },
  ];

  if (query.isPending) {
    return <Text className="text-sm text-muted-foreground">{strings.common.loading}</Text>;
  }
  if (query.isError) {
    return <Text className="text-sm text-destructive">{copy.loadError}</Text>;
  }

  const overrides = (query.data ?? []).filter(
    (row: PreferenceRow) => scopeKind(row) !== 'global',
  );
  if (overrides.length === 0) {
    return <Text className="text-sm text-muted-foreground">{copy.empty}</Text>;
  }

  return (
    <View className="gap-4">
      {overrides.map((row: PreferenceRow) => {
        const kind = scopeKind(row) as 'workspace' | 'board' | 'card';
        const scope = {
          workspaceId: row.workspaceId ?? undefined,
          boardId: row.boardId ?? undefined,
          cardId: row.cardId ?? undefined,
        };
        const kindLabel =
          kind === 'card'
            ? copy.kindCard
            : kind === 'board'
              ? copy.kindBoard
              : copy.kindWorkspace;
        return (
          <View key={row.id} className="gap-2 border-b border-border pb-3 last:border-b-0">
            <View className="flex-row items-center gap-2">
              <Icon name={KIND_ICON[kind]} size={15} color={theme.mutedForeground} />
              <Text weight="medium" className="text-[11px] uppercase text-muted-foreground">
                {kindLabel}
              </Text>
              <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                {row.scopeLabel}
              </Text>
            </View>
            <RoleSelect
              label={strings.notificationSettings.mute.title}
              options={muteOptions}
              value={row.muteLevel as MuteLevel}
              onChange={(level) =>
                saveScope(scope, {
                  muteLevel: level,
                  mentionOnly: row.mentionOnly,
                  pushEnabled: row.pushEnabled,
                  emailEnabled: row.emailEnabled,
                })
              }
            />
            <View className="flex-row">
              <View className="w-32">
                <Button
                  label={isRemovingScope ? copy.removing : copy.remove}
                  variant="ghost"
                  onPress={() => removeScope(scope)}
                  disabled={isRemovingScope}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
