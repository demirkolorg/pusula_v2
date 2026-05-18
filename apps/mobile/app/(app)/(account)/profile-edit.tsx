import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { userNameSchema } from '@pusula/domain';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { Button } from '@/components/button';
import { FormMessage } from '@/components/form-message';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { strings } from '@/lib/strings';

/**
 * Profil düzenleme ekranı (DEM-208) — kullanıcının görünen adını değiştirir.
 * Yeni tRPC yok: ad doğrudan Better Auth `authClient.updateUser` ile yazılır
 * (DEM-55 kararı — `user.*` router'ı yok). E-posta değiştirme + avatar yükleme
 * kapsam dışı. Ad `@pusula/domain` `userNameSchema` ile doğrulanır (web hesap
 * ekranı sözleşmesiyle aynı kural).
 */
export default function ProfileEditScreen() {
  const { data: session } = authClient.useSession();
  const currentName = session?.user.name ?? '';
  const [name, setName] = useState(currentName);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSave = async () => {
    const parsed = userNameSchema.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setNameError(undefined);
    setFormError(null);
    // Değişiklik yoksa boşuna mutation atma — doğrudan geri dön.
    if (parsed.data === currentName) {
      router.back();
      return;
    }
    setPending(true);
    try {
      const { error } = await authClient.updateUser({ name: parsed.data });
      if (error) {
        setFormError(authErrorMessage(error));
        setPending(false);
        return;
      }
      router.back();
    } catch (caught) {
      setFormError(authErrorMessage(caught));
      setPending(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-4">
      <Text className="text-sm text-muted-foreground">{strings.profileEdit.description}</Text>

      <TextField
        label={strings.profileEdit.nameLabel}
        value={name}
        onChangeText={setName}
        error={nameError}
        placeholder={strings.profileEdit.namePlaceholder}
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={handleSave}
        autoFocus
      />

      {/* E-posta salt-okunur — değiştirme kapsam dışı (Better Auth doğrulama akışı). */}
      <View className="gap-1.5">
        <Text weight="medium" className="text-sm text-foreground">
          {strings.auth.emailLabel}
        </Text>
        <Text className="text-sm text-muted-foreground">{session?.user.email ?? ''}</Text>
        <Text className="text-xs text-muted-foreground">{strings.profileEdit.emailHint}</Text>
      </View>

      {formError ? <FormMessage>{formError}</FormMessage> : null}

      <Button
        label={strings.profileEdit.save}
        onPress={handleSave}
        pending={pending}
        disabled={pending}
      />
    </ScrollView>
  );
}
