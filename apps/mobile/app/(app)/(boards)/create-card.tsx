import { useState } from 'react';
import { Alert, Pressable, ScrollView, View, useColorScheme } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { LocationPicker, useLocationPicker } from '@/components/location-picker';
import { DueDatePresetPicker } from '@/components/due-date-preset-picker';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

/**
 * Kart oluştur akışı — DEM-203 WP5 (oluşturma menüsünden açılır).
 *
 * Konum seçici (`LocationPicker` `depth='list'` → workspace→pano→liste) + kart
 * başlığı + katlanmış opsiyonel "son tarih" bölümü. "Oluştur" liste seçili ve
 * başlık dolu olunca aktifleşir.
 *
 * Akış "oluştur → yönlen": `card.create` düz mutation'la çağrılır; başarılıysa
 * dönen kartın `boardId`'si üzerinden hedef panonun `board.get` cache'i
 * invalidate edilir (alttaki mount'lu pano ekranı bayat kalmasın, yeni kart
 * orada görünsün). Son tarih seçildiyse dönen kart id'siyle
 * `card.update({ dueAt })` ardışık çağrılır; başarılıysa kullanıcı oluşan
 * kartın detayına yönlendirilir.
 *
 * Hata ayrımı: `card.create` başarısızsa kart hiç oluşmadı → `createCard.error`
 * gösterilir. `card.create` başarılı ama ardışık `card.update({ dueAt })`
 * başarısızsa kart oluştu — yanıltıcı "oluşturulamadı" yerine `createCard.dueError`
 * gösterilir ve kullanıcı yine de oluşan kartın detayına yönlendirilir.
 *
 * Etiket/üye bu akışta yoktur: kullanıcı kart detayına yönlendiği için onları
 * orada düzenler (`detailNote` kısa bilgi notu).
 */
export default function CreateCardScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = themeFor(useColorScheme());

  const picker = useLocationPicker('list');
  const [title, setTitle] = useState('');
  // Katlanan opsiyonel "son tarih" bölümü — varsayılan kapalı (sade tutulur).
  const [dueExpanded, setDueExpanded] = useState(false);
  const [dueAt, setDueAt] = useState<Date | null>(null);

  const createCard = useMutation(trpc.card.create.mutationOptions());
  const updateCard = useMutation(trpc.card.update.mutationOptions());

  const trimmedTitle = title.trim();
  const listId = picker.selection?.listId;
  const canSubmit = Boolean(listId) && trimmedTitle.length > 0;
  const pending = createCard.isPending || updateCard.isPending;

  const handleCreate = () => {
    if (!canSubmit || !listId || pending) return;
    createCard.mutate(
      { listId, title: trimmedTitle, clientMutationId: newClientMutationId() },
      {
        onSuccess: (card) => {
          // Kart oluşan panonun cache'ini tazele — alttaki mount'lu pano
          // ekranında yeni kart hemen görünsün.
          void queryClient.invalidateQueries(
            trpc.board.get.queryFilter({ boardId: card.boardId }),
          );
          // Son tarih seçildiyse oluşan kart üzerinde ardışık güncelleme.
          if (dueAt != null) {
            updateCard.mutate(
              { cardId: card.id, dueAt, clientMutationId: newClientMutationId() },
              {
                onSuccess: () => goToCard(card.id, card.title),
                // Kart oluştu ama son tarih yazılamadı — kullanıcıyı yine de
                // karta götür; "oluşturulamadı" değil, dueError mesajı göster.
                onError: () => {
                  Alert.alert(strings.createCard.title, strings.createCard.dueError);
                  goToCard(card.id, card.title);
                },
              },
            );
          } else {
            goToCard(card.id, card.title);
          }
        },
        onError: () => Alert.alert(strings.createCard.title, strings.createCard.error),
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: strings.createCard.title }} />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-5 p-4"
        keyboardShouldPersistTaps="handled"
      >
        {/* Konum — workspace → pano → liste. */}
        <View className="gap-2">
          <Text weight="medium" className="text-sm text-foreground">
            {strings.createCard.locationLabel}
          </Text>
          <LocationPicker {...picker} />
        </View>

        {/* Kart başlığı (zorunlu). */}
        <TextField
          label={strings.createCard.titleLabel}
          value={title}
          onChangeText={setTitle}
          placeholder={strings.createCard.titlePlaceholder}
          editable={!pending}
          returnKeyType="done"
        />

        {/* Katlanan opsiyonel "son tarih" bölümü. */}
        <View className="gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: dueExpanded }}
            disabled={pending}
            onPress={() => setDueExpanded((prev) => !prev)}
            className={`flex-row items-center gap-2 ${pending ? 'opacity-50' : 'active:opacity-70'}`}
          >
            <Icon name="calendar" size={18} color={theme.mutedForeground} />
            <Text weight="medium" className="flex-1 text-sm text-foreground">
              {strings.createCard.dueSectionLabel}
            </Text>
            <Icon
              name={dueExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.mutedForeground}
            />
          </Pressable>
          {dueExpanded ? (
            <DueDatePresetPicker value={dueAt} onChange={setDueAt} disabled={pending} />
          ) : null}
        </View>

        {/* Etiket/üye notu — bu akışta düzenlenmez, kart detayına yönlendirilir. */}
        <Text className="text-xs text-muted-foreground">{strings.createCard.detailNote}</Text>

        <Button
          label={strings.createCard.submit}
          onPress={handleCreate}
          pending={pending}
          disabled={!canSubmit}
        />
      </ScrollView>
    </>
  );
}

/** Oluşan kartın detayına yönlendirir — `(boards)` stack içinde `cards/[cardId]`. */
function goToCard(cardId: string, title: string) {
  router.replace({ pathname: '/cards/[cardId]', params: { cardId, title } });
}
