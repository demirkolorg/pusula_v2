import { router } from 'expo-router';
import { ChangePasswordView } from '@/components/account/change-password-view';

/**
 * Şifre değiştir route'u (DEM-208) — içerik `ChangePasswordView`'de (tablet hesap
 * detail pane'iyle paylaşılır). Telefonda push edilir; başarı sonrası "Kapat" ile
 * geri döner.
 */
export default function ChangePasswordScreen() {
  return <ChangePasswordView onDone={() => router.back()} />;
}
