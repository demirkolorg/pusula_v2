import { AboutView } from '@/components/account/about-view';

/**
 * Hakkında route'u — içerik `AboutView`'de (tablet hesap detail pane'iyle
 * paylaşılır). Native header (geri + başlık) `(account)/_layout.tsx`'ten gelir.
 */
export default function AboutScreen() {
  return <AboutView />;
}
