import { Redirect, Stack } from 'expo-router';
import { authClient } from '@/lib/auth-client';
import { LoadingScreen } from '@/components/loading-screen';

/**
 * Public auth kabuğu (sign-in / sign-up / forgot-password / reset-password).
 * Oturum varsa korumalı köke (`(app)/index`) yönlendirir — tek redirect
 * noktası. Web `apps/web/src/app/(auth)/layout.tsx` simetrisi.
 */
export default function AuthLayout() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <LoadingScreen />;
  if (session) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
