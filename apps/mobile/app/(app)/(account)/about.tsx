import { SafeAreaView } from 'react-native-safe-area-context';
import { AboutView } from '@/components/account/about-view';

/**
 * Hakkında route'u — içerik `AboutView`'de (tablet hesap detail pane'iyle
 * paylaşılır). Telefonda native header yok; `AboutView` kendi hero başlığını
 * çizdiği için yalnız üst safe-area ile sarılır (pane'de View doğrudan kullanılır).
 */
export default function AboutScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-muted">
      <AboutView />
    </SafeAreaView>
  );
}
