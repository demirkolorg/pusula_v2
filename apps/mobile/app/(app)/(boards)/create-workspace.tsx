import { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_WORKSPACE_ICON, type EntityIcon } from '@pusula/domain';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { EntityIconPicker } from '@/components/entity-icon-picker';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';

/**
 * Workspace oluştur ekranı — DEM-203 WP6 (oluşturma menüsünden açılır).
 *
 * Web'de bulunan ama mobilde yeni olan bir akış. Çalışma alanı adı zorunlu;
 * `slug` UI'da gösterilmez — `createWorkspaceInput`'ta opsiyonel olduğu için
 * gönderilmez, backend `name`'den `slugify` ile üretir. İkon `ENTITY_ICONS`'tan
 * opsiyonel (varsayılan `DEFAULT_WORKSPACE_ICON`).
 *
 * "Oluştur" → `workspace.create` → başarılı → `workspace.list` cache'i
 * invalidate edilir (alttaki mount'lu çalışma alanları listesi bayat
 * kalmasın) ve yeni çalışma alanının board listesine yönlenir
 * (`/workspaces/[id]`); hata → `Alert`.
 */
export default function CreateWorkspaceScreen() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<EntityIcon>(DEFAULT_WORKSPACE_ICON);

  const createMutation = useMutation(
    trpc.workspace.create.mutationOptions({
      onSuccess: (workspace) => {
        // Çalışma alanları listesini tazele (yeni alan hemen görünsün),
        // oluşturma ekranını stack'ten düşür, yeni alanın board listesine geç.
        void queryClient.invalidateQueries(trpc.workspace.list.queryFilter());
        router.replace({
          pathname: '/workspaces/[id]',
          params: { id: workspace.id, name: workspace.name },
        });
      },
      onError: () => {
        Alert.alert(strings.common.errorTitle, strings.createWorkspace.error);
      },
    }),
  );

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  const handleSubmit = () => {
    if (trimmedName.length === 0) return;
    createMutation.mutate({
      name: trimmedName,
      icon,
      clientMutationId: newClientMutationId(),
    });
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScreenHeader title={strings.createWorkspace.title} />
      <ScrollView className="flex-1" contentContainerClassName="gap-5 p-4" keyboardShouldPersistTaps="handled">
        <TextField
          label={strings.createWorkspace.nameLabel}
          value={name}
          onChangeText={setName}
          placeholder={strings.createWorkspace.namePlaceholder}
          autoCapitalize="sentences"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        <EntityIconPicker
          label={strings.createWorkspace.iconLabel}
          value={icon}
          onChange={setIcon}
        />

        <Button
          label={strings.createWorkspace.submit}
          onPress={handleSubmit}
          disabled={!canSubmit}
          pending={createMutation.isPending}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
