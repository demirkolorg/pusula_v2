import { DeleteAccountView } from '@/components/account/delete-account-view';

/**
 * Hesap silme route'u (DEM-212) — içerik `DeleteAccountView`'de (tablet hesap
 * detail pane'iyle paylaşılır). Başarılı silmede oturum boşalır → `(app)/_layout`
 * `sign-in`'e yönlendirir (geri dönülecek yer yok, `onDone` verilmez).
 */
export default function DeleteAccountScreen() {
  return <DeleteAccountView />;
}
