/**
 * Gizlilik politikası sayfası — `/gizlilik`.
 *
 * Faz 7O (DEM-191): App Store gönderimi zorunlu bir gizlilik politikası URL'i
 * ister. İçerik, runbook §12.14.6'daki App Privacy beyanıyla tutarlıdır
 * (toplanan veri tipleri + amaç + hizmet sağlayıcılar).
 *
 * Statik içerik sayfasıdır — server component, oturum/veri çekme yok.
 * `noindex` DEĞİL: App Store inceleyicisi ve kullanıcılar erişebilmeli.
 *
 * NOT: Veri sorumlusu adı ve iletişim e-postası ürün sahibi tarafından
 * teyit edilmelidir (bkz. iş kayıt defteri DEM-191).
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Gizlilik Politikası — Pusula',
  description:
    'Pusula görev yönetim uygulamasının hangi kişisel verileri, hangi amaçla işlediğini ve kullanıcı haklarını açıklayan gizlilik politikası.',
  robots: { index: true, follow: true },
};

/** Politikanın yürürlük/son güncelleme tarihi. */
const LAST_UPDATED = '19 Mayıs 2026';

/** Veri sorumlusu iletişim adresi. */
const CONTACT_EMAIL = 'pusulaportal@gmail.com';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-foreground text-lg font-semibold">{title}</h2>
      <div className="text-muted-foreground mt-2 space-y-2 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <article>
      <header>
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">
          Gizlilik Politikası
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Son güncelleme: {LAST_UPDATED}</p>
        <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
          Pusula, ekiplerin işlerini panolar, listeler ve kartlarla yönettiği bir görev yönetim
          uygulamasıdır. Bu Gizlilik Politikası, Pusula&apos;yı web ve mobil üzerinde
          kullandığınızda hangi kişisel verilerin işlendiğini, neden işlendiğini ve haklarınızı
          açıklar.
        </p>
      </header>

      <Section title="1. Veri Sorumlusu">
        <p>
          Pusula, Abdullah Demirkol tarafından bağımsız bir geliştirici olarak sunulmaktadır. Veri
          sorumlusu ile iletişim:{' '}
          <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="2. İşlenen Veriler">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-foreground">Hesap bilgileri:</strong> ad, e-posta adresi ve
            şifre (şifreler geri döndürülemez biçimde şifrelenerek saklanır).
          </li>
          <li>
            <strong className="text-foreground">İçerik verileri:</strong> oluşturduğunuz pano,
            liste, kart, açıklama, yorum, kontrol listesi ve etiketler.
          </li>
          <li>
            <strong className="text-foreground">Yüklenen dosyalar:</strong> kartlara eklediğiniz
            görsel ve belgeler.
          </li>
          <li>
            <strong className="text-foreground">Bildirim verileri:</strong> anlık bildirim
            gönderebilmek için cihaz bildirim jetonu.
          </li>
          <li>
            <strong className="text-foreground">Teşhis verileri:</strong> uygulama çökme ve hata
            kayıtları.
          </li>
          <li>
            <strong className="text-foreground">Kullanım verileri:</strong> hizmetin çalışması için
            gereken oturum ve etkinlik kayıtları.
          </li>
        </ul>
      </Section>

      <Section title="3. Verilerin İşlenme Amaçları">
        <ul className="list-disc space-y-1 pl-5">
          <li>Hesabınızı oluşturmak ve kimliğinizi doğrulamak.</li>
          <li>Pano, kart ve içeriklerinizi saklamak ve size göstermek.</li>
          <li>Ekip üyeleriyle gerçek zamanlı iş birliğini sağlamak.</li>
          <li>Atama, yaklaşan son tarih ve yorum bildirimleri göndermek.</li>
          <li>Hataları teşhis etmek ve hizmeti iyileştirmek.</li>
        </ul>
      </Section>

      <Section title="4. Hukuki Sebep">
        <p>
          Kişisel verileriniz, hizmeti sunabilmek için sözleşmenin ifası ve meşru menfaat hukuki
          sebeplerine dayanılarak işlenir.
        </p>
      </Section>

      <Section title="5. Hizmet Sağlayıcılar ve Aktarım">
        <p>Pusula, hizmeti sunmak için sınırlı sayıda hizmet sağlayıcı kullanır:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>E-posta gönderimi (Resend)</li>
          <li>Anlık bildirim teslimi (Expo)</li>
          <li>Hata ve çökme izleme (Sentry)</li>
          <li>Sunucu ve dosya depolama altyapısı (barındırma sağlayıcısı)</li>
        </ul>
        <p>
          Bu sağlayıcılar verilerinize yalnızca hizmeti sunmak için gereken ölçüde erişir. Pusula,
          verilerinizi pazarlama amacıyla üçüncü taraflara satmaz veya kiralamaz.
        </p>
      </Section>

      <Section title="6. Reklam ve İzleme">
        <p>
          Pusula üçüncü taraf reklam ağı kullanmaz ve sizi uygulamalar veya siteler arasında
          izlemez.
        </p>
      </Section>

      <Section title="7. Veri Saklama ve Silme">
        <p>
          Verileriniz hesabınız aktif olduğu sürece saklanır. Hesabınızı uygulama içinden
          silebilirsiniz; hesap silindiğinde kişisel verileriniz ve içerikleriniz makul süre içinde
          kalıcı olarak silinir (yasal saklama yükümlülükleri saklıdır).
        </p>
      </Section>

      <Section title="8. Veri Güvenliği">
        <p>
          Veriler aktarım sırasında HTTPS/TLS ile şifrelenir; şifreler geri döndürülemez biçimde
          saklanır; içeriklere erişim yetkisi sunucu tarafında her istekte denetlenir.
        </p>
      </Section>

      <Section title="9. Haklarınız (KVKK m. 11)">
        <p>
          Kişisel verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya
          silinmesini isteme ve işlenmesine itiraz etme haklarına sahipsiniz. Taleplerinizi{' '}
          <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{' '}
          adresine iletebilirsiniz.
        </p>
      </Section>

      <Section title="10. Çocukların Gizliliği">
        <p>Pusula 13 yaşın altındaki kullanıcılara yönelik değildir.</p>
      </Section>

      <Section title="11. Değişiklikler">
        <p>
          Bu politika zaman zaman güncellenebilir; önemli değişiklikler uygulama üzerinden
          duyurulur. Güncel sürüm her zaman bu sayfada yer alır.
        </p>
      </Section>

      <Section title="12. İletişim">
        <p>
          Sorularınız için:{' '}
          <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </article>
  );
}
