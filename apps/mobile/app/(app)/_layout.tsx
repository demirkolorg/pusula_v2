import { Redirect, Stack } from 'expo-router';
import { authClient } from '@/lib/auth-client';
import { LoadingScreen } from '@/components/loading-screen';

/**
 * Korumalı kabuk. Oturum çözülürken spinner; oturum yoksa `(auth)/sign-in`'e
 * yönlendirir. Web `apps/web/src/app/(app)/layout.tsx` simetrisi.
 *
 * Navigasyon ağacı (workspace/board listesi, sekmeler) Faz 7C'nin işi —
 * 7B yalnız korumalı kabuk iskeletini kurar.
 */
export default function AppLayout() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
