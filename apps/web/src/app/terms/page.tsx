/**
 * Kullanım koşulları sayfası — `/terms`.
 *
 * Statik içerik sayfasıdır — server component, oturum/veri çekme yok.
 * `noindex` DEĞİL: App Store inceleyicisi ve kullanıcılar erişebilmeli.
 * İçerik Pusula'nın bağımsız geliştirici tarafından sunulan bir görev
 * yönetim hizmeti olduğu gerçeğine göre yazılmıştır; gizlilik ayrıntıları
 * `/gizlilik`'tedir.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Kullanım Koşulları — Pusula',
  description:
    'Pusula görev yönetim uygulamasının kullanım koşulları: hesap, içerik mülkiyeti, kabul edilebilir kullanım, sorumluluk sınırlamaları ve hizmet değişiklikleri.',
  robots: { index: true, follow: true },
};

/** Koşulların yürürlük/son güncelleme tarihi. */
const LAST_UPDATED = '1 Haziran 2026';

/** İletişim adresi. */
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

export default function TermsOfUsePage() {
  return (
    <article>
      <header>
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">
          Kullanım Koşulları
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Son güncelleme: {LAST_UPDATED}</p>
        <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
          Aşağıdaki koşullar, Pusula görev yönetim uygulamasını (&quot;Hizmet&quot;) web ve mobil
          üzerinden kullanımınızı düzenler. Hizmeti kullanarak bu koşulları kabul etmiş
          sayılırsınız. Koşulları kabul etmiyorsanız Hizmet&apos;i kullanmayınız.
        </p>
      </header>

      <Section title="1. Hizmet Sağlayıcı">
        <p>
          Pusula, Abdullah Demirkol tarafından bağımsız bir geliştirici olarak sunulmaktadır.
          İletişim:{' '}
          <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="2. Hesap ve Güvenlik">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Hizmet&apos;i kullanmak için doğru ve güncel bilgilerle bir hesap oluşturmalısınız.
          </li>
          <li>
            Hesap kimlik bilgilerinizin gizliliğinden ve hesabınız üzerinden yapılan tüm işlemlerden
            siz sorumlusunuz.
          </li>
          <li>
            Yetkisiz bir erişim fark ettiğinizde derhal{' '}
            <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>{' '}
            adresine bildirmelisiniz.
          </li>
          <li>13 yaşın altındaki kullanıcılar Hizmet&apos;i kullanamaz.</li>
        </ul>
      </Section>

      <Section title="3. İçerik Mülkiyeti">
        <p>
          Hizmet üzerinde oluşturduğunuz panolar, listeler, kartlar, açıklamalar, yorumlar,
          kontrol listeleri ve yüklediğiniz dosyalar (&quot;Kullanıcı İçeriği&quot;) size aittir.
          Pusula, Hizmet&apos;i işletmek, size sunmak, ekip üyelerinizle paylaşmak ve teknik olarak
          işlemek (yedekleme, görüntüleme, dağıtım) amacıyla Kullanıcı İçeriği üzerinde gerekli
          sınırlı bir kullanım hakkına sahiptir.
        </p>
        <p>
          Yüklediğiniz içeriğin gerekli haklarına sahip olduğunuzu ve üçüncü kişilerin haklarını
          ihlal etmediğinizi taahhüt edersiniz.
        </p>
      </Section>

      <Section title="4. Kabul Edilebilir Kullanım">
        <p>Hizmet&apos;i kullanırken aşağıdakileri yapmamayı kabul edersiniz:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Yürürlükteki mevzuata veya üçüncü kişi haklarına aykırı içerik yüklemek.</li>
          <li>
            Yasadışı, taciz edici, nefret söylemi içeren, müstehcen, şiddet içeren veya yanıltıcı
            içerik paylaşmak.
          </li>
          <li>
            Hizmet&apos;in altyapısına aşırı yük bindirmek, otomatik araçlarla kötüye kullanmak
            veya güvenlik mekanizmalarını aşmaya çalışmak.
          </li>
          <li>Başka kullanıcıların hesaplarına yetkisiz erişim sağlamaya çalışmak.</li>
          <li>Zararlı yazılım, virüs veya benzeri kodları yüklemek veya iletmek.</li>
          <li>Hizmet&apos;i izinsiz olarak yeniden satmak veya üçüncü kişilere kiralamak.</li>
        </ul>
        <p>
          Bu kurallara aykırı kullanım, hesabınızın askıya alınması veya sonlandırılmasına yol
          açabilir.
        </p>
      </Section>

      <Section title="5. Ücretlendirme">
        <p>
          Pusula şu anda ücretsiz olarak sunulmaktadır. İleride ücretli planlar veya özellikler
          eklenirse, ücretlendirme ayrı bir sözleşme veya satın alma akışı ile açıkça
          gösterilecektir. Ücretsiz kalan özellikler bu koşullara tabi olmaya devam eder.
        </p>
      </Section>

      <Section title="6. Hizmet Değişiklikleri ve Kullanılabilirlik">
        <p>
          Hizmet&apos;i geliştirmek, değiştirmek veya bazı özellikleri sonlandırmak hakkımız
          saklıdır. Önemli değişiklikler uygulama içinden veya e-posta ile makul süre önce
          duyurulur.
        </p>
        <p>
          Hizmet&apos;in kesintisiz veya hatasız çalışacağı garanti edilmez; planlı bakım, üçüncü
          taraf sağlayıcı kesintileri veya öngörülemeyen teknik sorunlar nedeniyle erişimin geçici
          olarak kısıtlanabileceğini kabul edersiniz.
        </p>
      </Section>

      <Section title="7. Hesap Sonlandırma">
        <p>
          Hesabınızı dilediğiniz zaman uygulama içinden silebilirsiniz. Hesap silindiğinde
          verileriniz Gizlilik Politikası&apos;nda açıklanan şekilde silinir. Bu koşullara
          aykırılık veya kötüye kullanım hâlinde Pusula, hesabınızı önceden bildirimde bulunarak
          veya açıkça aykırı durumlarda derhal askıya alma ya da sonlandırma hakkını saklı tutar.
        </p>
      </Section>

      <Section title="8. Sorumluluk Sınırlaması">
        <p>
          Hizmet &quot;olduğu gibi&quot; ve &quot;kullanılabilir olduğu sürece&quot; sunulur. Yasal
          olarak izin verilen azami ölçüde, Pusula; veri kaybı, kâr kaybı, iş kesintisi veya
          dolaylı zararlar dâhil olmak üzere Hizmet&apos;in kullanımı veya kullanılamamasından
          doğan zararlardan sorumlu tutulamaz.
        </p>
        <p>
          Bu sınırlama, sorumluluğun yasal olarak sınırlanamayacağı durumlarda uygulanmaz.
        </p>
      </Section>

      <Section title="9. Üçüncü Taraf Hizmetleri">
        <p>
          Pusula; e-posta gönderimi, anlık bildirim teslimi, hata izleme ve sunucu/dosya depolama
          altyapısı için üçüncü taraf hizmet sağlayıcılar kullanır. Bu sağlayıcıların kendi
          koşulları ve gizlilik uygulamaları geçerlidir. Ayrıntı için{' '}
          <Link className="text-primary hover:underline" href="/gizlilik">
            Gizlilik Politikası
          </Link>
          &apos;na bakınız.
        </p>
      </Section>

      <Section title="10. Fikri Mülkiyet">
        <p>
          Pusula markası, logosu, arayüz tasarımı, kaynak kodu ve dokümantasyonu üzerindeki tüm
          haklar Pusula&apos;ya aittir. Bu Koşullar size Hizmet&apos;i kullanma konusunda sınırlı,
          devredilemez ve münhasır olmayan bir lisans verir; bunun ötesinde herhangi bir hak
          devri öngörmez.
        </p>
      </Section>

      <Section title="11. Koşullarda Değişiklik">
        <p>
          Bu Koşullar zaman zaman güncellenebilir. Önemli değişiklikler uygulama üzerinden
          duyurulur ve güncel sürüm her zaman bu sayfada yer alır. Değişikliklerin yayımlanmasının
          ardından Hizmet&apos;i kullanmaya devam etmeniz, güncel Koşulları kabul ettiğiniz
          anlamına gelir.
        </p>
      </Section>

      <Section title="12. Uygulanacak Hukuk">
        <p>
          Bu Koşullar Türkiye Cumhuriyeti hukukuna tabidir. Koşullardan kaynaklanan
          uyuşmazlıklarda Türkiye Cumhuriyeti mahkemeleri yetkilidir; tüketici mevzuatından doğan
          zorunlu yetki kuralları saklıdır.
        </p>
      </Section>

      <Section title="13. İletişim">
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
