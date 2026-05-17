import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { Button } from '@/components/button';
import { EntityAvatar } from '@/components/entity-avatar';
import { FormMessage } from '@/components/form-message';
import { strings } from '@/lib/strings';

/**
 * "Hesap" sekmesi — oturumdaki kullanıcı + çıkış. Hesap ayarları (profil,
 * güvenlik) sonraki güncellemelerde gelir. signOut sonrası `useSession`
 * boşalır → `(app)/_layout` `(auth)/sign-in`'e yönlendirir.
 */
export default function AccountScreen() {
  const { data: session } = authClient.useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = session?.user.name || session?.user.email || '';
  const email = session?.user.email ?? '';

  const handleSignOut = async () => {
    setPending(true);
    setError(null);
    try {
      await authClient.signOut();
    } catch (caught) {
      setError(authErrorMessage(caught));
      setPending(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background px-6">
      <View className="flex-1 justify-center gap-6">
        <View className="items-center gap-3">
          <EntityAvatar name={displayName || strings.app.name} size={72} />
          <View className="items-center gap-1">
            {displayName ? (
              <Text className="text-xl font-semibold text-foreground">{displayName}</Text>
            ) : null}
            {email ? <Text className="text-sm text-muted-foreground">{email}</Text> : null}
          </View>
        </View>
        <Text className="text-center text-sm text-muted-foreground">
          {strings.account.description}
        </Text>
        {error ? <FormMessage>{error}</FormMessage> : null}
        <Button
          label={strings.auth.signOut}
          variant="ghost"
          onPress={handleSignOut}
          pending={pending}
        />
      </View>
    </SafeAreaView>
  );
}
