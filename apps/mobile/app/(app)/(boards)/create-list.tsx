import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { Text } from '@/components/text';
import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { LocationPicker, useLocationPicker } from '@/components/location-picker';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';

/**
 * Liste oluştur akışı — DEM-203 WP5 (oluşturma menüsünden açılır).
 *
 * Konum seçici (`LocationPicker` `depth='board'` → workspace→pano) + liste
 * başlığı. "Oluştur" pano seçili ve başlık dolu olunca aktifleşir.
 *
 * Akış "oluştur → yönlen": `list.create` düz mutation'la çağrılır; başarılıysa
 * hedef panonun `board.get` cache'i invalidate edilir (alttaki mount'lu pano
 * ekranı bayat kalmasın, yeni liste hemen görünsün) ve kullanıcı o panoya
 * yönlendirilir. Hata → `Alert`.
 */
export default function CreateListScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const picker = useLocationPicker('board');
  const [title, setTitle] = useState('');

  const createList = useMutation(trpc.list.create.mutationOptions());

  const trimmedTitle = title.trim();
  const boardId = picker.selection?.boardId;
  const boardTitle = picker.selection?.boardTitle;
  const canSubmit = Boolean(boardId) && trimmedTitle.length > 0;
  const pending = createList.isPending;

  const handleCreate = () => {
    if (!canSubmit || !boardId || pending) return;
    createList.mutate(
      { boardId, title: trimmedTitle, clientMutationId: newClientMutationId() },
      {
        // Liste oluşturuldu → hedef panonun cache'ini tazele, panoya yönlen
        // (form geri-yığından düşürülür).
        onSuccess: () => {
          void queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
          router.replace({
            pathname: '/boards/[boardId]',
            params: { boardId, title: boardTitle ?? strings.board.fallbackTitle },
          });
        },
        onError: () => Alert.alert(strings.createList.title, strings.createList.error),
      },
    );
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScreenHeader title={strings.createList.title} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-4"
        keyboardShouldPersistTaps="handled"
      >
        {/* Konum — workspace → pano. */}
        <View className="gap-2">
          <Text weight="medium" className="text-sm text-foreground">
            {strings.createList.locationLabel}
          </Text>
          <LocationPicker {...picker} />
        </View>

        {/* Liste başlığı (zorunlu). */}
        <TextField
          label={strings.createList.titleLabel}
          value={title}
          onChangeText={setTitle}
          placeholder={strings.createList.titlePlaceholder}
          editable={!pending}
          returnKeyType="done"
        />

        <Button
          label={strings.createList.submit}
          onPress={handleCreate}
          pending={pending}
          disabled={!canSubmit}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
