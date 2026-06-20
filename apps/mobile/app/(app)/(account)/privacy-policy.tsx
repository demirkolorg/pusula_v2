import { PrivacyPolicyView } from '@/components/account/privacy-policy-view';

/**
 * Gizlilik politikası route'u (2026-06-20) — içerik `PrivacyPolicyView`'de (tablet
 * hesap detail pane'iyle paylaşılır). Native header (geri + başlık)
 * `(account)/_layout.tsx`'ten gelir.
 */
export default function PrivacyPolicyScreen() {
  return <PrivacyPolicyView />;
}
