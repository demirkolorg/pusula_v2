import { useState } from 'react';
import { Text, View } from 'react-native';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/button';
import { FormMessage } from '@/components/form-message';
import { Screen } from '@/components/screen';
import { strings } from '@/lib/strings';

/**
 * Geçici giriş-sonrası ekranı — Faz 7B. Oturumu ve çıkış akışını doğrular.
 * Gerçek pano listesi / navigasyon ağacı Faz 7C'de gelir.
 */
export default function HomeScreen() {
  const { data: session } = authClient.useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = session?.user.name || session?.user.email || '';

  const handleSignOut = async () => {
    setPending(true);
    setError(null);
    try {
      // signOut sonrası `useSession` boşalır → `(app)/_layout` sign-in'e
      // yönlendirir; ayrı router.replace gerekmez.
      await authClient.signOut();
    } catch (caught) {
      setError(authErrorMessage(caught));
      setPending(false);
    }
  };

  return (
    <Screen className="items-center justify-center">
      <View className="w-full max-w-sm items-center gap-4">
        <BrandMark />
        <Text className="text-2xl font-semibold text-foreground">{strings.home.title}</Text>
        {displayName ? (
          <Text className="text-center text-sm text-muted-foreground">
            {strings.home.signedInAs} {displayName}
          </Text>
        ) : null}
        <Text className="text-center text-sm text-muted-foreground">
          {strings.home.description}
        </Text>
        {error ? <FormMessage>{error}</FormMessage> : null}
        <View className="w-full">
          <Button
            label={strings.auth.signOut}
            variant="ghost"
            onPress={handleSignOut}
            pending={pending}
          />
        </View>
      </View>
    </Screen>
  );
}
