/**
 * Tek seferlik üretim verisi — "Kaymakamlık İş Takip" çalışma alanı.
 *
 * Bir kaymakamlığın takip ettiği işleri/konuları temsil eden örnek bir
 * workspace üretir: 3 pano, pano başına 4-6 liste, liste başına 1-10 kart;
 * kartların bir kısmı minimal (yalnız başlık), bir kısmı dolu (açıklama,
 * etiket, son tarih, checklist, yorum, atanan kişi, kapak rengi).
 *
 * Tüm kayıtlar `demirkol.abdullah93@gmail.com` kullanıcısına aittir — bu
 * kullanıcı veritabanında ZATEN var olmalıdır (uygulamadan kayıt olmuş).
 * Script kullanıcıyı e-postayla bulur; yoksa hata verip durur (sahte
 * kullanıcı oluşturmaz, çünkü `accounts`/parola satırı olmadan giriş yapılamaz).
 *
 * Idempotent: `kaymakamlik` slug'lı workspace zaten varsa hiçbir şey yapmaz,
 * yeniden çalıştırmak güvenlidir. Tüm yazımlar tek transaction içindedir.
 *
 * Çalıştırma (DATABASE_URL ortam değişkeni üretim DB'sine bakmalı):
 *   pnpm --filter @pusula/db seed:kaymakamlik
 *
 * Not: bu dosya bilinçli olarak `packages/db/src/` DIŞINDADIR — `seed.ts`'in
 * minimal yerel seed'i bozulmasın ve `seed-safety.test.ts` garantisi geçerli
 * kalsın diye. Bu, `pnpm db:seed`'in parçası değildir; ayrı bir komuttur.
 */
import { eq } from 'drizzle-orm';
import { firstPosition, positionsBetween } from '@pusula/domain';
import { createDb } from '../src/client';
import {
  boardMembers,
  boards,
  cardLabels,
  cardMembers,
  cards,
  checklistItems,
  checklists,
  comments,
  labels,
  lists,
  users,
  workspaceMembers,
  workspaces,
} from '../src/schema';
import { syncSearchDocumentsForScope } from '../src/search-indexer';

const OWNER_EMAIL = 'demirkol.abdullah93@gmail.com';
const WORKSPACE_SLUG = 'kaymakamlik';
const WORKSPACE_NAME = 'Kaymakamlık İş Takip';

// ---------------------------------------------------------------------------
// Seed veri modeli — saf veri; aşağıdaki walker bunu DB satırlarına çevirir.
// ---------------------------------------------------------------------------

interface SeedComment {
  body: string;
  /** Yorumun kaç gün önce yazıldığı (sıralama için createdAt offset'i). */
  daysAgo: number;
}

interface SeedChecklist {
  title: string;
  items: { text: string; done?: boolean }[];
}

interface SeedCard {
  title: string;
  description?: string;
  /** Son tarih: bugünden +gün (negatif = gecikmiş). */
  dueInDays?: number;
  completed?: boolean;
  /** `@pusula/domain` CARD_COVER_COLORS değerlerinden biri. */
  coverColor?: string;
  /** Panodaki etiket adlarına referans. */
  labels?: string[];
  /** Sahibi karta "sorumlu" olarak atansın. */
  assignee?: boolean;
  /** Sahibi kartı "izleyen" olarak eklesin. */
  watcher?: boolean;
  comments?: SeedComment[];
  checklists?: SeedChecklist[];
}

interface SeedList {
  title: string;
  /** `@pusula/domain` LIST_COLORS değerlerinden biri. */
  color?: string;
  /** `@pusula/domain` LIST_ICONS değerlerinden biri. */
  icon?: string;
  /** `@pusula/domain` LIST_ICON_COLORS değerlerinden biri. */
  iconColor?: string;
  cards: SeedCard[];
}

interface SeedBoard {
  title: string;
  /** `@pusula/domain` ENTITY_ICONS değerlerinden biri. */
  icon: string;
  labels: { name: string; color: string }[];
  lists: SeedList[];
}

// ---------------------------------------------------------------------------
// Pano içeriği — kaymakamlık tarafından takip edilen işler/konular.
// ---------------------------------------------------------------------------

const BOARDS: SeedBoard[] = [
  {
    title: 'Sosyal Yardımlar Takip',
    icon: 'heart',
    labels: [
      { name: 'Acil', color: 'red' },
      { name: 'Nakdi Yardım', color: 'green' },
      { name: 'Eğitim', color: 'blue' },
      { name: 'Sağlık', color: 'purple' },
      { name: 'Gıda & Erzak', color: 'orange' },
      { name: 'Yakacak', color: 'black' },
    ],
    lists: [
      {
        title: 'Yeni Başvurular',
        color: 'mavi',
        icon: 'list-todo',
        iconColor: 'mavi',
        cards: [
          {
            title: 'Ahmet Y. — Kira yardımı başvurusu',
            description:
              'Merkez Mahallesi sakini, 4 kişilik hane. Eşi vefat etmiş, çocuklardan biri engelli. Kira yardımı talep ediyor.\n\nBaşvuru evrakı SOYBİS üzerinden teyit edilecek.',
            labels: ['Nakdi Yardım', 'Acil'],
            dueInDays: 3,
            assignee: true,
            checklists: [
              {
                title: 'Başvuru Evrakı',
                items: [
                  { text: 'Nüfus kayıt örneği alındı', done: true },
                  { text: 'Gelir durum belgesi', done: true },
                  { text: 'Kira sözleşmesi fotokopisi' },
                  { text: 'İkametgah belgesi' },
                ],
              },
            ],
            comments: [
              {
                body: 'Başvuru sahibi bugün geldi, evrakların yarısını teslim etti. Kalanı için süre verildi.',
                daysAgo: 2,
              },
            ],
          },
          {
            title: 'Ayşe K. — Öğrenci eğitim yardımı',
            description:
              'Üniversite 2. sınıf öğrencisi. Barınma ve eğitim malzemesi desteği talebi.',
            labels: ['Eğitim'],
            dueInDays: 7,
          },
          { title: 'Mehmet T. — Gıda kolisi talebi', labels: ['Gıda & Erzak'] },
          { title: 'Fatma S. — İlaç ve tedavi gideri desteği', labels: ['Sağlık'] },
          {
            title: 'Hatice D. — Yakacak (kömür) yardımı başvurusu',
            labels: ['Yakacak'],
            dueInDays: 5,
          },
        ],
      },
      {
        title: 'Sosyal İnceleme',
        color: 'sari',
        icon: 'hourglass',
        iconColor: 'turuncu',
        cards: [
          {
            title: 'Hasan B. — Saha ziyareti yapılacak',
            description:
              'Beyan edilen hane durumunun yerinde tespiti için sosyal inceleme görevlisi yönlendirilecek.',
            labels: ['Nakdi Yardım'],
            dueInDays: 2,
            assignee: true,
            comments: [
              { body: 'Ziyaret için Perşembe günü planlandı, muhtarla görüşüldü.', daysAgo: 1 },
            ],
          },
          {
            title: 'Zeynep C. — Eksik evrak tamamlanması bekleniyor',
            labels: ['Eğitim'],
            watcher: true,
          },
          {
            title: 'Ali V. — İkametgah ve gelir teyidi',
            description: 'SOYBİS ve adres kayıt sistemi sorgusu yapılacak.',
            labels: ['Sağlık'],
          },
          { title: 'Emine G. — Hane halkı tespiti' },
        ],
      },
      {
        title: 'Kaymakam Onayı Bekleyen',
        color: 'turuncu',
        icon: 'flag',
        iconColor: 'kirmizi',
        cards: [
          {
            title: 'Mustafa D. — Şartlı eğitim yardımı (kurul kararı)',
            description:
              'Sosyal inceleme olumlu sonuçlandı. Vakıf mütevelli heyeti kararı için Sayın Kaymakamın onayına sunulacak.',
            labels: ['Eğitim', 'Nakdi Yardım'],
            dueInDays: 1,
            coverColor: 'turuncu',
            assignee: true,
            checklists: [
              {
                title: 'Onay Süreci',
                items: [
                  { text: 'Sosyal inceleme raporu eklendi', done: true },
                  { text: 'Mütevelli heyeti gündemine alındı', done: true },
                  { text: 'Kaymakam imzası' },
                ],
              },
            ],
            comments: [
              { body: 'Rapor olumlu. Heyetin Cuma toplantısına yetiştirildi.', daysAgo: 3 },
              { body: 'Gündeme alındı, onay bekliyor.', daysAgo: 1 },
            ],
          },
          { title: 'Hüseyin F. — Barınma yardımı onayı', labels: ['Acil', 'Nakdi Yardım'] },
          { title: 'Sevim A. — Yakacak yardımı kurul onayı', labels: ['Yakacak'] },
        ],
      },
      {
        title: 'Ödeme Aşaması',
        icon: 'clock',
        iconColor: 'mor',
        cards: [
          {
            title: 'Kemal H. — 2.000 TL nakdi yardım ödemesi',
            description: 'Onay tamamlandı. PTT üzerinden ödeme talimatı hazırlanıyor.',
            labels: ['Nakdi Yardım'],
            dueInDays: 4,
            assignee: true,
          },
          { title: 'Elif I. — Doğalgaz fatura desteği ödemesi', labels: ['Yakacak'] },
        ],
      },
      {
        title: 'Sonuçlanan / Arşiv',
        color: 'yesil',
        icon: 'circle-check',
        iconColor: 'yesil',
        cards: [
          {
            title: 'Ömer J. — Eğitim materyali yardımı teslim edildi',
            description: 'Kırtasiye ve okul malzemesi öğrenciye ulaştırıldı, tutanak imzalandı.',
            labels: ['Eğitim'],
            completed: true,
            comments: [{ body: 'Teslim tutanağı dosyaya eklendi. Süreç kapatıldı.', daysAgo: 12 }],
          },
          {
            title: 'Hasan Y. — Kömür yardımı dağıtıldı',
            labels: ['Yakacak'],
            completed: true,
            coverColor: 'yesil',
          },
          { title: 'Naciye T. — Gıda kolisi teslim edildi', labels: ['Gıda & Erzak'], completed: true },
          { title: 'Veli K. — Başvuru reddedildi (gelir kriteri aşımı)', completed: true },
          { title: 'Osman M. — Mükerrer başvuru, işlemden kaldırıldı', completed: true },
          {
            title: 'İlknur S. — Sağlık gideri desteği tamamlandı',
            labels: ['Sağlık'],
            completed: true,
          },
        ],
      },
    ],
  },
  {
    title: 'Köy ve Mahalle Hizmetleri',
    icon: 'home',
    labels: [
      { name: 'Altyapı', color: 'orange' },
      { name: 'Yol & Ulaşım', color: 'black' },
      { name: 'İçme Suyu', color: 'sky' },
      { name: 'Okul & Eğitim', color: 'blue' },
      { name: 'Acil', color: 'red' },
      { name: 'Çevre', color: 'green' },
    ],
    lists: [
      {
        title: 'Gelen Talepler',
        color: 'mavi',
        icon: 'list-todo',
        iconColor: 'mavi',
        cards: [
          {
            title: 'Yenice Köyü — İçme suyu deposu onarımı talebi',
            description:
              'Köy muhtarlığından gelen dilekçe. Su deposunda sızıntı var, yaz aylarında kesinti yaşanıyor.',
            labels: ['İçme Suyu', 'Altyapı'],
            dueInDays: 10,
            comments: [{ body: 'Muhtar dilekçeyi elden teslim etti, evrak kaydı yapıldı.', daysAgo: 4 }],
          },
          {
            title: 'Çamlık Mahallesi — Sokak aydınlatması eksikliği',
            description: 'Ana cadde dışındaki 3 sokakta aydınlatma yok. Güvenlik sorunu bildiriliyor.',
            labels: ['Altyapı'],
          },
          { title: 'Karatepe Köyü — Köy yolu asfalt talebi', labels: ['Yol & Ulaşım'] },
          { title: 'Cumhuriyet Mahallesi — Park ve yeşil alan düzenlemesi', labels: ['Çevre'] },
          {
            title: 'Derebaşı Köyü — İlkokul çatı onarımı',
            labels: ['Okul & Eğitim', 'Acil'],
            dueInDays: 6,
          },
          { title: 'Gökçeören Köyü — Köprü korkuluğu yenileme talebi', labels: ['Yol & Ulaşım'] },
          { title: 'Yeni Mahalle — Çöp konteyneri ihtiyacı', labels: ['Çevre'] },
        ],
      },
      {
        title: 'Keşif ve İnceleme',
        color: 'sari',
        icon: 'hourglass',
        iconColor: 'turuncu',
        cards: [
          {
            title: 'Yenice Köyü su deposu — teknik keşif',
            description:
              'İl Özel İdaresi tekniğiyle birlikte yerinde keşif yapılacak, maliyet tahmini çıkarılacak.',
            labels: ['İçme Suyu'],
            dueInDays: 3,
            assignee: true,
            checklists: [
              {
                title: 'Keşif Adımları',
                items: [
                  { text: 'Muhtarla saha randevusu', done: true },
                  { text: 'Teknik ekip görevlendirme', done: true },
                  { text: 'Keşif raporu düzenleme' },
                  { text: 'Maliyet tahmini' },
                ],
              },
            ],
          },
          {
            title: 'Derebaşı İlkokulu çatı — hasar tespiti',
            labels: ['Okul & Eğitim', 'Acil'],
            watcher: true,
          },
          { title: 'Karatepe köy yolu — güzergah ölçümü', labels: ['Yol & Ulaşım'] },
          { title: 'Çamlık Mahallesi aydınlatma — direk sayımı' },
        ],
      },
      {
        title: 'Planlama / İhale',
        icon: 'calendar',
        iconColor: 'indigo',
        cards: [
          {
            title: 'Köy yolları asfalt programı 2026',
            description:
              'İlçe genelinde 3 köyün yol asfaltı için yıllık program hazırlanıyor. Ödenek talebi Valiliğe iletilecek.',
            labels: ['Yol & Ulaşım'],
            dueInDays: 14,
            coverColor: 'sari',
            assignee: true,
            comments: [
              { body: 'Ödenek talep yazısı taslağı hazır, imzaya çıkacak.', daysAgo: 2 },
            ],
          },
          { title: 'İçme suyu hattı yenileme — ihale dosyası', labels: ['İçme Suyu', 'Altyapı'] },
          { title: 'Okul onarımları — yıllık bakım planı', labels: ['Okul & Eğitim'] },
        ],
      },
      {
        title: 'Uygulamada',
        icon: 'timer',
        iconColor: 'kirmizi',
        cards: [
          {
            title: 'Cumhuriyet Mahallesi park düzenlemesi — saha çalışması',
            description: 'Yüklenici firma çalışmaya başladı. Oyun grubu ve oturma bankları kuruluyor.',
            labels: ['Çevre'],
            dueInDays: 8,
            assignee: true,
            checklists: [
              {
                title: 'İş Kalemleri',
                items: [
                  { text: 'Zemin düzenleme', done: true },
                  { text: 'Oyun grubu montajı', done: true },
                  { text: 'Bank ve aydınlatma' },
                  { text: 'Çevre temizliği ve teslim' },
                ],
              },
            ],
          },
          {
            title: 'Derebaşı İlkokulu çatı onarımı — devam ediyor',
            labels: ['Okul & Eğitim', 'Acil'],
            coverColor: 'kirmizi',
            comments: [{ body: 'Çatı kiremitlerinin %60ı değiştirildi.', daysAgo: 1 }],
          },
          { title: 'Çamlık Mahallesi sokak aydınlatması — direk dikimi', labels: ['Altyapı'] },
        ],
      },
      {
        title: 'Tamamlanan',
        color: 'yesil',
        icon: 'circle-check',
        iconColor: 'yesil',
        cards: [
          {
            title: 'Gökçeören köprü korkuluğu yenilendi',
            description: 'Korkuluklar yenilendi, geçici trafik işaretlemesi kaldırıldı.',
            labels: ['Yol & Ulaşım'],
            completed: true,
          },
          { title: 'Yeni Mahalle çöp konteynerleri yerleştirildi', labels: ['Çevre'], completed: true },
          { title: 'Karatepe köy yolu greyder çalışması bitti', labels: ['Yol & Ulaşım'], completed: true },
          {
            title: 'Yenice Köyü içme suyu klorlama sistemi devreye alındı',
            labels: ['İçme Suyu'],
            completed: true,
            coverColor: 'yesil',
          },
          { title: 'Köy konağı çevre temizliği tamamlandı', completed: true },
        ],
      },
      {
        title: 'İptal / Beklemede',
        color: 'gri',
        icon: 'pause',
        iconColor: 'gri',
        cards: [
          {
            title: 'Eskiköy taş ocağı yolu — ödenek yetersizliği nedeniyle beklemede',
            description: 'Talep gelecek yılın yatırım programına aktarıldı.',
            labels: ['Yol & Ulaşım'],
          },
          { title: 'Mülkiyet ihtilafı olan park alanı — talep iptal edildi' },
        ],
      },
    ],
  },
  {
    title: 'Resmi Yazışma ve Protokol',
    icon: 'clipboard-list',
    labels: [
      { name: 'Valilik', color: 'purple' },
      { name: 'Bakanlık', color: 'red' },
      { name: 'Gelen Evrak', color: 'blue' },
      { name: 'Giden Evrak', color: 'green' },
      { name: 'Süreli / Acele', color: 'orange' },
    ],
    lists: [
      {
        title: 'Gelen Evrak',
        color: 'mavi',
        icon: 'bell',
        iconColor: 'mavi',
        cards: [
          {
            title: 'Valilik — İlçe koordinasyon kurulu toplantı yazısı',
            description:
              'Aylık koordinasyon kurulu toplantısı için Valilikten gelen davet yazısı. Birimlere duyurulacak.',
            labels: ['Gelen Evrak', 'Valilik', 'Süreli / Acele'],
            dueInDays: 2,
            assignee: true,
            comments: [{ body: 'Yazı tüm birim amirlerine EBYS üzerinden havale edildi.', daysAgo: 1 }],
          },
          {
            title: 'İçişleri Bakanlığı — Genelge: kış tedbirleri',
            description: 'Olası don ve kar yağışına karşı alınacak tedbirlere ilişkin genelge.',
            labels: ['Gelen Evrak', 'Bakanlık'],
          },
          { title: 'İl Sağlık Müdürlüğü — aşı kampanyası bilgilendirme yazısı', labels: ['Gelen Evrak'] },
          { title: 'Belediye Başkanlığı — imar planı görüş talebi', labels: ['Gelen Evrak'] },
          { title: 'Vatandaş dilekçesi — gürültü şikayeti (CİMER)', labels: ['Gelen Evrak', 'Süreli / Acele'] },
          { title: 'İl Milli Eğitim — okul servisleri denetim yazısı', labels: ['Gelen Evrak'] },
        ],
      },
      {
        title: 'İşlemde',
        color: 'sari',
        icon: 'list-todo',
        iconColor: 'turuncu',
        cards: [
          {
            title: 'Koordinasyon kurulu gündem maddelerinin toplanması',
            description:
              'Birimlerden gelecek gündem maddeleri derlenip toplantı gündemi taslağı oluşturulacak.',
            labels: ['Valilik'],
            dueInDays: 1,
            assignee: true,
            checklists: [
              {
                title: 'Gündem Hazırlığı',
                items: [
                  { text: 'Birimlere yazı gönderildi', done: true },
                  { text: 'Gelen maddeler derlendi' },
                  { text: 'Taslak gündem Kaymakama sunuldu' },
                ],
              },
            ],
          },
          {
            title: 'CİMER gürültü şikayeti — ilgili birime havale ve cevap hazırlığı',
            labels: ['Süreli / Acele'],
            dueInDays: -1,
            coverColor: 'kirmizi',
            assignee: true,
            comments: [
              { body: 'Şikayet zabıtaya havale edildi, yerinde inceleme istendi.', daysAgo: 3 },
              { body: 'Cevap metni hazırlanıyor, süre bugün doluyor.', daysAgo: 0 },
            ],
          },
          { title: 'Kış tedbirleri genelgesi — ilçe eylem planı hazırlığı', labels: ['Bakanlık'] },
          { title: 'İmar planı görüşü — teknik değerlendirme', labels: ['Giden Evrak'] },
          { title: 'Okul servisleri denetimi — denetim ekibi oluşturma' },
        ],
      },
      {
        title: 'İmza / Onay Bekleyen',
        icon: 'flag',
        iconColor: 'kirmizi',
        cards: [
          {
            title: 'Aşı kampanyası — ilçe duyuru yazısı (imzaya hazır)',
            description: 'Sağlık Müdürlüğüne ve muhtarlıklara gönderilecek duyuru yazısı imza bekliyor.',
            labels: ['Giden Evrak'],
            dueInDays: 1,
          },
          { title: 'Koordinasyon kurulu toplantı tutanağı — onay', labels: ['Valilik'] },
          { title: 'Kış tedbirleri eylem planı — Kaymakam onayı', labels: ['Bakanlık', 'Süreli / Acele'] },
        ],
      },
      {
        title: 'Sonuçlandı',
        color: 'yesil',
        icon: 'circle-check',
        iconColor: 'yesil',
        cards: [
          {
            title: 'Geçen ay koordinasyon kurulu toplantısı yapıldı',
            description: 'Toplantı gerçekleşti, tutanak imzalandı ve birimlere dağıtıldı.',
            labels: ['Valilik'],
            completed: true,
          },
          { title: 'Bayrak ve tören talimatı muhtarlıklara tebliğ edildi', labels: ['Giden Evrak'], completed: true },
          {
            title: 'CİMER — park bakımı şikayeti cevaplandı',
            labels: ['Giden Evrak'],
            completed: true,
            coverColor: 'yesil',
          },
          { title: 'İl Özel İdaresi yatırım talep yazısı gönderildi', labels: ['Giden Evrak'], completed: true },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Walker — seed verisini DB satırlarına çevirir.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const { db, pool } = createDb();
  const now = new Date();
  const daysFromNow = (n: number) => new Date(now.getTime() + n * DAY_MS);
  const daysAgo = (n: number) => new Date(now.getTime() - n * DAY_MS);

  try {
    // 1) Sahip kullanıcıyı e-postayla bul — oluşturma; yoksa hata ver.
    const [owner] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.email, OWNER_EMAIL))
      .limit(1);
    if (!owner) {
      throw new Error(
        `Kullanıcı bulunamadı: "${OWNER_EMAIL}". Önce bu e-postayla uygulamadan ` +
          `kayıt olun (Better Auth hesabı), sonra bu script'i tekrar çalıştırın.`,
      );
    }
    const ownerId = owner.id;

    // 2) Idempotency — workspace zaten varsa hiçbir şey yapma.
    const [existing] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, WORKSPACE_SLUG))
      .limit(1);
    if (existing) {
      console.warn(
        `[seed] "${WORKSPACE_SLUG}" çalışma alanı zaten var — yapılacak bir şey yok.`,
      );
      return;
    }

    let workspaceId = '';
    let totalBoards = 0;
    let totalLists = 0;
    let totalCards = 0;
    let totalComments = 0;
    let totalChecklistItems = 0;

    // 3) Tüm yazımlar tek transaction içinde — ya hep ya hiç.
    await db.transaction(async (tx) => {
      const [workspace] = await tx
        .insert(workspaces)
        .values({
          name: WORKSPACE_NAME,
          slug: WORKSPACE_SLUG,
          icon: 'building',
          ownerId,
        })
        .returning();
      if (!workspace) throw new Error('workspace oluşturulamadı');
      workspaceId = workspace.id;

      await tx
        .insert(workspaceMembers)
        .values({ workspaceId: workspace.id, userId: ownerId, role: 'owner' });

      for (const boardSeed of BOARDS) {
        const [board] = await tx
          .insert(boards)
          .values({ workspaceId: workspace.id, title: boardSeed.title, icon: boardSeed.icon })
          .returning();
        if (!board) throw new Error(`board oluşturulamadı: ${boardSeed.title}`);
        totalBoards++;

        await tx
          .insert(boardMembers)
          .values({ boardId: board.id, userId: ownerId, role: 'admin' });

        // Pano etiketleri — ad → id eşlemesi.
        const labelRows = await tx
          .insert(labels)
          .values(
            boardSeed.labels.map((l) => ({ boardId: board.id, name: l.name, color: l.color })),
          )
          .returning();
        const labelIdByName = new Map(labelRows.map((row) => [row.name, row.id]));

        // Listeler — board içinde fractional pozisyonlar.
        const listPositions = positionsBetween(null, null, boardSeed.lists.length);
        const listRows = await tx
          .insert(lists)
          .values(
            boardSeed.lists.map((listSeed, i) => ({
              boardId: board.id,
              title: listSeed.title,
              color: listSeed.color ?? null,
              icon: listSeed.icon ?? null,
              iconColor: listSeed.icon ? (listSeed.iconColor ?? null) : null,
              position: listPositions[i] ?? firstPosition(),
            })),
          )
          .returning();
        totalLists += listRows.length;

        for (let li = 0; li < boardSeed.lists.length; li++) {
          const listSeed = boardSeed.lists[li]!;
          const list = listRows[li]!;
          if (listSeed.cards.length === 0) continue;

          // Kartlar — liste içinde fractional pozisyonlar.
          const cardPositions = positionsBetween(null, null, listSeed.cards.length);
          const cardRows = await tx
            .insert(cards)
            .values(
              listSeed.cards.map((cardSeed, ci) => ({
                boardId: board.id,
                listId: list.id,
                title: cardSeed.title,
                description: cardSeed.description ?? null,
                position: cardPositions[ci] ?? firstPosition(),
                dueAt: cardSeed.dueInDays != null ? daysFromNow(cardSeed.dueInDays) : null,
                completed: cardSeed.completed ?? false,
                completedAt: cardSeed.completed ? now : null,
                completedBy: cardSeed.completed ? ownerId : null,
                coverColor: cardSeed.coverColor ?? null,
              })),
            )
            .returning();
          totalCards += cardRows.length;

          for (let ci = 0; ci < listSeed.cards.length; ci++) {
            const cardSeed = listSeed.cards[ci]!;
            const card = cardRows[ci]!;

            // Kart etiketleri.
            if (cardSeed.labels?.length) {
              const cardLabelValues = cardSeed.labels
                .map((name) => labelIdByName.get(name))
                .filter((id): id is string => Boolean(id))
                .map((labelId) => ({ cardId: card.id, labelId }));
              if (cardLabelValues.length > 0) {
                await tx.insert(cardLabels).values(cardLabelValues);
              }
            }

            // Kart üyeleri — sahibi sorumlu/izleyen olarak.
            if (cardSeed.assignee) {
              await tx
                .insert(cardMembers)
                .values({ cardId: card.id, userId: ownerId, role: 'assignee' });
            }
            if (cardSeed.watcher) {
              await tx
                .insert(cardMembers)
                .values({ cardId: card.id, userId: ownerId, role: 'watcher' });
            }

            // Yorumlar — createdAt offset'iyle sıralanır.
            if (cardSeed.comments?.length) {
              await tx.insert(comments).values(
                cardSeed.comments.map((c) => ({
                  cardId: card.id,
                  authorId: ownerId,
                  body: c.body,
                  createdAt: daysAgo(c.daysAgo),
                })),
              );
              totalComments += cardSeed.comments.length;
            }

            // Checklist'ler ve maddeleri.
            if (cardSeed.checklists?.length) {
              const clPositions = positionsBetween(null, null, cardSeed.checklists.length);
              for (let cli = 0; cli < cardSeed.checklists.length; cli++) {
                const clSeed = cardSeed.checklists[cli]!;
                const [checklist] = await tx
                  .insert(checklists)
                  .values({
                    cardId: card.id,
                    title: clSeed.title,
                    position: clPositions[cli] ?? firstPosition(),
                  })
                  .returning();
                if (!checklist) throw new Error('checklist oluşturulamadı');

                if (clSeed.items.length > 0) {
                  const itemPositions = positionsBetween(null, null, clSeed.items.length);
                  await tx.insert(checklistItems).values(
                    clSeed.items.map((item, ii) => ({
                      checklistId: checklist.id,
                      content: item.text,
                      position: itemPositions[ii] ?? firstPosition(),
                      completed: item.done ?? false,
                      completedAt: item.done ? now : null,
                      completedBy: item.done ? ownerId : null,
                    })),
                  );
                  totalChecklistItems += clSeed.items.length;
                }
              }
            }
          }
        }
      }
    });

    // 4) Arama indeksini doldur — production'da arama çalışsın diye.
    const search = await syncSearchDocumentsForScope(db, { workspaceId });

    console.warn(
      `[seed] "${WORKSPACE_NAME}" oluşturuldu — sahip: ${owner.name} <${OWNER_EMAIL}>\n` +
        `       ${totalBoards} pano, ${totalLists} liste, ${totalCards} kart, ` +
        `${totalComments} yorum, ${totalChecklistItems} checklist maddesi.\n` +
        `       Arama indeksi: ${search.upserted} belge yazıldı.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[seed] kaymakamlık seed başarısız:', err);
  process.exitCode = 1;
});
