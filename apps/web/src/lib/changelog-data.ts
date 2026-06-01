/**
 * Pusula "Yenilikler" (changelog) verisi — `/yenilikler` sayfası + anasayfa
 * HomeHero "Son yenilik" rozeti tarafından paylaşılır. Müşteri/kullanıcı
 * dilinde yazılmıştır; teknik jargon (faz numarası, DEM-XXX, paket isimleri)
 * içermez. Yeni entry her zaman `CHANGELOG[0]`'a (en üste) eklenir.
 *
 * Bu modül salt-veridir — React import etmez, framework-bağımsızdır.
 */

export type ChangelogEntryKind = 'new' | 'improvement' | 'security' | 'fix';

export interface ChangelogEntry {
  kind: ChangelogEntryKind;
  text: string;
}

export interface ChangelogDay {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /** Human-readable Turkish label, e.g. "1 Haziran 2026". */
  label: string;
  entries: ChangelogEntry[];
}

/**
 * Kind badge meta — etiket + tasarım token tabanlı renk seti. Hero pill'i
 * KIND_META kullanmaz; yalnız `/yenilikler` sayfasındaki `KindBadge` tüketir.
 */
export const CHANGELOG_KIND_META: Record<
  ChangelogEntryKind,
  { label: string; tone: string }
> = {
  new: {
    label: 'Yeni',
    tone: 'bg-primary/10 text-primary border-primary/20',
  },
  improvement: {
    label: 'İyileştirme',
    tone: 'bg-secondary text-secondary-foreground border-border',
  },
  security: {
    label: 'Güvenlik',
    tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  },
  fix: {
    label: 'Hata düzeltme',
    tone: 'bg-muted text-muted-foreground border-border',
  },
};

export const CHANGELOG: ChangelogDay[] = [
  {
    date: '2026-06-01',
    label: '1 Haziran 2026',
    entries: [
      {
        kind: 'new',
        text: 'Anasayfa karşılama bandına hafif bir hareket dokusu eklendi: arka planda yavaşça kayan aurora ışıkları, başlıkta yumuşak gradient parıltı, "Son yenilik" rozetinde ışıltı ve sağdaki Pusula logosunda kısa dönüş. Açılışta metinler kademeli olarak yumuşakça belirir; sistem tercihinizde "Hareketi azalt" açıksa tüm animasyonlar otomatik durur.',
      },
      {
        kind: 'new',
        text: 'Anasayfa 4 sütunlu gezgininde satıra sağ tıklayınca hızlı eylem menüsü açılır: yetkinize göre çalışma alanı, pano, liste ve kart için "Yeniden adlandır" ile "Arşivle", panolar için ayrıca "Sabitle / Sabitlemeyi kaldır", kartlar için "Kopyala" eylemleri tek menüde toplandı.',
      },
      {
        kind: 'improvement',
        text: 'Anasayfa gezgin satırları artık daha yoğun bilgi taşıyor: çalışma alanlarında "şu kadar önce aktif" notu, panolarda "{açık} açık · {bitti} bitti" özeti ve sağda üye avatar yığını (en fazla 3 + "+N"), listelerde "{tamamlanan}/{toplam}" sayacı ve vadesi geçmiş kart için kırmızı uyarı rozeti.',
      },
      {
        kind: 'new',
        text: 'Yeni "Yenilikler" sol paneli ve anasayfa "Son yenilik" rozeti eklendi — Pusula\'daki en son güncellemeleri tek tıkla görür, tam sayfaya (/yenilikler) geçebilirsiniz.',
      },
      {
        kind: 'new',
        text: 'Yeni "Görevlerim" sol paneli yayında — size atanmış tüm kartları (atanmadığım dahil), son tarih durumuna göre filtreleyip tek panelden takip edebilirsiniz.',
      },
      {
        kind: 'new',
        text: 'Yeni "Aktivite Akışı" sol paneli yayında — ekibinizdeki son değişiklikleri (kart oluşturma, taşıma, yorum, tamamlama vb.) tek panelden anında görebilirsiniz.',
      },
      {
        kind: 'improvement',
        text: 'Planlayıcı paneline tarih navigasyonu (◀ Bugün ▶ + takvim popover\'ı) eklendi; gün boyunca dolu saat aralığına göre saatler dinamik ölçeklenir ve çakışan etkinlikler artık ayrı kolonlarda yan yana gösterilir.',
      },
      {
        kind: 'improvement',
        text: 'Gezgin sol paneli sadeleştirildi: 4 katmanlı ağaç yerine artık kartların düz listesi (her satırda "Pano › Liste" yolu) görünür; aktif kart vurgulanır, arama doğrudan kart başlığında çalışır.',
      },
      {
        kind: 'improvement',
        text: 'Sol panel başlıklarına (Görevlerim, Aktivite, Hızlı Notlar) sağ-tık menüsü eklendi — sağ tıklayıp paneli hızlıca kapatabilirsiniz.',
      },
      {
        kind: 'improvement',
        text: 'Sol panellerin kapat (X) butonlarında "Kapat (Esc)" ipucu görünür — klavyeden Esc tuşuyla da kapatabileceğinizi hatırlatır.',
      },
      {
        kind: 'fix',
        text: 'Klasik PDF rapor indirme bazı kurulumlarda oturum hatası verip indirilmiyordu — alt-domain çerez sorununu giderdik, web ve mobilde tekrar çalışıyor.',
      },
      {
        kind: 'new',
        text: 'Liste ve kartlara "Kalıcı sil" eylemi eklendi — context menüden (sağ tık) veya liste başlığındaki ⋮ menüden ulaşabilirsiniz. Yalnızca pano yöneticileri görebilir; geri alınamaz olduğu için onay diyaloğu zorunludur. Arşivleme aynen duruyor (eski yerinde, geri alınabilir).',
      },
      {
        kind: 'improvement',
        text: 'Listeyi kalıcı silmek için içindeki kartların önce taşınması ya da arşivlenmesi gerekir; menüde "Listeyi sil" pasif görünür ve nedenini bir ipucuyla anlatır.',
      },
      {
        kind: 'new',
        text: 'Yeni "Planlayıcı" paneli yayında — sol kenardan açılır, gününüzü Pusula içinden takip edebilirsiniz.',
      },
      {
        kind: 'new',
        text: 'Google Takvim entegrasyonu (ilk sürüm): Google hesabınızı bağlayıp takvim olaylarınızı Pusula içinde görebilirsiniz (salt-okunur).',
      },
      {
        kind: 'new',
        text: 'Takvim olayına tıklayınca başlık, zaman, açıklama ve katılımcıları gösteren bir detay penceresi açılır.',
      },
      {
        kind: 'new',
        text: 'Anasayfa baştan tasarlandı: 4 sütunlu "Gezgin" deneyimi ile workspace → pano → liste → kart hiyerarşisinde tek ekrandan drill-down yapabilir, seçimleri URL ile paylaşabilirsiniz.',
      },
      {
        kind: 'improvement',
        text: 'Artık tek bir takvim yerine Google\'da görünür tüm takvimlerinizdeki olaylar birleşik gösteriliyor (her olay kendi takvim rengiyle).',
      },
      {
        kind: 'improvement',
        text: 'Gezgin ve Hızlı Notlar açma/kapama düğmeleri sol kenar barına taşındı; anasayfada artık zorla açık değil, tercihiniz hatırlanır.',
      },
    ],
  },
  {
    date: '2026-05-31',
    label: '31 Mayıs 2026',
    entries: [
      {
        kind: 'new',
        text: 'Mobil uygulama iPad ve büyük tablet desteğine geçti (sürüm 1.1.0) — büyük ekranlarda uygun düzen, yön değişimine duyarlı yerleşim.',
      },
      {
        kind: 'new',
        text: 'iPad/yatay modda kanban kolon genişlikleri ekrana göre otomatik ayarlanır.',
      },
      {
        kind: 'improvement',
        text: 'iPad/tablette uzun alt-perdeler (sheet) artık popover olarak açılır — büyük ekranda daha doğal kullanım.',
      },
      {
        kind: 'fix',
        text: 'Mobil release sürümünde nadir yaşanan açılış çökmesi sorunu giderildi.',
      },
      {
        kind: 'fix',
        text: 'Görev son tarihi yaklaştığında veya geçtiğinde bazı push bildirimlerinin gönderilmemesi sorunu çözüldü.',
      },
    ],
  },
  {
    date: '2026-05-26',
    label: '26 Mayıs 2026',
    entries: [
      {
        kind: 'new',
        text: 'Sağ üst kullanıcı menüsüne "Yenilikler" kısayolu eklendi — Pusula\'daki son güncellemelere tek tıkla ulaşabilirsiniz.',
      },
      {
        kind: 'new',
        text: 'Mobil kart detayında Açıklama ve Yapılacaklar artık üstte kompakt sekmeler arasından seçilir.',
      },
      {
        kind: 'improvement',
        text: 'Kart açıklaması ve yorumlardaki başlık seçimi sade bir "T" menüsünde toplandı — Başlık 1/2/3 ve normal metin arasında tek dokunuşla geçebilirsiniz.',
      },
      {
        kind: 'improvement',
        text: 'Mobilde uzun kart açıklamaları artık 500 karakterden sonra katlanır ve "Daha fazla göster" ile açılır.',
      },
    ],
  },
  {
    date: '2026-05-25',
    label: '25 Mayıs 2026',
    entries: [
      {
        kind: 'new',
        text: 'Uygulamayı 15 farklı renk teması arasından seçebilirsiniz (rose, mavi, yeşil, WhatsApp, Discord ve daha fazlası).',
      },
      {
        kind: 'new',
        text: 'Header üzerinden uygulamanın yazı tipini 8 farklı font arasından seçebilirsiniz (Poppins, Inter, Sistem, Lora, Manrope, DM Sans, JetBrains Mono, Atkinson Hyperlegible).',
      },
      {
        kind: 'new',
        text: 'Yeni "Gezgin" sol paneli ile workspace, pano, liste ve kart hiyerarşisinde hızlıca dolaşabilirsiniz.',
      },
      {
        kind: 'new',
        text: 'Hızlı Notlar artık panoya değil, üst bara taşındı ve her ekrandan erişilebilir.',
      },
      {
        kind: 'new',
        text: 'Pusula logosu artık animasyonlu açılıyor.',
      },
      {
        kind: 'new',
        text: 'Pano üst barından tek tıkla kapak, üyeler, listeler ve yorumlar içeren hazır bir PDF raporu indirebilirsiniz (mobilden de aynı buton).',
      },
      {
        kind: 'new',
        text: 'Zamanlanmış raporlarınız hazırlandığında anında push bildirimi alırsınız.',
      },
      {
        kind: 'improvement',
        text: 'Kart penceresi başlık, kenar paneli, kapak görseli, ekler ve kontrol listesi alanlarında daha derli toplu ve akıcı.',
      },
      {
        kind: 'security',
        text: 'Davet ekranlarında artık kendi kendinizi üye olarak ekleyemezsiniz (kart, pano ve workspace üyeliği için).',
      },
      {
        kind: 'security',
        text: 'Süresi geçen davetler artık otomatik olarak "süresi doldu" durumuna geçer.',
      },
      {
        kind: 'security',
        text: 'Yönetici işlemleri (üye çıkarma, rol değiştirme, davet iptali, dosya silme, paylaşım linki oluşturma/iptal) artık denetim kaydı tutulur — workspace sahibi geçmişi görebilir.',
      },
    ],
  },
  {
    date: '2026-05-24',
    label: '24 Mayıs 2026',
    entries: [
      {
        kind: 'new',
        text: 'Pano, liste ve kart için 30 farklı hazır rapor görüntüleyebilir, kaydedebilirsiniz (aktivite, üye katkısı, etiket dağılımı, durum kırılımı, gecikme analizi, panonun sağlık skoru ve daha fazlası).',
      },
      {
        kind: 'new',
        text: 'Raporlarınızı PDF, Excel, PNG veya SVG olarak tek tıkla indirebilirsiniz.',
      },
      {
        kind: 'new',
        text: 'Hazırladığınız raporları günlük, haftalık veya aylık otomatik olarak çalışacak şekilde zamanlayıp e-posta ile alabilirsiniz.',
      },
      {
        kind: 'new',
        text: 'Raporlarda önce/sonra karşılaştırma ile dönemler arası değişimi görebilirsiniz (örn. bu hafta vs geçen hafta).',
      },
      {
        kind: 'new',
        text: 'Raporlar gerçek zamanlı tazelik rozeti gösterir — pano değiştiğinde "Veri eskidi, yenile" uyarısı çıkar.',
      },
      {
        kind: 'new',
        text: 'Workspace içinde tüm raporlarınızı tek noktadan görebileceğiniz "/reports" merkez sayfası açıldı.',
      },
      {
        kind: 'new',
        text: 'Raporları mobil uygulamadan görüntüleyip PDF olarak indirebilirsiniz.',
      },
      {
        kind: 'improvement',
        text: 'Pano içinden hızlıca yeni rapor oluşturmak için kompakt bir rapor sihirbazı eklendi.',
      },
    ],
  },
  {
    date: '2026-05-23',
    label: '23 Mayıs 2026',
    entries: [
      {
        kind: 'fix',
        text: '/sign-in ekranındaki "Şifreni mi unuttun?" gibi linklere mouse ile üzerine gelince el ikonu eklendi.',
      },
    ],
  },
  {
    date: '2026-05-22',
    label: '22 Mayıs 2026',
    entries: [
      {
        kind: 'new',
        text: 'Giriş, kayıt, şifremi unuttum ve şifre sıfırlama akışları tek bir landing sayfasında, çok modlu cam kartta toplandı (aurora arka plan, pano önizlemesi, sosyal kanıt ve istatistik şeridiyle).',
      },
    ],
  },
  {
    date: '2026-05-21',
    label: '21 Mayıs 2026',
    entries: [
      {
        kind: 'new',
        text: 'Web uygulaması artık tablet (yatay) dokunmatik kullanımıyla uyumlu.',
      },
      {
        kind: 'new',
        text: 'iOS evrensel linkler (universal links) aktifleştirildi — Pusula linkleri Safari yerine doğrudan uygulamada açılır.',
      },
      {
        kind: 'fix',
        text: 'Mobil uygulamada soğuk başlangıçta başlangıç sekmesinin yanlış açılması sorunu çözüldü (TestFlight 3. tur).',
      },
    ],
  },
  {
    date: '2026-05-20',
    label: '20 Mayıs 2026',
    entries: [
      {
        kind: 'new',
        text: 'iPad uygulaması artık dört yöne de döndürülebilir (portre/manzara).',
      },
      {
        kind: 'new',
        text: 'Mobil panoya kanban yanında sade dikey liste görünümü eklendi.',
      },
      {
        kind: 'fix',
        text: 'TestFlight ikinci turu yedi mobil hatayı kapsayan toplu düzeltmeyle yayınlandı (OTA güncelleme).',
      },
    ],
  },
  {
    date: '2026-05-19',
    label: '19 Mayıs 2026',
    entries: [
      {
        kind: 'new',
        text: 'Marka temalı 404 (sayfa bulunamadı) ekranı eklendi.',
      },
      {
        kind: 'new',
        text: 'Gizlilik politikası sayfası (/gizlilik) yayında — App Store gönderimi için zorunlu.',
      },
      {
        kind: 'new',
        text: 'Mobil uygulamada hızlı not dock ve kaydırmalı satır aksiyonları eklendi.',
      },
      {
        kind: 'improvement',
        text: 'Mobil kontrol listesi (checklist) ve satır aksiyonlarında ciddi UX iyileştirmeleri.',
      },
      {
        kind: 'improvement',
        text: 'Web, mobil ve backend için kapsamlı performans iyileştirmeleri.',
      },
      {
        kind: 'improvement',
        text: 'Mobil uygulamada arama artık aşağı çekerek yenilenebilir; foreground push geldiğinde otomatik refetch yapılır.',
      },
      {
        kind: 'fix',
        text: 'Web tarafında bir kart tamamlandığında diğer kullanıcılarda anında güncellenmeyen kart detay modalı senkron sorunu çözüldü.',
      },
    ],
  },
  {
    date: '2026-05-18',
    label: '18 Mayıs 2026',
    entries: [
      {
        kind: 'new',
        text: 'Web tarafına Hızlı Notlar paneli eklendi — notu yazıp bir karta sürükleyebilirsiniz.',
      },
      {
        kind: 'new',
        text: 'Mobil uygulamada artık avatar yükleyebilir ve hesabınızı uygulama içinden silebilirsiniz.',
      },
      {
        kind: 'new',
        text: 'Mobil uygulamada panoları yeniden adlandırma ve arşivleme aksiyonları eklendi.',
      },
      {
        kind: 'new',
        text: 'Mobil uygulamada üye yönetimi (rol değiştir, üye çıkar, davet iptal) tam destekli.',
      },
      {
        kind: 'new',
        text: 'Mobil panolarda liste rengi ve özel ikonları artık görünüyor.',
      },
      {
        kind: 'new',
        text: 'Mobil uygulamada light/dark tema seçimi ve yeniden tasarlanmış Hesap sayfası.',
      },
      {
        kind: 'new',
        text: 'Mobil kart detay ekranı (başlık, açıklama, etiket, üye, kontrol listesi, ek, yorum) zenginleştirildi — Tiptap ile biçimlendirilmiş açıklamalar render edilir.',
      },
      {
        kind: 'new',
        text: 'Mobil uygulamaya merkezi Ekle butonu (kart/liste/hızlı not oluşturma menüsü) eklendi.',
      },
      {
        kind: 'new',
        text: 'Mobil kartlarda kapak rengi görüntüleme + kart tamamla/geri al toggle eklendi.',
      },
      {
        kind: 'new',
        text: 'Mobil uygulamada eklenti yükleme, bildirim merkezi, realtime senkron ve push teslimi tam destekli.',
      },
      {
        kind: 'new',
        text: 'Mobil arama ekranı (kart, liste, ek bazlı arama) yayında.',
      },
      {
        kind: 'improvement',
        text: 'Mobil uygulamada açılış ekranına özel Pusula animasyonu (AppSpinner) eklendi.',
      },
      {
        kind: 'improvement',
        text: 'Mobil tipografi Poppins fontuna geçti.',
      },
    ],
  },
  {
    date: '2026-05-17',
    label: '17 Mayıs 2026',
    entries: [
      {
        kind: 'new',
        text: 'iOS ve Android için Pusula mobil uygulaması yayında (Expo) — workspace, pano, liste ve kartlarınıza her yerden erişin.',
      },
      {
        kind: 'new',
        text: 'Mobil uygulamada kimlik doğrulama (giriş, kayıt, oturum) tam destekli.',
      },
      {
        kind: 'new',
        text: 'Web anasayfa baştan yeniden tasarlandı (Variant A).',
      },
    ],
  },
  {
    date: '2026-05-16',
    label: '16 Mayıs 2026',
    entries: [
      {
        kind: 'new',
        text: 'Pusula linkleri sosyal medyada paylaşıldığında artık markalı OpenGraph önizleme görseli çıkıyor.',
      },
      {
        kind: 'new',
        text: 'Karta eklenen dosyalar artık arama kapsamına dahil.',
      },
      {
        kind: 'new',
        text: 'Pano filtre menüsüne tarihe göre filtreleme bölümü eklendi.',
      },
      {
        kind: 'new',
        text: 'Bildirim ayarları sayfası ve kart eki yükleme özelliği yayında.',
      },
      {
        kind: 'new',
        text: 'Hata izleme ve performans takibi için Sentry entegrasyonu (web, api, worker).',
      },
      {
        kind: 'new',
        text: 'Liste ikon seti ve gelişmiş bildirim tipleri (pano erişim isteği vb.) eklendi.',
      },
      {
        kind: 'improvement',
        text: 'Türkçe metinlerde, davet bildirimlerinde ve durum gösterimlerinde sistem geneli papercut düzeltmeleri.',
      },
      {
        kind: 'improvement',
        text: 'Sistem bildirimlerinde gereksiz "Bir kullanıcı..." aktör adı kaldırıldı; aktör fallback ve son tarih gösterimi iyileştirildi.',
      },
      {
        kind: 'security',
        text: 'Güvenlik sertleştirme: HTTP header politikası, CSP, rate limit, ortam değişkeni guard.',
      },
      {
        kind: 'security',
        text: 'Güvenlik sertleştirme: Redis parola koruması + MinIO IAM servis hesabı.',
      },
      {
        kind: 'fix',
        text: 'Erişim talepleri artık sayfa yenilemeden anında görünür (realtime).',
      },
      {
        kind: 'fix',
        text: 'Kart sürükle-bırakta üste bırakma yanlış pozisyon hesabı sorunu çözüldü.',
      },
      {
        kind: 'fix',
        text: 'E-posta linklerinde localhost görünmesi sorunu çözüldü (üretim ortamında).',
      },
      {
        kind: 'fix',
        text: 'Avatar yükleme Mixed Content sorunu çözüldü (presigned URL + MinIO Traefik route).',
      },
      {
        kind: 'fix',
        text: 'PDF önizlemede sandbox kaldırıldı ve "yeni sekmede aç" aksiyonu eklendi.',
      },
    ],
  },
  {
    date: '2026-05-15',
    label: '15 Mayıs 2026',
    entries: [
      {
        kind: 'new',
        text: 'Kart paylaşımı: kartın linkini oluşturup giriş yapmadan misafirlerin görmesini sağlayabilirsiniz.',
      },
      {
        kind: 'new',
        text: 'Kart açıklaması ve yorumlarda Tiptap rich-text editör (kalın, italik, liste, link, mention, vb.) destekli.',
      },
      {
        kind: 'new',
        text: 'Bildirim merkezinde tarih bazlı gruplama (Bugün, Dün, Bu hafta).',
      },
      {
        kind: 'new',
        text: 'Klavye kısayolları: kart modalı, pano gezinme, Ctrl+Space ile arama ve "?" ile yardım dialog.',
      },
      {
        kind: 'new',
        text: 'Yeni kayıt için onboarding showcase pano şablonu eklendi.',
      },
      {
        kind: 'new',
        text: 'Yeni kayıtta e-posta doğrulama akışı + cooldown korumalı yeniden gönderme.',
      },
      {
        kind: 'new',
        text: 'Üye rollerinin yanında ne işe yaradığını açıklayan tooltip\'ler eklendi.',
      },
      {
        kind: 'improvement',
        text: 'Liste kolonlarının görünür kenarlığı kaldırıldı (Trello görsel uyumu).',
      },
      {
        kind: 'improvement',
        text: 'Pano liste etkileşim cilası ve liste rengi kolon temasına uygulandı.',
      },
    ],
  },
  {
    date: '2026-05-14',
    label: '14 Mayıs 2026',
    entries: [
      {
        kind: 'new',
        text: 'Tüm panolarda full-text arama (kart, liste, açıklama, yorum) yayında — indeks otomatik güncellenir.',
      },
      {
        kind: 'new',
        text: 'Kartlara kapak fotoğrafı yükleme özelliği eklendi.',
      },
      {
        kind: 'new',
        text: 'Pano aktivite akışı sayfası (kim ne yaptı, ne zaman) eklendi.',
      },
      {
        kind: 'new',
        text: 'Pano erişim talepleri (gizli panolara katılma isteği gönderme/onaylama) yayında.',
      },
      {
        kind: 'new',
        text: 'Web bildirim merkezi (sağ üst köşede çan ikonu + okunmamış sayacı + okundu işaretle) yayında.',
      },
      {
        kind: 'new',
        text: 'Panolara arka plan rengi (gradient veya düz palet) seçebilirsiniz.',
      },
      {
        kind: 'new',
        text: 'Liste renk seçici UI eklendi — listelere özel renk atayabilirsiniz.',
      },
      {
        kind: 'new',
        text: 'Yorumlardaki @mention bildirimleri realtime — bahsedildiğinizde anında bildirim alırsınız.',
      },
      {
        kind: 'new',
        text: 'Üst barda workspace switcher + pano switcher + kullanıcı menüsü (app-shell v2).',
      },
      {
        kind: 'new',
        text: 'Tüm uygulamada light/dark tema desteği (header\'dan toggle).',
      },
    ],
  },
  {
    date: '2026-05-13',
    label: '13 Mayıs 2026',
    entries: [
      {
        kind: 'new',
        text: 'Pano sürükle-bırak: liste ve kartları akıcı şekilde yeniden sıralayabilir, kartı bir listeden diğerine taşıyabilirsiniz (Pragmatic Drag and Drop).',
      },
      {
        kind: 'new',
        text: 'Kartı farklı bir panoya taşıma (cross-board move) ve kart kopyalama eklendi.',
      },
      {
        kind: 'new',
        text: 'Gerçek zamanlı senkron (Socket.IO): bir başkasının yaptığı değişiklik anında ekranınıza yansır.',
      },
      {
        kind: 'new',
        text: 'E-posta ve push bildirimleri (atama, due-date yaklaştı, yorum mention vb.) yayında.',
      },
      {
        kind: 'new',
        text: 'Şifre sıfırlama akışı (Şifreni mi unuttun? → e-posta linki → yeni şifre belirle).',
      },
      {
        kind: 'improvement',
        text: 'Optimistic UI: yaptığınız aksiyonlar arkada onaylanmadan önce ekranda görünür; hata olursa otomatik geri alınır.',
      },
      {
        kind: 'improvement',
        text: 'Pano ekranına ince özel scrollbar eklendi; sürükle-bırak sonrası kıpırdama sorunu çözüldü.',
      },
    ],
  },
  {
    date: '2026-05-12',
    label: '12 Mayıs 2026',
    entries: [
      {
        kind: 'new',
        text: 'Pusula yayında — kayıt olun, workspace açın, ekip arkadaşlarınızı davet edin.',
      },
      {
        kind: 'new',
        text: 'Workspace yönetimi: workspace oluşturma, üye davet etme/çıkarma, rol atama, workspace silme.',
      },
      {
        kind: 'new',
        text: 'Pano + liste + kart CRUD (oluştur, düzenle, sil, arşivle).',
      },
      {
        kind: 'new',
        text: 'Kart detay modalı: başlık, açıklama (Tiptap rich-text), kontrol listesi, yorum, etiket, üye atama, kapak rengi, tamamlama.',
      },
      {
        kind: 'new',
        text: 'Pano üye yönetimi + board davetleri + etiket yönetimi UI + etikete göre filtreleme.',
      },
      {
        kind: 'new',
        text: 'Yeni kullanıcılara onboarding: ilk pano otomatik açılır, varsayılan listeler ve hoşgeldin kartlarıyla başlar.',
      },
      {
        kind: 'new',
        text: 'Hesap ayarları: profil/avatar düzenleme, parola değiştirme, hesap silme.',
      },
      {
        kind: 'new',
        text: 'Tasarım sistemi (tema, design token, paylaşılan UI bileşenleri) ve a11y rötuşları.',
      },
    ],
  },
];

/** En son changelog gününü döner — hero rozeti için kullanılır. */
export function getLatestChangelogDay(): ChangelogDay | null {
  return CHANGELOG[0] ?? null;
}
