import { router } from 'expo-router';
import { ProfileEditView } from '@/components/account/profile-edit-view';

/**
 * Profil düzenleme route'u (DEM-208) — içerik `ProfileEditView`'de (tablet hesap
 * detail pane'iyle paylaşılır). Telefonda push edilir; kaydet sonrası geri döner.
 */
export default function ProfileEditScreen() {
  return <ProfileEditView onDone={() => router.back()} />;
}
