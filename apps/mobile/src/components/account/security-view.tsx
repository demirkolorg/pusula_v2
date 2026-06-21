import { ScrollView, View } from 'react-native';
import { AccountPageHeader } from '@/components/account/account-page-header';
import { ChangePasswordView } from '@/components/account/change-password-view';
import { DeleteAccountView } from '@/components/account/delete-account-view';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';
import { useFloatingNavInset } from '@/lib/use-floating-nav-inset';

/**
 * "Güvenlik" görünümü — şifre değiştir + hesabı sil tek ekranda toplanır
 * (eski ayrı `change-password` / `delete-account` ekranlarının yerine). İki
 * bölüm, başlık + kart düzeniyle gösterilir; alt bölümler `ChangePasswordView`
 * ve `DeleteAccountView`'in `embedded` modunu kullanır (kendi ScrollView'lerini
 * kurmaz). Telefonda `(account)/security` route'unda push edilir; tablet hesap
 * detail pane'inde gömülü gösterilir.
 *
 * Şifre değişiminde "Kapat", gömülü modda (onDone verilmediği için) formu
 * sıfırlar — ekran/pane açık kalır. Hesap silme başarılı olduğunda oturum
 * boşalır → `(app)/_layout` `(auth)/sign-in`'e yönlendirir.
 */
export function SecurityView() {
  const navInset = useFloatingNavInset();

  return (
    <ScrollView
      className="flex-1 bg-muted"
      contentContainerClassName="gap-6 p-4"
      contentContainerStyle={{ paddingBottom: navInset || 40 }}
    >
      <AccountPageHeader
        icon="shield"
        title={strings.account.securityTitle}
        subtitle={strings.account.securitySubtitle}
      />

      {/* Şifre değiştir. */}
      <View className="gap-2">
        <Text weight="semibold" className="px-1 text-xs uppercase text-muted-foreground">
          {strings.account.changePasswordRow}
        </Text>
        <View className="rounded-xl border border-border bg-card p-4">
          <ChangePasswordView embedded />
        </View>
      </View>

      {/* Hesabı sil. */}
      <View className="gap-2">
        <Text weight="semibold" className="px-1 text-xs uppercase text-muted-foreground">
          {strings.account.deleteAccountRow}
        </Text>
        <View className="rounded-xl border border-border bg-card p-4">
          <DeleteAccountView embedded />
        </View>
      </View>
    </ScrollView>
  );
}
