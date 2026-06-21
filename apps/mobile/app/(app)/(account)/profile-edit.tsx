import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/screen-header';
import { ProfileEditView } from '@/components/account/profile-edit-view';
import { strings } from '@/lib/strings';

/**
 * Profil düzenleme route'u (DEM-208) — içerik `ProfileEditView`'de (tablet hesap
 * detail pane'iyle paylaşılır). Telefonda push edilir; kaydet sonrası geri döner.
 * Native header yok; view'de sayfa başlığı bulunmadığından route ekran-içi
 * `ScreenHeader` ekler (pane'de View doğrudan kullanılır, başlık istenmez).
 */
export default function ProfileEditScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-muted">
      <ScreenHeader title={strings.profileEdit.title} />
      <ProfileEditView onDone={() => router.back()} />
    </SafeAreaView>
  );
}
