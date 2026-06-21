import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_BOARD_ICON, type EntityIcon } from '@pusula/domain';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { EntityIconPicker } from '@/components/entity-icon-picker';
import { LocationPicker, useLocationPicker } from '@/components/location-picker';
import { ScreenHeader } from '@/components/screen-header';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';

/**
 * Pano oluştur ekranı — DEM-203 WP6 (oluşturma menüsünden açılır).
 *
 * Web'de bulunan ama mobilde yeni olan bir akış. Hedef çalışma alanı
 * `LocationPicker` (`depth='workspace'`) ile seçilir; pano başlığı zorunlu,
 * ikon `ENTITY_ICONS`'tan opsiyonel (varsayılan `DEFAULT_BOARD_ICON`).
 *
 * "Oluştur" → `board.create` → başarılı → çalışma alanının `board.list`
 * cache'i invalidate edilir (alttaki mount'lu board listesi bayat kalmasın)
 * ve oluşan panoya yönlenir (`/boards/[boardId]`); hata → `Alert`.
 */
export default function CreateBoardScreen() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const picker = useLocationPicker('workspace');
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState<EntityIcon>(DEFAULT_BOARD_ICON);

  const createMutation = useMutation(
    trpc.board.create.mutationOptions({
      onSuccess: (board) => {
        // Çalışma alanının board listesini tazele (yeni pano hemen görünsün),
        // oluşturma ekranını stack'ten düşür, panoya geç (geri tuşu listeye döner).
        void queryClient.invalidateQueries(
          trpc.board.list.queryFilter({ workspaceId: board.workspaceId }),
        );
        router.replace({
          pathname: '/boards/[boardId]',
          params: { boardId: board.id, title: board.title },
        });
      },
      onError: () => {
        Alert.alert(strings.common.errorTitle, strings.createBoard.error);
      },
    }),
  );

  const workspaceId = picker.selection?.workspaceId;
  const trimmedTitle = title.trim();
  const canSubmit = Boolean(workspaceId) && trimmedTitle.length > 0;

  const handleSubmit = () => {
    if (!workspaceId || trimmedTitle.length === 0) return;
    createMutation.mutate({
      workspaceId,
      title: trimmedTitle,
      icon,
      clientMutationId: newClientMutationId(),
    });
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScreenHeader title={strings.createBoard.title} />
      <ScrollView className="flex-1" contentContainerClassName="gap-5 p-4" keyboardShouldPersistTaps="handled">
        <View className="gap-1.5">
          <Text weight="medium" className="text-sm text-foreground">
            {strings.createBoard.workspaceLabel}
          </Text>
          <LocationPicker {...picker} />
        </View>

        <TextField
          label={strings.createBoard.titleLabel}
          value={title}
          onChangeText={setTitle}
          placeholder={strings.createBoard.titlePlaceholder}
          autoCapitalize="sentences"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        <EntityIconPicker label={strings.createBoard.iconLabel} value={icon} onChange={setIcon} />

        <Button
          label={strings.createBoard.submit}
          onPress={handleSubmit}
          disabled={!canSubmit}
          pending={createMutation.isPending}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
