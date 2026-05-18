import { useState } from 'react';
import { Alert, Pressable, ScrollView, View, useColorScheme } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { deleteAccountInput } from '@pusula/domain';
import { AppSpinner } from '@/components/app-spinner';
import { FormMessage } from '@/components/form-message';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { clearRegisteredPushToken, getRegisteredPushToken } from '@/lib/push-token-store';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';
import { useTRPC } from '@/trpc/provider';

/**
 * Hesap silme ekranı (DEM-212) — yeni tRPC yok: doğrudan Better Auth
 * `authClient.deleteUser({ password })` (DEM-55 kararı — `user.*` router'ı yok).
 * Kimlik bilgisiyle açılan hesap, silmeden önce parolayı re-auth onayı olarak
 * ister; giriş `@pusula/domain` `deleteAccountInput` ile doğrulanır (web hesap
 * ekranı sözleşmesiyle aynı kural).
 *
 * Silmenin *izinli* olup olmaması ayrı bir domain kuralıdır: kullanıcı hâlâ bir
 * çalışma alanının sahibiyse server'ın `beforeDelete` hook'u (`apps/api/src/auth.ts`
 * — `canDeleteOwnAccount`) reddeder; bu durumda dönen açıklayıcı mesaj
 * `FormMessage` ile gösterilir.
 *
 * Başarılı silmede oturum boşalır → `(app)/_layout` otomatik olarak
 * `(auth)/sign-in`'e yönlendirir (mevcut signOut deseni).
 */
export default function DeleteAccountScreen() {
  const theme = themeFor(useColorScheme());
  const trpc = useTRPC();
  const revokeToken = useMutation(trpc.push.tokens.revoke.mutationOptions());
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /** `deleteUser` çağrısını yapar; hatayı ilgili alana/forma yazar. */
  const runDelete = async () => {
    setFormError(null);
    try {
      // Hesap silinmeden ÖNCE bu cihazın push token'ını iptal et — silme sonrası
      // oturum yok, revoke imkânsız (signOut akışıyla simetrik). Best-effort;
      // silme başarısız olursa token sonraki uygulama açılışında yeniden kaydedilir.
      const token = getRegisteredPushToken();
      if (token) {
        try {
          await revokeToken.mutateAsync({ token });
        } catch {
          // Revoke başarısız olsa da silmeye devam.
        }
        clearRegisteredPushToken();
      }
      const { error } = await authClient.deleteUser({ password });
      if (error) {
        // Son-owner engeli + yanlış parola — ikisi de server'dan açıklayıcı
        // mesajla gelir; form düzeyinde göster.
        setFormError(authErrorMessage(error));
        setPending(false);
        return;
      }
      // Oturum boşaldı — `(app)/_layout` `sign-in`'e yönlendirir. State
      // güncellemesi gereksiz (ekran sökülecek).
    } catch (caught) {
      setFormError(authErrorMessage(caught));
      setPending(false);
    }
  };

  const handleDelete = () => {
    if (pending) return;
    const parsed = deleteAccountInput.safeParse({ password });
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setPasswordError(undefined);
    setFormError(null);
    // `pending`'i Alert açılmadan ÖNCE set et — Alert açıkken buton kilitli
    // kalır, ikinci bir Alert / çift `deleteUser` tetiklenmez. İptalde açılır.
    setPending(true);
    // Son onay — yıkıcı, geri alınamaz işlem için Alert ile çift teyit.
    Alert.alert(strings.deleteAccount.confirmTitle, strings.deleteAccount.confirmBody, [
      { text: strings.common.cancel, style: 'cancel', onPress: () => setPending(false) },
      {
        text: strings.deleteAccount.confirmAction,
        style: 'destructive',
        onPress: () => void runDelete(),
      },
    ]);
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-4">
      {/* Geri-alınamaz uyarısı — yıkıcı tonda kutu. */}
      <View
        accessibilityRole="alert"
        className="gap-1 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3"
      >
        <Text weight="semibold" className="text-sm text-destructive">
          {strings.deleteAccount.warningTitle}
        </Text>
        <Text className="text-sm text-destructive">{strings.deleteAccount.warningBody}</Text>
      </View>

      <TextField
        label={strings.deleteAccount.passwordLabel}
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        placeholder={strings.deleteAccount.passwordPlaceholder}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="done"
        onSubmitEditing={handleDelete}
      />

      {formError ? <FormMessage>{formError}</FormMessage> : null}

      {/* Yıkıcı buton — `Button` yalnız primary/ghost; silme rengi için özel
          `Pressable` (üye çıkar / kart arşivle ekranlarındaki destructive deseni). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.deleteAccount.deleteAction}
        accessibilityState={{ disabled: pending, busy: pending }}
        disabled={pending}
        onPress={handleDelete}
        className={`h-12 flex-row items-center justify-center gap-2 rounded-lg bg-destructive px-4 ${
          pending ? 'opacity-50' : 'active:opacity-80'
        }`}
      >
        {pending ? <AppSpinner size="sm" color={theme.primaryForeground} /> : null}
        <Text weight="semibold" className="text-base text-white">
          {strings.deleteAccount.deleteAction}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
