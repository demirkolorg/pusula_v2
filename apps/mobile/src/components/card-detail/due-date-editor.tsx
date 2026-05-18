import { Alert, Pressable, View, useColorScheme } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { DetailSection } from '@/components/card-detail/section';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { formatDueDate, isOverdue } from '@/lib/format-date';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type CardGet = RouterOutputs['card']['get'];

type DueDateEditorProps = {
  cardId: string;
  dueAt: Date | null;
  completed: boolean;
  /** Çağıran board `member+` mi — `false` ise salt-okunur. */
  canEdit: boolean;
};

type PresetKind = 'today' | 'tomorrow' | 'weekend' | 'nextWeek';

/**
 * Bir hazır-ayar anahtarını somut son tarihe çevirir — saat 18:00'e sabitlenir
 * (makul bir gün-sonu teslimi). Mobil MVP'de tam takvim seçici yok; ortak
 * senaryolar hazır-ayarlarla karşılanır (drag-drop yerine "move to list"
 * deseniyle aynı pragmatik mobil yaklaşım — Faz 7.0).
 */
function presetDate(kind: PresetKind): Date {
  const date = new Date();
  date.setHours(18, 0, 0, 0);
  if (kind === 'tomorrow') {
    date.setDate(date.getDate() + 1);
  } else if (kind === 'nextWeek') {
    date.setDate(date.getDate() + 7);
  } else if (kind === 'weekend') {
    // Bir sonraki cumartesi; bugün cumartesiyse gelecek cumartesi.
    const offset = (6 - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + offset);
  }
  return date;
}

const PRESETS: { kind: PresetKind; label: string }[] = [
  { kind: 'today', label: strings.cardDetail.dueToday },
  { kind: 'tomorrow', label: strings.cardDetail.dueTomorrow },
  { kind: 'weekend', label: strings.cardDetail.dueWeekend },
  { kind: 'nextWeek', label: strings.cardDetail.dueNextWeek },
];

/**
 * Kart son tarihi — hazır-ayar seçici (ayarla) + kaldır (Faz 7G). Mutation
 * optimistic: `card.get` cache'indeki `dueAt` anında yamanır, hata olursa geri
 * alınır. `card.update` `dueAt` alanına `Date` ya da `null` (temizle) yazar.
 */
export function DueDateEditor({ cardId, dueAt, completed, canEdit }: DueDateEditorProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = themeFor(useColorScheme());
  const cardKey = trpc.card.get.queryKey({ cardId });

  const updateCard = useMutation(
    trpc.card.update.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: cardKey });
        const prev = queryClient.getQueryData<CardGet>(cardKey);
        if (prev && 'dueAt' in vars) {
          // `updateCardInput.dueAt` `z.coerce.date()` — şema giriş tipi geniş;
          // `setDue` her zaman `Date | null` geçtiğinden güvenle daraltılır.
          const nextDue = (vars.dueAt ?? null) as Date | null;
          queryClient.setQueryData<CardGet>(cardKey, {
            ...prev,
            card: { ...prev.card, dueAt: nextDue },
          });
        }
        return { prev };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(cardKey, ctx.prev);
        Alert.alert(strings.cardDetail.dueTitle, strings.cardDetail.actionError);
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: cardKey });
        void queryClient.invalidateQueries(trpc.card.activity.list.queryFilter({ cardId }));
      },
    }),
  );

  const setDue = (value: Date | null) => {
    updateCard.mutate({ cardId, dueAt: value, clientMutationId: newClientMutationId() });
  };

  const overdue = dueAt != null && !completed && isOverdue(dueAt);

  return (
    <DetailSection icon="clock" title={strings.cardDetail.dueTitle}>
      <View className="gap-3">
        <Text className={`text-sm ${overdue ? 'text-destructive' : 'text-foreground'}`}>
          {dueAt != null ? formatDueDate(dueAt) : strings.cardDetail.dueEmpty}
        </Text>

        {canEdit ? (
          <View className="gap-2">
            <View className="flex-row flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <Pressable
                  key={preset.kind}
                  accessibilityRole="button"
                  disabled={updateCard.isPending}
                  onPress={() => setDue(presetDate(preset.kind))}
                  className={`rounded-full border border-border bg-card px-3 py-1.5 ${
                    updateCard.isPending ? 'opacity-50' : 'active:opacity-70'
                  }`}
                >
                  <Text className="text-sm text-foreground">{preset.label}</Text>
                </Pressable>
              ))}
            </View>

            {dueAt != null ? (
              <Pressable
                accessibilityRole="button"
                disabled={updateCard.isPending}
                onPress={() => setDue(null)}
                className={`flex-row items-center gap-1.5 self-start ${
                  updateCard.isPending ? 'opacity-50' : 'active:opacity-70'
                }`}
              >
                <Icon name="x" size={13} color={theme.destructive} />
                <Text weight="medium" className="text-sm text-destructive">
                  {strings.cardDetail.dueClear}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </DetailSection>
  );
}
