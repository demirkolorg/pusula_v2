import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/screen-header';
import { SecurityView } from '@/components/account/security-view';
import { strings } from '@/lib/strings';

/**
 * Güvenlik route'u — şifre değiştir + hesabı sil tek ekranda (`SecurityView`,
 * tablet hesap detail pane'iyle paylaşılır). Telefonda native header yok; view'de
 * sayfa başlığı bulunmadığından route ekran-içi `ScreenHeader` ekler (pane'de
 * View doğrudan kullanılır, başlık istenmez).
 */
export default function SecurityScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-muted">
      <ScreenHeader title={strings.account.securityRow} />
      <SecurityView />
    </SafeAreaView>
  );
}
