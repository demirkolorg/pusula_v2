import { SafeAreaView } from 'react-native-safe-area-context';
import { PrivacyPolicyView } from '@/components/account/privacy-policy-view';

/**
 * Gizlilik politikası route'u (2026-06-20) — içerik `PrivacyPolicyView`'de (tablet
 * hesap detail pane'iyle paylaşılır). Telefonda native header yok; view kendi hero
 * başlığını çizdiği için yalnız üst safe-area ile sarılır (pane'de View doğrudan kullanılır).
 */
export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-muted">
      <PrivacyPolicyView />
    </SafeAreaView>
  );
}
