import { useState } from 'react';
import { Link } from 'expo-router';
import * as Linking from 'expo-linking';
import { View } from 'react-native';
import { forgotPasswordInput } from '@pusula/domain';
import { fontFamilyForWeight } from '@/theme/fonts';
import { authClient } from '@/lib/auth-client';
import { AuthScreen } from '@/components/auth-screen';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { strings } from '@/lib/strings';

/**
 * Şifre sıfırlama isteği ekranı. `requestPasswordReset`'i `redirectTo` =
 * `expo-linking` derin bağlantısıyla çağırır → sıfırlama e-postasındaki link
 * mobil `reset-password` ekranını `?token=` ile açar.
 *
 * Başarı durumu e-posta var/yok ayırt etmez — kullanıcı listesi sızdırılmaz
 * (web simetrisi). Bu yüzden inline sunucu hatası gösterilmez; her yanıt aynı
 * "bağlantı yolda" ekranına düşer.
 */
export default function ForgotPasswordScreen() {
  const copy = strings.auth.forgotPassword;
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    const parsed = forgotPasswordInput.safeParse({ email });
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path[0] === 'email');
      setEmailError(issue?.message ?? strings.common.unknownError);
      return;
    }

    setEmailError(undefined);
    setPending(true);
    try {
      await authClient.requestPasswordReset({
        email: parsed.data.email,
        // Mobil derin bağlantı: e-postadaki link uygulamanın reset-password
        // ekranını açar (`pusula://reset-password?token=…`). Universal-link
        // hardening Faz 7M işidir.
        redirectTo: Linking.createURL('reset-password'),
      });
    } catch {
      // Yutulur — başarı/başarısızlık ayırt edilmez (e-posta sızıntısı yok).
    } finally {
      setPending(false);
      setSent(true);
    }
  };

  if (sent) {
    return (
      <AuthScreen title={copy.successTitle} subtitle={copy.successBody}>
        <View className="items-center">
          <Link
            href="/sign-in"
            style={{ fontFamily: fontFamilyForWeight.medium }}
            className="text-sm text-foreground"
          >
            {copy.backToSignIn}
          </Link>
        </View>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title={copy.title} subtitle={copy.description}>
      <View className="gap-4">
        <TextField
          label={strings.auth.emailLabel}
          value={email}
          onChangeText={setEmail}
          error={emailError}
          placeholder={strings.auth.emailPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
        />
        <Button
          label={pending ? copy.submitting : copy.submit}
          onPress={handleSubmit}
          pending={pending}
        />
      </View>

      <View className="mt-8 items-center">
        <Link
          href="/sign-in"
          style={{ fontFamily: fontFamilyForWeight.regular }}
          className="text-sm text-muted-foreground"
        >
          {copy.backToSignIn}
        </Link>
      </View>
    </AuthScreen>
  );
}
