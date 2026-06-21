import { useState } from 'react';
import { Link } from 'expo-router';
import { View } from 'react-native';
import { signInInput } from '@pusula/domain';
import { Text } from '@/components/text';
import { fontFamilyForWeight } from '@/theme/fonts';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { AuthScreen } from '@/components/auth-screen';
import { BoardMockup } from '@/components/board-mockup';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/button';
import { FloatingActivity } from '@/components/floating-activity';
import { FormMessage } from '@/components/form-message';
import { RotatingHeadline } from '@/components/rotating-headline';
import { SocialProof } from '@/components/social-proof';
import { TextField } from '@/components/text-field';
import { strings } from '@/lib/strings';

/**
 * Giriş ekranı. Form `@pusula/domain` `signInInput` ile client-side doğrulanır
 * (web ile aynı sözleşme). Başarıda `(auth)` layout oturumu görüp `(app)`'e
 * yönlendirir — burada manuel navigasyon yok.
 */
export default function SignInScreen() {
  const copy = strings.auth.signIn;
  const landing = strings.auth.landing;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async () => {
    const parsed = signInInput.safeParse({ email, password });
    if (!parsed.success) {
      const next: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'email' || key === 'password') next[key] ??= issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setFieldErrors({});
    setError(null);
    setPending(true);
    try {
      const result = await authClient.signIn.email(parsed.data);
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
    <AuthScreen
      title={copy.title}
      subtitle={copy.description}
      hero={
        <View className="items-center gap-4">
          <BrandMark size={52} />
          <View className="items-center gap-2">
            <Text weight="medium" className="text-sm text-primary">
              {landing.heroEyebrow}
            </Text>
            <RotatingHeadline />
          </View>
        </View>
      }
      belowCard={
        <View className="items-center gap-9">
          <SocialProof />
          {/* Board mockup + onu çerçeveleyen yüzen aktivite rozetleri. Yüzen
              rozetler `absolute` olarak board'un dışına taşar; bu yüzden saran
              View `relative` ve dikey nefes payı taşır. */}
          <View className="relative" style={{ paddingVertical: 18 }}>
            <BoardMockup />
            <FloatingActivity />
          </View>
        </View>
      }
    >
      <View className="gap-4">
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
          autoComplete="current-password"
          textContentType="password"
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
        <Link
          href="/forgot-password"
          style={{ fontFamily: fontFamilyForWeight.regular }}
          className="text-center text-sm text-muted-foreground"
        >
          {copy.forgotPassword}
        </Link>
      </View>

      <View className="mt-8 flex-row justify-center gap-1">
        <Text className="text-sm text-muted-foreground">{copy.noAccount}</Text>
        <Link
          href="/sign-up"
          style={{ fontFamily: fontFamilyForWeight.medium }}
          className="text-sm text-foreground"
        >
          {copy.goToSignUp}
        </Link>
      </View>
    </AuthScreen>
  );
}
