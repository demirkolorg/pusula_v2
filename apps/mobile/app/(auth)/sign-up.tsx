import { useState } from 'react';
import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { signUpInput } from '@pusula/domain';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { AuthScreen } from '@/components/auth-screen';
import { Button } from '@/components/button';
import { FormMessage } from '@/components/form-message';
import { TextField } from '@/components/text-field';
import { strings } from '@/lib/strings';

/**
 * Kayıt ekranı. Form `@pusula/domain` `signUpInput` ile doğrulanır. Signup
 * bootstrap (default workspace + "İlk Pano") sunucu tarafında ortaktır
 * (`databaseHooks.user.create.after`) — mobil ayrı bootstrap kodu yazmaz,
 * yalnız `authClient.signUp.email` ile tetikler. Başarıda `(auth)` layout
 * oturumu görüp `(app)`'e yönlendirir.
 */
export default function SignUpScreen() {
  const copy = strings.auth.signUp;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async () => {
    const parsed = signUpInput.safeParse({ name, email, password });
    if (!parsed.success) {
      const next: { name?: string; email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'name' || key === 'email' || key === 'password') next[key] ??= issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setFieldErrors({});
    setError(null);
    setPending(true);
    try {
      const result = await authClient.signUp.email(parsed.data);
      if (result.error) {
        setError(authErrorMessage(result.error));
      }
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthScreen title={copy.title} subtitle={copy.description}>
      <View className="gap-4">
        <TextField
          label={strings.auth.nameLabel}
          value={name}
          onChangeText={setName}
          error={fieldErrors.name}
          placeholder={strings.auth.namePlaceholder}
          autoComplete="name"
          textContentType="name"
        />
        <TextField
          label={strings.auth.emailLabel}
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email}
          placeholder={strings.auth.emailPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextField
          label={strings.auth.passwordLabel}
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password}
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

      <View className="mt-8 flex-row justify-center gap-1">
        <Text className="text-sm text-muted-foreground">{copy.hasAccount}</Text>
        <Link href="/sign-in" className="text-sm font-medium text-foreground">
          {copy.goToSignIn}
        </Link>
      </View>
    </AuthScreen>
  );
}
