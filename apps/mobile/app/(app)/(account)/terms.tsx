import { SafeAreaView } from 'react-native-safe-area-context';
import { TermsOfServiceView } from '@/components/account/terms-of-service-view';

/**
 * Kullanım koşulları route'u — içerik `TermsOfServiceView`'de (tablet hesap
 * detail pane'iyle paylaşılır). Telefonda native header yok; view kendi hero
 * başlığını çizdiği için yalnız üst safe-area ile sarılır (pane'de View doğrudan kullanılır).
 */
export default function TermsScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-muted">
      <TermsOfServiceView />
    </SafeAreaView>
  );
}
