import { useState } from 'react';
import { Pressable, ScrollView, View, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { userImageUrlSchema, userNameSchema } from '@pusula/domain';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { Button } from '@/components/button';
import { EntityAvatar } from '@/components/entity-avatar';
import { FormMessage } from '@/components/form-message';
import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { strings } from '@/lib/strings';
import { useAvatarUpload, type AvatarUploadSource } from '@/lib/use-avatar-upload';
import { themeFor } from '@/theme/tokens';

/** Avatar kaynak seçici satırları — sheet'te bu sırada gösterilir. */
const AVATAR_SOURCES: ReadonlyArray<{
  source: AvatarUploadSource;
  icon: IconName;
  labelKey: 'avatarSourceCamera' | 'avatarSourceGallery';
}> = [
  { source: 'camera', icon: 'camera', labelKey: 'avatarSourceCamera' },
  { source: 'gallery', icon: 'image', labelKey: 'avatarSourceGallery' },
];

/**
 * Profil düzenleme ekranı (DEM-208 + DEM-212) — kullanıcının görünen adını ve
 * profil fotoğrafını (avatar) değiştirir. Yeni tRPC `user.*` mantığı yok: ad ve
 * `image` doğrudan Better Auth `authClient.updateUser` ile yazılır (DEM-55/68
 * kararı). Tek istisna avatar *yüklemesi* — `user.initiateAvatarUpload` (DEM-160)
 * presigned PUT URL üretir; görsel doğrudan MinIO'ya gider, dönen public URL
 * `updateUser({ image })` ile kalıcılaştırılır (`use-avatar-upload.ts`).
 *
 * Ad `@pusula/domain` `userNameSchema`, avatar URL'i `userImageUrlSchema` ile
 * doğrulanır (web hesap ekranı sözleşmesiyle aynı kural). E-posta değiştirme
 * kapsam dışı.
 */
export default function ProfileEditScreen() {
  const { data: session, refetch } = authClient.useSession();
  const theme = themeFor(useColorScheme());
  const avatar = useAvatarUpload();

  const currentName = session?.user.name ?? '';
  const displayName = currentName || session?.user.email || strings.app.name;

  const [name, setName] = useState(currentName);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [avatarPending, setAvatarPending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const sessionImage = session?.user.image ?? null;
  const hasAvatar = sessionImage != null && sessionImage.trim() !== '';
  // Avatar işlemi (yükleme/PUT veya `updateUser`) uçuştaysa tüm avatar
  // etkileşimleri kilitli — çift istek olmaz.
  const avatarBusy = avatar.uploading || avatarPending;

  /** `updateUser({ image })` çağrısını ortak hata/refetch sarmalıyla çalıştırır. */
  const applyAvatar = async (image: string | null) => {
    // `image` yüklemeden gelen public MinIO URL'i — `userImageUrlSchema`
    // (http(s)-only) ile doğrula. Sunucu `databaseHooks.user.update.before`
    // yine doğrular; bu istemci kontrolü web hesap ekranı sözleşmesi simetrisi.
    if (image !== null && !userImageUrlSchema.safeParse(image).success) {
      setFormError(strings.profileEdit.avatarUploadError);
      return;
    }
    setAvatarPending(true);
    setFormError(null);
    try {
      const { error } = await authClient.updateUser({ image });
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      // Oturum `user.image`'ı tazele — ekran avatarı anında güncellensin.
      await refetch();
    } catch (caught) {
      setFormError(authErrorMessage(caught));
    } finally {
      setAvatarPending(false);
    }
  };

  /** Kaynaktan görsel seç → MinIO'ya yükle → public URL'i `image` olarak yaz. */
  const handlePickSource = async (source: AvatarUploadSource) => {
    setSheetOpen(false);
    const publicUrl = await avatar.pick(source);
    // `pick` iptal / doğrulama hatası / yükleme hatasında `null` döner —
    // kullanıcı zaten uyarılmıştır, sessiz dur.
    if (publicUrl) await applyAvatar(publicUrl);
  };

  const handleRemoveAvatar = () => {
    void applyAvatar(null);
  };

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

  // Avatar butonu metni — yükleme sürerken yüzdeli, aksi halde ekle/değiştir.
  const avatarButtonLabel = avatar.uploading
    ? `${strings.profileEdit.avatarUploading} %${avatar.uploadProgress ?? 0}`
    : hasAvatar
      ? strings.profileEdit.avatarChange
      : strings.profileEdit.avatarAdd;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4"
      // Klavye açılınca alttaki alanlar (TextField) klavyenin altında kalmasın —
      // iOS otomatik content-inset (kart detayı [cardId].tsx:320 ile aynı desen).
      automaticallyAdjustKeyboardInsets
    >
      <Text className="text-sm text-muted-foreground">{strings.profileEdit.description}</Text>

      {/* Avatar — mevcut görsel + değiştir / kaldır (DEM-212). */}
      <View className="gap-2">
        <Text weight="medium" className="text-sm text-foreground">
          {strings.profileEdit.avatarLabel}
        </Text>
        <View className="flex-row items-center gap-4">
          <EntityAvatar name={displayName} image={sessionImage} size={64} />
          <View className="flex-1 gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={avatarButtonLabel}
              accessibilityState={{ disabled: avatarBusy, busy: avatarBusy }}
              disabled={avatarBusy}
              onPress={() => setSheetOpen(true)}
              className={`h-10 flex-row items-center justify-center gap-2 rounded-lg border border-border px-3 ${
                avatarBusy ? 'opacity-50' : 'active:bg-muted'
              }`}
            >
              <Icon name="camera" size={16} color={theme.foreground} />
              <Text weight="medium" className="text-sm text-foreground">
                {avatarButtonLabel}
              </Text>
            </Pressable>
            {hasAvatar && !avatarBusy ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.profileEdit.avatarRemove}
                onPress={handleRemoveAvatar}
                className="h-10 items-center justify-center rounded-lg px-3 active:bg-muted"
              >
                <Text weight="medium" className="text-sm text-destructive">
                  {strings.profileEdit.avatarRemove}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <TextField
        label={strings.profileEdit.nameLabel}
        value={name}
        onChangeText={setName}
        error={nameError}
        placeholder={strings.profileEdit.namePlaceholder}
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={handleSave}
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
        disabled={pending || avatarBusy}
      />

      {/* Avatar kaynak seçici — kamera / galeri (kart eki sheet deseni). */}
      <Sheet
        visible={sheetOpen}
        title={strings.profileEdit.avatarSheetTitle}
        onClose={() => setSheetOpen(false)}
      >
        <View className="gap-1">
          {AVATAR_SOURCES.map(({ source, icon, labelKey }) => (
            <Pressable
              key={source}
              accessibilityRole="button"
              accessibilityLabel={strings.profileEdit[labelKey]}
              onPress={() => void handlePickSource(source)}
              className="flex-row items-center gap-3 rounded-lg px-2 py-3 active:bg-muted"
            >
              <Icon name={icon} size={20} color={theme.foreground} />
              <Text className="text-base text-foreground">{strings.profileEdit[labelKey]}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </ScrollView>
  );
}
