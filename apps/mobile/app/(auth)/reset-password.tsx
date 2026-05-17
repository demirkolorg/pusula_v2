import { useState } from 'react';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { resetPasswordInput } from '@pusula/domain';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { AuthScreen } from '@/components/auth-screen';
import { Button } from '@/components/button';
import { FormMessage } from '@/components/form-message';
import { TextField } from '@/components/text-field';
import { strings } from '@/lib/strings';

/**
 * Yeni parola belirleme ekranı. Tek kullanımlık `?token=` derin bağlantı
 * parametresinden okunur (sıfırlama e-postasındaki `pusula://reset-password`
 * linki). Token yoksa "geçersiz bağlantı" durumu. Başarıda `(auth)/sign-in`'e
 * yönlendirir — `resetPassword` otomatik oturum açmaz.
 */
export default function ResetPasswordScreen() {
  const copy = strings.auth.resetPassword;
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = (Array.isArray(params.token) ? params.token[0] : params.token)?.trim() ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    newPassword?: string;
    confirmPassword?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <AuthScreen title={copy.missingTokenTitle} subtitle={copy.missingTokenBody}>
        <View className="items-center gap-2">
          <Link href="/forgot-password" className="text-sm font-medium text-foreground">
            {copy.requestNewLink}
          </Link>
          <Link href="/sign-in" className="text-sm text-muted-foreground">
            {copy.backToSignIn}
          </Link>
        </View>
      </AuthScreen>
    );
  }

  const handleSubmit = async () => {
    const next: { newPassword?: string; confirmPassword?: string } = {};
    const parsed = resetPasswordInput.safeParse({ token, newPassword });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'newPassword') next.newPassword ??= issue.message;
      }
    }
    if (newPassword !== confirmPassword) next.confirmPassword ??= copy.passwordMismatch;
    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      return;
    }

    setFieldErrors({});
    setError(null);
    setPending(true);
    try {
      const result = await authClient.resetPassword({ newPassword, token });
      if (result.error) {
        setError(authErrorMessage(result.error));
        setPending(false);
        return;
      }
      router.replace('/sign-in');
    } catch (caught) {
      setError(authErrorMessage(caught));
      setPending(false);
    }
  };

  return (
    <AuthScreen title={copy.title} subtitle={copy.description}>
      <View className="gap-4">
        <TextField
          label={copy.newPasswordLabel}
          value={newPassword}
          onChangeText={setNewPassword}
          error={fieldErrors.newPassword}
          placeholder={strings.auth.passwordPlaceholder}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          secureTextEntry
        />
        <TextField
          label={copy.confirmPasswordLabel}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          error={fieldErrors.confirmPassword}
          placeholder={strings.auth.passwordPlaceholder}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          secureTextEntry
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
        />
        {error ? <FormMessage>{error}</FormMessage> : null}
        <Button
          label={pending ? copy.submitting : copy.submit}
          onPress={handleSubmit}
          pending={pending}
        />
      </View>

      <View className="mt-8 items-center">
        <Link
          href={error ? '/forgot-password' : '/sign-in'}
          className="text-sm text-muted-foreground"
        >
          {error ? copy.requestNewLink : copy.backToSignIn}
        </Link>
      </View>
    </AuthScreen>
  );
}
