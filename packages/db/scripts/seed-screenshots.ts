/**
 * App Store / mağaza ekran görüntüsü seed'i — "mağaza vitrini" demo verisi.
 *
 * iPhone + iPad mağaza görselleri için günlük hayatta inandırıcı, ekran
 * görüntüsünde paylaşılmasında sakınca olmayan bir demo ortam üretir:
 *
 *   - 1 ana kullanıcı (GİRİŞ YAPILABİLİR — Better Auth scrypt parolası).
 *     Bu hesapla uygulamaya girip ekran görüntülerini alırsın.
 *   - 5 ek üye (giriş yapamaz; yalnızca avatar+isim için) → bazı kartlara
 *     "sorumlu" / "izleyen" olarak atanır, üye avatarları görsellerde çıkar.
 *   - 2 çalışma alanı: "Ürün Ekibi" (iş, 5 üye dahil) + "Kişisel Alanım".
 *   - Her alanda 3 pano, her panoda 5 liste, her listede 4–8 rastgele kart.
 *   - Kart doluluğu az → çok → tam dolu arasında (deterministik rastgele).
 *   - Bazı kartlarda gerçek görsel kapak (MinIO'ya yüklenir), bazılarında
 *     renk kapağı.
 *   - "Ürün Ekibi → Ürün Yol Haritası → Backlog → 1. kart" = TAM DOLU
 *     (zengin açıklama, kapak, son tarih, etiketler, sorumlu+izleyen,
 *     checklist, yorumlar, ek). Kart detay ekran görüntüsü için bu açılır.
 *   - Ana kullanıcıya ~10 örnek bildirim (yeni bildirim yapısına uygun);
 *     en yeni bildirim en zengin olan `mention` — tablet bildirim merkezinde
 *     sağ panelde açık halini ekran görüntüsüne almak için.
 *
 * IDEMPOTENT: " urun-ekibi" çalışma alanı zaten varsa hiçbir şey yapmaz.
 * RESET:      `-- --reset` ile bu seed'in oluşturduğu 2 alanı + 6 kullanıcıyı
 *             silip baştan kurar (yalnızca seed verisi; başka veriye dokunmaz).
 *
 * ÇALIŞTIRMA (canlıda — DATABASE_URL + S3_* üretime bakmalı):
 *   pnpm --filter @pusula/db seed:screenshots
 *   pnpm --filter @pusula/db seed:screenshots -- --reset
 *
 * Tüm DB yazımları tek transaction içindedir. Görsel yüklemeleri (S3) idempotent
 * değildir ve transaction dışındadır; S3 erişilemezse kapaklar renk kapağına
 * düşer ve seed yine de tamamlanır.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { resolve } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config as loadDotenv } from 'dotenv';
import { eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { firstPosition, positionsBetween } from '@pusula/domain';
import { createDb } from '../src/client';
import {
  accounts,
  attachments,
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
  notifications,
  users,
  workspaceMembers,
  workspaces,
} from '../src/schema';
import { syncSearchDocumentsForScope } from '../src/search-indexer';

// .env'i yükle (S3_* değişkenleri için — createDb yalnızca DATABASE_URL'i okur).
loadDotenv({ path: resolve(import.meta.dirname, '../../..', '.env'), override: false });

const RESET = process.argv.includes('--reset');

// ---------------------------------------------------------------------------
// Kullanıcılar
// ---------------------------------------------------------------------------

const MAIN_EMAIL = 'elif.yilmaz@pusulaportal.com';
// Giriş kolaylığı için parola = e-posta (yalnızca demo/ekran görüntüsü hesabı).
const MAIN_PASSWORD = MAIN_EMAIL;
const MAIN_NAME = 'Elif Yılmaz';

interface Person {
  name: string;
  email: string;
}

/** Giriş yapamayan, yalnızca atama/avatar için 5 ek üye. */
const MEMBERS: Person[] = [
  { name: 'Mehmet Kaya', email: 'mehmet.kaya@pusulaportal.com' },
  { name: 'Zeynep Arslan', email: 'zeynep.arslan@pusulaportal.com' },
  { name: 'Can Öztürk', email: 'can.ozturk@pusulaportal.com' },
  { name: 'Selin Aydın', email: 'selin.aydin@pusulaportal.com' },
  { name: 'Burak Şahin', email: 'burak.sahin@pusulaportal.com' },
];

const ALL_EMAILS = [MAIN_EMAIL, ...MEMBERS.map((m) => m.email)];
const WORK_SLUG = 'urun-ekibi';
const PERSONAL_SLUG = 'kisisel-alanim';
const ALL_SLUGS = [WORK_SLUG, PERSONAL_SLUG];

/** Telifsiz, illüstrasyon tabanlı avatar (DiceBear) — users.image düz URL. */
const avatarUrl = (seed: string) =>
  `https://api.dicebear.com/9.x/notionists-neutral/png?seed=${encodeURIComponent(
    seed,
  )}&size=200&radius=50&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf,c1f0d0`;

/**
 * Better Auth'un varsayılan scrypt parola hash'iyle BİREBİR uyumlu hash üretir
 * (better-auth@1.6.x: `@better-auth/utils/password`). Harici bağımlılık olmadan
 * Node `crypto.scrypt` ile aynı parametreleri kullanır — böylece prod
 * container'ında ekstra paket kurmadan çalışır.
 *
 * Format: `<16 byte salt hex>:<64 byte key hex>`; salt scrypt'e hex STRING olarak
 * verilir (Better Auth ile aynı), config N=16384 r=16 p=1, dkLen=64.
 */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password.normalize('NFKC'), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2, // 128*N*r için yeterli bellek (~64MB)
  });
  return `${salt}:${key.toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Deterministik rastgelelik — her çalıştırmada aynı "rastgele" görünüm.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260621);
const rnd = () => rng();
const rndInt = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const chance = (p: number) => rnd() < p;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
function pickN<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

// ---------------------------------------------------------------------------
// Tiptap rich-text yardımcıları (cards.description / comments.body string kolonu)
// ---------------------------------------------------------------------------

/** Düz metni Tiptap doc JSON string'ine çevirir — her satır bir paragraf. */
function plainDoc(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return JSON.stringify({
    type: 'doc',
    content: lines.map((line) =>
      line.length > 0
        ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
        : { type: 'paragraph' },
    ),
  });
}

/** Tam-dolu kart için zengin açıklama (kalın başlıklar + paragraflar). */
const FULL_CARD_DESCRIPTION = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'Amaç: ' },
        {
          type: 'text',
          text: 'Yeni kullanıcıların ilk açılışta uygulamayı 60 saniyede kavramasını sağlayan, üç adımlık bir karşılama akışı tasarlamak.',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Mevcut akışta kullanıcıların %40’ı ilk panoyu oluşturmadan ayrılıyor. Yeni akış; hoş geldin, örnek pano ve bildirim izni adımlarından oluşacak. Animasyonlar yumuşak, atlanabilir ve erişilebilir olmalı.',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Kabul kriterleri' }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Akış 3 adımı geçmemeli, her adım atlanabilmeli ve son adımda kullanıcı doğrudan örnek panoya düşmeli. iPhone ve iPad’de tutarlı görünmeli.',
        },
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// İçerik havuzları
// ---------------------------------------------------------------------------

const WORK_DESCRIPTIONS = [
  'Bu iş kalemi haftalık önceliklendirme toplantısında detaylıca ele alınacak. İlk adım olarak bağımlılıkların netleştirilmesi ve tahmini iş yükünün çıkarılması gerekiyor.\n\nİlgili paydaşlarla kısa bir hizalanma görüşmesi yapılmalı; alınan kararlar ve açık sorular bu kartın yorumlarına eklenecek. Kapsam netleştikten sonra tasarım ve geliştirme birlikte ilerleyebilir.\n\nÖnemli not: Yayın öncesinde mutlaka QA kontrolünden geçmeli ve regresyon testleri çalıştırılmalı.',
  'Geçen sprintteki kullanıcı geri bildirimleri bu maddenin yeniden ele alınmasını gerektiriyor. Kullanıcıların büyük bölümü mevcut akışın karmaşık olduğunu belirtti, bu nedenle deneyimi sadeleştirmeye odaklanacağız.\n\nÖncelikle mevcut durumun analizini çıkaralım, ardından iki farklı çözüm önerisi hazırlayıp ekiple oylayalım. Seçilen yön için düşük çözünürlüklü bir prototip oluşturulacak.\n\nKabul kriteri: Yeni akış en fazla üç adımda tamamlanabilmeli ve mobilde de sorunsuz çalışmalı.',
  'Teknik araştırma (spike) gerektiren bir konu. Amacımız, mevcut altyapının bu özelliği taşıyıp taşıyamayacağını net olarak ortaya koymak ve olası riskleri erkenden tespit etmek.\n\nAraştırma sırasında performans, ölçeklenebilirlik ve bakım maliyeti açılarından değerlendirme yapılacak. Bulgular kısa bir teknik notla paylaşılacak.\n\nAraştırma tamamlanmadan kapsam kesinleştirilmeyecek; tahminler ona göre güncellenecek.',
  'Kullanıcıların sıkça talep ettiği bir iyileştirme. İlk bakışta küçük görünse de, ürün genelindeki tutarlılığı doğrudan etkilediği için dikkatli ilerlemek gerekiyor.\n\nTasarım ekibiyle birlikte mevcut bileşenleri gözden geçirip, değişikliğin diğer ekranlara etkisini haritalandıracağız. Erişilebilirlik açısından da kontrol edilmeli.\n\nGeliştirme tamamlandığında kısa bir demo kaydı hazırlanıp paydaşlarla paylaşılacak.',
  'Bu kart bir hata kaydının takibi içindir. Sorun, belirli koşullarda yeniden üretilebiliyor; adımlar yorumlarda belgelendi.\n\nÖncelikle kök neden analizi yapılmalı, ardından kalıcı bir çözüm önerisi sunulmalı. Geçici bir çözüm (workaround) uygulanacaksa bunun da ayrıca not edilmesi gerekiyor.\n\nDüzeltme yayına alınmadan önce ilgili senaryolar için otomatik test eklenmeli ki aynı hata tekrarlamasın.',
  'Sprint hedeflerinden biri olarak planlandı. Bu maddenin tamamlanması, sonraki birkaç iş kaleminin önünü açacağı için kritik öneme sahip.\n\nİşe başlamadan önce gereksinimlerin son halini paydaşlarla teyit edelim. Geliştirme sırasında ara çıktıların düzenli olarak paylaşılması, geri bildirim döngüsünü hızlandıracak.\n\nTamamlandığında dokümantasyon güncellenecek ve ekip içi kısa bir bilgilendirme yapılacak.',
];

const PERSONAL_DESCRIPTIONS = [
  'Bu işi hafta sonuna planladım, acele etmeye gerek yok. Önce gerekli malzemelerin listesini çıkarıp eksikleri tamamlamak en mantıklısı olacak.\n\nGeçen sefer biraz dağınık ilerlemiştim; bu kez adım adım gidip her aşamayı bitirdikçe işaretleyeceğim. Böylece nerede kaldığımı kolayca takip edebilirim.\n\nVakit kalırsa yan işleri de aynı gün halletmeye çalışırım.',
  'Uzun süredir ertelediğim bir konu, artık sırası geldi. Bütçeyi aşmamak için önce birkaç farklı seçeneği karşılaştırıp en uygununu seçmeyi planlıyorum.\n\nKararı verdikten sonra gerekli randevuları alıp takvime işleyeceğim. Aceleye getirmeden, planlı şekilde ilerlemek istiyorum.\n\nİlerledikçe notları buraya ekleyip küçük hatırlatmalar bırakacağım.',
  'Kendime koyduğum hedeflerden biri. Küçük ama düzenli adımlarla ilerlemenin uzun vadede en çok işe yarayan yöntem olduğunu fark ettim.\n\nHaftalık küçük hedefler belirleyip her birini tamamladıkça ilerlemeyi göreceğim. Motivasyonu korumak için ara ara kendimi ödüllendirmeyi de unutmamalıyım.\n\nİlk birkaç hafta zor olabilir ama alışkanlık oturduğunda gerisi kendiliğinden gelecek.',
  'Bu kartı, evle ilgili düzenlemeleri tek yerde toplamak için oluşturdum. Yapılacaklar göründüğünden fazla, o yüzden önceliklendirmek önemli.\n\nÖnce acil ve hızlı bitenleri halledip, zaman alan işleri hafta içine yayacağım. Gerekirse birkaç maddeyi bir sonraki haftaya bırakabilirim.\n\nHer şey bittiğinde ortamın çok daha ferah olacağını biliyorum, bu da motive edici.',
  'Seyahat öncesi hazırlıkların hepsini burada tutuyorum ki son anda bir şey unutmayayım. Belgeler, rezervasyonlar ve eşya listesi en kritik başlıklar.\n\nÖnce ulaşım ve konaklamayı kesinleştirip, ardından günlük programı taslak halinde çıkaracağım. Hava durumuna göre valiz içeriğini güncellemek gerekebilir.\n\nKüçük detayları (şarj aleti, fileler, ilaçlar) ayrı bir kontrol listesinde tutmak işimi kolaylaştırıyor.',
];

const COMMENT_TEXTS = [
  'İlerleme nasıl gidiyor?',
  'Bunu bu hafta bitirebilir miyiz?',
  'Harika iş, eline sağlık!',
  'Birkaç küçük düzeltme kaldı sadece.',
  'Onaylıyorum, devam edebiliriz.',
  'Detayları kısaca konuşalım mı?',
  'Notları ekledim, bir bakar mısın?',
];

const CHECKLIST_TITLES = ['Adımlar', 'Yapılacaklar', 'Kontrol Listesi', 'Hazırlık'];
const CHECKLIST_ITEMS = [
  'Taslağı hazırla',
  'Ekip onayını al',
  'İlk versiyonu tamamla',
  'Geri bildirimleri uygula',
  'Son kontrolü yap',
  'Yayına al',
  'Dokümantasyonu güncelle',
  'Hızlı bir test geç',
];

const COVER_COLORS = [
  'kirmizi',
  'turuncu',
  'sari',
  'lime',
  'yesil',
  'sky',
  'mavi',
  'indigo',
  'mor',
  'pembe',
] as const;

// ---------------------------------------------------------------------------
// Pano içerikleri
// ---------------------------------------------------------------------------

interface SeedListDef {
  title: string;
  color?: string;
  icon?: string;
  iconColor?: string;
  /** Walker bu havuzdan 4–8 kart seçer. */
  cardPool: string[];
  /** Bu listedeki kartlar tamamlanmış sayılsın (son/arşiv listeleri). */
  done?: boolean;
}

interface SeedBoardDef {
  title: string;
  icon: string;
  labels: { name: string; color: string }[];
  lists: SeedListDef[];
}

interface SeedWorkspaceDef {
  name: string;
  slug: string;
  icon: string;
  isWork: boolean;
  boards: SeedBoardDef[];
}

const TODO_LIST = { color: 'mavi', icon: 'list-todo', iconColor: 'mavi' };
const WEEK_LIST = { color: 'sari', icon: 'calendar', iconColor: 'turuncu' };
const WAIT_LIST = { color: 'turuncu', icon: 'hourglass', iconColor: 'kirmizi' };
const DOING_LIST = { color: 'mor', icon: 'timer', iconColor: 'mor' };
const DONE_LIST = { color: 'yesil', icon: 'circle-check', iconColor: 'yesil' };

const WORKSPACES: SeedWorkspaceDef[] = [
  {
    name: 'Ürün Ekibi',
    slug: WORK_SLUG,
    icon: 'rocket',
    isWork: true,
    boards: [
      {
        title: 'Ürün Yol Haritası',
        icon: 'rocket',
        labels: [
          { name: 'Frontend', color: 'blue' },
          { name: 'Backend', color: 'green' },
          { name: 'Tasarım', color: 'purple' },
          { name: 'Hata', color: 'red' },
          { name: 'Yüksek Öncelik', color: 'orange' },
          { name: 'Araştırma', color: 'sky' },
        ],
        lists: [
          {
            title: 'Backlog',
            ...TODO_LIST,
            cardPool: [
              'Onboarding akışını baştan tasarla',
              'Karanlık tema desteği',
              'Çevrimdışı mod altyapısı',
              'Kart şablonları',
              'Takvim görünümü',
              'Klavye kısayolları',
              'Widget desteği',
              'Gelişmiş arama filtreleri',
              'Etiket renk paleti genişletme',
              'Kart bağımlılıkları',
            ],
          },
          {
            title: 'Sprint',
            ...WEEK_LIST,
            cardPool: [
              'Push bildirim ayarları ekranı',
              'Bildirim merkezi yeniden düzenleme',
              'Sürükle-bırak performansı',
              'Kart kapak görseli yükleme',
              'Yorumlarda bahsetme (@mention)',
              'Liste arşivleme akışı',
              'Profil ekranı yenileme',
              'Çoklu seçim ile toplu işlem',
            ],
          },
          {
            title: 'Geliştirmede',
            ...DOING_LIST,
            cardPool: [
              'Realtime senkronizasyon kararlılığı',
              'Optimistic UI geri alma senaryoları',
              'Görsel önbellekleme',
              'API hız sınırlama',
              'Erişilebilirlik denetimi',
              'Tablet master-detail düzeni',
            ],
          },
          {
            title: 'İncelemede',
            ...WAIT_LIST,
            cardPool: [
              'Kod gözden geçirme: bildirim worker',
              'Tasarım gözden geçirme: kart detayı',
              'QA: sürükle-bırak regresyon',
              'Güvenlik incelemesi: dosya yükleme',
              'Performans testi: büyük panolar',
            ],
          },
          {
            title: 'Yayında',
            ...DONE_LIST,
            done: true,
            cardPool: [
              'Kart detayında zengin metin',
              'Pano arka plan temaları',
              'Hızlı not özelliği',
              'Bildirim derin bağlantıları',
              'Çoklu cihaz oturum yönetimi',
              'Arama altyapısı (tsvector)',
            ],
          },
        ],
      },
      {
        title: 'Pazarlama & Lansman',
        icon: 'megaphone',
        labels: [
          { name: 'Sosyal Medya', color: 'sky' },
          { name: 'E-posta', color: 'blue' },
          { name: 'Tasarım', color: 'purple' },
          { name: 'Acil', color: 'red' },
          { name: 'Reklam', color: 'orange' },
          { name: 'İçerik', color: 'green' },
        ],
        lists: [
          {
            title: 'Fikirler',
            ...TODO_LIST,
            cardPool: [
              'Yıl sonu kullanım özeti kampanyası',
              'Kullanıcı referansları topla',
              'Karşılaştırma sayfası (rakipler)',
              'Ürün avı (Product Hunt) lansmanı',
              'Topluluk yarışması',
              'Affiliate programı',
              'Yeni özellik teaser serisi',
            ],
          },
          {
            title: 'Planlanan',
            ...WEEK_LIST,
            cardPool: [
              'Lansman duyuru e-postası',
              'Sosyal medya içerik takvimi',
              'Webinar planı',
              'Basın bülteni taslağı',
              'Influencer iş birliği listesi',
              'Reklam bütçesi dağılımı',
            ],
          },
          {
            title: 'Üretimde',
            ...DOING_LIST,
            cardPool: [
              'App Store görsellerini güncelle',
              'Tanıtım videosu çekimi',
              'Landing page yeniden tasarımı',
              'Reklam görselleri seti',
              'Demo GIF’leri hazırla',
            ],
          },
          {
            title: 'Onayda',
            ...WAIT_LIST,
            cardPool: [
              'E-posta metni son okuma',
              'Marka tutarlılığı kontrolü',
              'Yasal metin gözden geçirme',
              'Görsel onayı (ekip)',
            ],
          },
          {
            title: 'Yayınlandı',
            ...DONE_LIST,
            done: true,
            cardPool: [
              'Eylül bülteni gönderildi',
              'Instagram tanıtım serisi yayınlandı',
              'Blog: sürüm notları yayında',
              'SEO başlık optimizasyonu',
              'LinkedIn duyurusu',
            ],
          },
        ],
      },
      {
        title: 'İçerik Takvimi',
        icon: 'calendar',
        labels: [
          { name: 'Blog', color: 'blue' },
          { name: 'Sosyal', color: 'sky' },
          { name: 'Video', color: 'red' },
          { name: 'Tasarım', color: 'purple' },
          { name: 'Bülten', color: 'green' },
          { name: 'SEO', color: 'orange' },
        ],
        lists: [
          {
            title: 'Fikirler',
            ...TODO_LIST,
            cardPool: [
              'Uzaktan ekipler için ipuçları',
              'Kanban vs liste: hangisi?',
              'Müşteri başarı hikayesi',
              'Sektör trendleri derlemesi',
              'Verimlilik mitleri',
              'Yeni başlayanlar için rehber',
              'Şablon galerisi tanıtımı',
            ],
          },
          {
            title: 'Taslak',
            ...WEEK_LIST,
            cardPool: [
              'Haftalık ürün ipuçları yazısı',
              'Nasıl yapılır: ilk panonu kur',
              'Özellik tanıtım yazısı: bildirimler',
              'Aylık bülten metni',
              'Podcast bölüm taslağı',
            ],
          },
          {
            title: 'Düzenlemede',
            ...DOING_LIST,
            cardPool: [
              'Infografik: zaman yönetimi',
              'Video senaryosu: 60 saniyede başla',
              'SSS sayfası güncellemesi',
              'Görsel kapak tasarımı',
            ],
          },
          {
            title: 'Zamanlanmış',
            ...WAIT_LIST,
            cardPool: [
              'Pazartesi: LinkedIn makalesi',
              'Çarşamba: Instagram reels',
              'Cuma: blog yazısı',
              'Ayın 1’i: bülten',
            ],
          },
          {
            title: 'Yayında',
            ...DONE_LIST,
            done: true,
            cardPool: [
              'Başlangıç rehberi yayınlandı',
              'Verimlilik mitleri yazısı',
              'Müşteri hikayesi: tasarım stüdyosu',
              'Reels: 3 ipucu',
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Kişisel Alanım',
    slug: PERSONAL_SLUG,
    icon: 'user',
    isWork: false,
    boards: [
      {
        title: 'Ev & Düzen',
        icon: 'home',
        labels: [
          { name: 'Temizlik', color: 'blue' },
          { name: 'Tamir', color: 'orange' },
          { name: 'Alışveriş', color: 'green' },
          { name: 'Acil', color: 'red' },
          { name: 'Rutin', color: 'purple' },
          { name: 'Beklemede', color: 'black' },
        ],
        lists: [
          {
            title: 'Yapılacaklar',
            ...TODO_LIST,
            cardPool: [
              'Mutfak dolaplarını düzenle',
              'Ampul değiştir — koridor',
              'Buzdolabı iç temizliği',
              'Kışlık kıyafetleri kaldır',
              'Kitaplığı yeniden düzenle',
              'Banyo derz temizliği',
              'Çekmeceleri ayıkla',
              'Balkon düzenleme',
            ],
          },
          {
            title: 'Bu Hafta',
            ...WEEK_LIST,
            cardPool: [
              'Market alışverişi listesi',
              'Faturaları öde',
              'Perde yıkama',
              'Çamaşır makinesi bakımı',
              'Çiçekleri sula ve gübrele',
            ],
          },
          {
            title: 'Bekliyor',
            ...WAIT_LIST,
            cardPool: [
              'Klima bakımı için randevu',
              'Yedek anahtar yaptır',
              'Halı yıkamaya ver',
              'Kombi kontrolü',
            ],
          },
          {
            title: 'Devam Eden',
            ...DOING_LIST,
            cardPool: [
              'Oturma odası düzenlemesi',
              'Dolap içi kutu sistemi',
              'Eski eşyaları bağışla',
            ],
          },
          {
            title: 'Tamamlandı',
            ...DONE_LIST,
            done: true,
            cardPool: [
              'Garaj toplandı',
              'Lamba değiştirildi',
              'Mevsimlik geçiş yapıldı',
              'Çöp ve geri dönüşüm ayrıldı',
            ],
          },
        ],
      },
      {
        title: 'Seyahat Planı',
        icon: 'plane',
        labels: [
          { name: 'Ulaşım', color: 'sky' },
          { name: 'Konaklama', color: 'blue' },
          { name: 'Aktivite', color: 'green' },
          { name: 'Belge', color: 'red' },
          { name: 'Bütçe', color: 'orange' },
          { name: 'Hazırlık', color: 'purple' },
        ],
        lists: [
          {
            title: 'Fikirler',
            ...TODO_LIST,
            cardPool: [
              'Kapadokya balon turu',
              'Karadeniz yayla rotası',
              'Ege’de tekne turu',
              'Şehir içi müze günü',
              'Doğa yürüyüşü kampı',
              'Sahil kasabası kaçamağı',
            ],
          },
          {
            title: 'Planlama',
            ...WEEK_LIST,
            cardPool: [
              'Uçak bileti araştır',
              'Gezilecek yerler listesi',
              'Restoran önerileri topla',
              'Günlük program taslağı',
              'Hava durumu kontrolü',
            ],
          },
          {
            title: 'Rezervasyonlar',
            ...WAIT_LIST,
            cardPool: [
              'Otel rezervasyonu',
              'Araç kiralama',
              'Tur rezervasyonu',
              'Seyahat sigortası',
            ],
          },
          {
            title: 'Hazırlık',
            ...DOING_LIST,
            cardPool: [
              'Valiz listesi hazırla',
              'Pasaport/kimlik kontrol',
              'Telefon ve şarj aletleri',
              'Döviz bozdur',
            ],
          },
          {
            title: 'Anılar',
            ...DONE_LIST,
            done: true,
            cardPool: [
              'Fotoğrafları ayıkla',
              'Geçen yılki tatil albümü',
              'Hediyelikler dağıtıldı',
            ],
          },
        ],
      },
      {
        title: 'Hedeflerim',
        icon: 'target',
        labels: [
          { name: 'Sağlık', color: 'green' },
          { name: 'Kariyer', color: 'blue' },
          { name: 'Finans', color: 'orange' },
          { name: 'Öğrenme', color: 'purple' },
          { name: 'Kişisel', color: 'pink' },
          { name: 'Acil', color: 'red' },
        ],
        lists: [
          {
            title: 'Bu Yıl',
            ...TODO_LIST,
            cardPool: [
              'İngilizce B2 sertifikası',
              'Yılda 24 kitap oku',
              'Acil durum fonu oluştur',
              'Yarı maraton koşusu',
              'Yeni bir beceri öğren',
            ],
          },
          {
            title: 'Çeyreklik',
            ...WEEK_LIST,
            cardPool: [
              'Online kurs tamamla',
              'Bütçe gözden geçirme',
              'Portföy/CV güncelle',
              'Networking etkinliğine katıl',
            ],
          },
          {
            title: 'Aylık',
            ...WAIT_LIST,
            cardPool: [
              'Ayda 2 kitap',
              'Aylık tasarruf hedefi',
              'Bir tarif dene',
              'Doğa yürüyüşü',
            ],
          },
          {
            title: 'Devam Eden',
            ...DOING_LIST,
            cardPool: [
              'Haftada 3 gün spor',
              'Günlük 2L su',
              'Meditasyon rutini',
              'Erken kalkma alışkanlığı',
            ],
          },
          {
            title: 'Başarıldı',
            ...DONE_LIST,
            done: true,
            cardPool: [
              'Sabah rutini oturdu',
              'İlk 5K tamamlandı',
              'Bütçe takibi başladı',
              'Şeker tüketimi azaldı',
            ],
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// S3 / MinIO — kapak görselleri
// ---------------------------------------------------------------------------

const S3_BUCKET = process.env.S3_BUCKET ?? 'pusula';

function makeS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'pusula',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'pusula-secret',
    },
  });
}

interface CoverImage {
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
}

/**
 * Birkaç gerçek görseli MinIO'ya yükler ve havuz döndürür. Anahtarlar karttan
 * bağımsızdır (`screenshots/covers/...`) — card.get presigned GET yalnızca
 * storageKey kullanır. S3 erişilemezse boş havuz döner; walker renk kapağına düşer.
 */
async function uploadCoverPool(count: number): Promise<CoverImage[]> {
  const pool: CoverImage[] = [];
  let s3: S3Client;
  try {
    s3 = makeS3Client();
  } catch (err) {
    console.warn('[seed] S3 istemcisi kurulamadı, kapaklar renk olacak:', err);
    return pool;
  }

  for (let i = 0; i < count; i++) {
    const url = `https://picsum.photos/seed/pusula-cover-${i + 1}/1000/560`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = new Uint8Array(await res.arrayBuffer());
      const fileName = `kapak-${i + 1}.jpg`;
      const storageKey = `screenshots/covers/${nanoid()}-${fileName}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: storageKey,
          Body: body,
          ContentType: 'image/jpeg',
          ContentLength: body.byteLength,
        }),
      );
      pool.push({ storageKey, fileName, mimeType: 'image/jpeg', size: body.byteLength });
    } catch (err) {
      console.warn(`[seed] kapak görseli yüklenemedi (${url}):`, err);
    }
  }
  if (pool.length > 0) {
    console.warn(`[seed] ${pool.length}/${count} kapak görseli MinIO'ya yüklendi.`);
  } else {
    console.warn('[seed] hiç kapak görseli yüklenemedi — yalnızca renk kapağı kullanılacak.');
  }
  return pool;
}

// ---------------------------------------------------------------------------
// Walker
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

type Tx = Parameters<Parameters<ReturnType<typeof createDb>['db']['transaction']>[0]>[0];

/** users + (opsiyonel) credential accounts satırını idempotent oluşturur. */
async function ensureUser(
  tx: Tx,
  person: Person & { name: string },
  opts: { password?: string } = {},
): Promise<string> {
  const [existing] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, person.email))
    .limit(1);

  let userId = existing?.id;
  if (!userId) {
    userId = nanoid();
    await tx.insert(users).values({
      id: userId,
      name: person.name,
      email: person.email,
      emailVerified: true,
      image: avatarUrl(person.name),
    });
  }

  if (opts.password) {
    const [acct] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .limit(1);
    if (!acct) {
      const passwordHash = hashPassword(opts.password);
      await tx.insert(accounts).values({
        id: nanoid(),
        accountId: userId, // Better Auth: credential hesabında accountId === userId
        providerId: 'credential',
        userId,
        password: passwordHash,
      });
    }
  }
  return userId;
}

interface BuiltCard {
  id: string;
  title: string;
  boardTitle: string;
  workspaceId: string;
  boardId: string;
}

async function main() {
  const { db, pool } = createDb();
  const now = new Date();
  const daysFromNow = (n: number) => new Date(now.getTime() + n * DAY_MS);
  const daysAgo = (n: number) => new Date(now.getTime() - n * DAY_MS);
  const hoursAgo = (n: number) => new Date(now.getTime() - n * HOUR_MS);

  try {
    // 0) RESET — yalnızca bu seed'in oluşturduğu alanları + kullanıcıları siler.
    if (RESET) {
      await db.delete(workspaces).where(inArray(workspaces.slug, ALL_SLUGS));
      await db.delete(users).where(inArray(users.email, ALL_EMAILS));
      console.warn('[seed] --reset: önceki ekran görüntüsü verisi temizlendi.');
    }

    // 1) Idempotency — iş çalışma alanı zaten varsa çık.
    const [existing] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, WORK_SLUG))
      .limit(1);
    if (existing) {
      console.warn(
        `[seed] "${WORK_SLUG}" zaten var — yapılacak bir şey yok. Yeniden kurmak için: ` +
          `pnpm --filter @pusula/db seed:screenshots -- --reset`,
      );
      return;
    }

    // 2) Kapak görsellerini transaction ÖNCESİ yükle (S3 rollback'e katılmaz).
    const coverPool = await uploadCoverPool(12);
    let coverCursor = 0;
    const nextCover = (): CoverImage | null =>
      coverPool.length === 0 ? null : coverPool[coverCursor++ % coverPool.length]!;

    // Sayaçlar + sonradan bildirim üretmek için referanslar.
    const stats = { boards: 0, lists: 0, cards: 0, comments: 0, checklistItems: 0, covers: 0 };
    const workCards: BuiltCard[] = [];
    let fullCardId = '';
    let workWorkspaceId = '';
    let personalWorkspaceId = '';
    let ownerId = '';
    const memberIds: string[] = [];

    await db.transaction(async (tx) => {
      // 2a) Ana kullanıcı (giriş yapabilir) + 5 üye.
      ownerId = await ensureUser(tx, { name: MAIN_NAME, email: MAIN_EMAIL }, { password: MAIN_PASSWORD });
      for (const m of MEMBERS) {
        memberIds.push(await ensureUser(tx, m));
      }

      for (const wsDef of WORKSPACES) {
        const [workspace] = await tx
          .insert(workspaces)
          .values({ name: wsDef.name, slug: wsDef.slug, icon: wsDef.icon, ownerId })
          .returning();
        if (!workspace) throw new Error(`workspace oluşturulamadı: ${wsDef.name}`);
        if (wsDef.isWork) workWorkspaceId = workspace.id;
        else personalWorkspaceId = workspace.id;

        // Çalışma alanı üyeleri.
        await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: ownerId, role: 'owner' });
        if (wsDef.isWork) {
          await tx.insert(workspaceMembers).values(
            memberIds.map((userId, i) => ({
              workspaceId: workspace.id,
              userId,
              role: (i === 0 ? 'admin' : 'member') as 'admin' | 'member',
            })),
          );
        }
        // İş alanında karta atanabilecek kişi havuzu (owner + üyeler).
        const assignablePool = wsDef.isWork ? [ownerId, ...memberIds] : [ownerId];

        for (const boardDef of wsDef.boards) {
          const [board] = await tx
            .insert(boards)
            .values({ workspaceId: workspace.id, title: boardDef.title, icon: boardDef.icon })
            .returning();
          if (!board) throw new Error(`board oluşturulamadı: ${boardDef.title}`);
          stats.boards++;

          await tx.insert(boardMembers).values({ boardId: board.id, userId: ownerId, role: 'admin' });
          if (wsDef.isWork) {
            await tx.insert(boardMembers).values(
              memberIds.map((userId) => ({ boardId: board.id, userId, role: 'member' as const })),
            );
          }

          // Etiketler.
          const labelRows = await tx
            .insert(labels)
            .values(boardDef.labels.map((l) => ({ boardId: board.id, name: l.name, color: l.color })))
            .returning();
          const labelIds = labelRows.map((r) => r.id);

          // Listeler.
          const listPositions = positionsBetween(null, null, boardDef.lists.length);
          const listRows = await tx
            .insert(lists)
            .values(
              boardDef.lists.map((listDef, i) => ({
                boardId: board.id,
                title: listDef.title,
                color: listDef.color ?? null,
                icon: listDef.icon ?? null,
                iconColor: listDef.icon ? (listDef.iconColor ?? null) : null,
                position: listPositions[i] ?? firstPosition(),
              })),
            )
            .returning();
          stats.lists += listRows.length;

          for (let li = 0; li < boardDef.lists.length; li++) {
            const listDef = boardDef.lists[li]!;
            const list = listRows[li]!;

            // Bu listede kaç kart? (4–8, havuz sınırlı)
            const cardCount = Math.min(rndInt(4, 8), listDef.cardPool.length);
            let titles = pickN(listDef.cardPool, cardCount);
            if (titles.length === 0) continue;

            // Tam-dolu kart: iş alanı → Ürün Yol Haritası → Backlog → 1. kart.
            // Başlığı zengin açıklamayla tutarlı olsun diye sabitle.
            const isFullCardList =
              wsDef.isWork && boardDef.title === 'Ürün Yol Haritası' && listDef.title === 'Backlog';
            if (isFullCardList) {
              const FULL_TITLE = 'Onboarding akışını baştan tasarla';
              titles = [FULL_TITLE, ...titles.filter((t) => t !== FULL_TITLE)].slice(0, cardCount);
            }

            const cardPositions = positionsBetween(null, null, titles.length);
            const descPool = wsDef.isWork ? WORK_DESCRIPTIONS : PERSONAL_DESCRIPTIONS;

            for (let ci = 0; ci < titles.length; ci++) {
              const title = titles[ci]!;
              const isFullCard = isFullCardList && ci === 0;

              // Doluluk seviyesi.
              const roll = rnd();
              const level: 'full' | 'high' | 'mid' | 'low' = isFullCard
                ? 'full'
                : roll < 0.4
                  ? 'low'
                  : roll < 0.75
                    ? 'mid'
                    : 'high';

              // Kapak: tam kart kesin görsel; high kartların yarısı görsel/renk.
              let coverColor: string | null = null;
              let coverImage: CoverImage | null = null;
              if (isFullCard) {
                coverImage = nextCover();
                if (!coverImage) coverColor = pick(COVER_COLORS);
              } else if (level === 'high') {
                if (coverPool.length > 0 && chance(0.5)) coverImage = nextCover();
                else if (chance(0.5)) coverColor = pick(COVER_COLORS);
              } else if (level === 'mid' && chance(0.2)) {
                coverColor = pick(COVER_COLORS);
              }

              const description =
                level === 'full'
                  ? FULL_CARD_DESCRIPTION
                  : level === 'low'
                    ? null
                    : plainDoc(pick(descPool));

              const completed = listDef.done === true;
              const dueInDays = isFullCard ? 5 : level === 'low' ? null : chance(0.5) ? rndInt(-2, 10) : null;

              const [card] = await tx
                .insert(cards)
                .values({
                  boardId: board.id,
                  listId: list.id,
                  title,
                  description,
                  position: cardPositions[ci] ?? firstPosition(),
                  dueAt: completed ? null : dueInDays != null ? daysFromNow(dueInDays) : null,
                  completed,
                  completedAt: completed ? daysAgo(rndInt(1, 14)) : null,
                  completedBy: completed ? ownerId : null,
                  coverColor,
                })
                .returning();
              if (!card) throw new Error(`kart oluşturulamadı: ${title}`);
              stats.cards++;

              // Kapak görseli → attachment + coverImageAttachmentId.
              if (coverImage) {
                const [att] = await tx
                  .insert(attachments)
                  .values({
                    cardId: card.id,
                    boardId: board.id,
                    uploaderId: ownerId,
                    storageKey: coverImage.storageKey,
                    fileName: coverImage.fileName,
                    mimeType: coverImage.mimeType,
                    size: coverImage.size,
                    committedAt: now, // taslak değil — doğrudan kalıcı
                  })
                  .returning({ id: attachments.id });
                if (att) {
                  await tx.update(cards).set({ coverImageAttachmentId: att.id }).where(eq(cards.id, card.id));
                  stats.covers++;
                }
              }

              // Etiketler.
              const labelCount = isFullCard ? 2 : level === 'low' ? (chance(0.3) ? 1 : 0) : rndInt(1, 2);
              if (labelCount > 0 && labelIds.length > 0) {
                const chosen = pickN(labelIds, labelCount);
                await tx
                  .insert(cardLabels)
                  .values(chosen.map((labelId) => ({ cardId: card.id, labelId })));
              }

              // Üyeler (sorumlu / izleyen).
              const memberRows: { cardId: string; userId: string; role: 'assignee' | 'watcher' }[] = [];
              if (isFullCard) {
                memberRows.push({ cardId: card.id, userId: ownerId, role: 'assignee' });
                if (memberIds[2]) memberRows.push({ cardId: card.id, userId: memberIds[2], role: 'assignee' });
                if (memberIds[1]) memberRows.push({ cardId: card.id, userId: memberIds[1], role: 'watcher' });
              } else if (level !== 'low' && chance(0.6)) {
                const assignee = pick(assignablePool);
                memberRows.push({ cardId: card.id, userId: assignee, role: 'assignee' });
                if (wsDef.isWork && chance(0.4)) {
                  const watcher = pick(assignablePool.filter((id) => id !== assignee));
                  if (watcher) memberRows.push({ cardId: card.id, userId: watcher, role: 'watcher' });
                }
              }
              if (memberRows.length > 0) await tx.insert(cardMembers).values(memberRows);

              // Checklist.
              const wantChecklist = isFullCard || (level === 'high' && chance(0.7));
              if (wantChecklist) {
                const [checklist] = await tx
                  .insert(checklists)
                  .values({ cardId: card.id, title: pick(CHECKLIST_TITLES), position: firstPosition() })
                  .returning();
                if (checklist) {
                  const itemCount = isFullCard ? 5 : rndInt(3, 5);
                  const items = pickN(CHECKLIST_ITEMS, itemCount);
                  const itemPositions = positionsBetween(null, null, items.length);
                  await tx.insert(checklistItems).values(
                    items.map((content, ii) => {
                      const itemDone = isFullCard ? ii < 2 : chance(0.4);
                      return {
                        checklistId: checklist.id,
                        content,
                        position: itemPositions[ii] ?? firstPosition(),
                        completed: itemDone,
                        completedAt: itemDone ? daysAgo(rndInt(1, 5)) : null,
                        completedBy: itemDone ? ownerId : null,
                      };
                    }),
                  );
                  stats.checklistItems += items.length;
                }
              }

              // Yorumlar.
              const commentCount = isFullCard ? 3 : level === 'high' && chance(0.6) ? rndInt(1, 2) : 0;
              if (commentCount > 0) {
                const authorPool = wsDef.isWork ? [ownerId, ...memberIds] : [ownerId];
                const texts = pickN(COMMENT_TEXTS, commentCount);
                await tx.insert(comments).values(
                  texts.map((text, ii) => ({
                    cardId: card.id,
                    authorId: pick(authorPool),
                    body: plainDoc(text),
                    createdAt: daysAgo(commentCount - ii),
                  })),
                );
                stats.comments += commentCount;
              }

              if (isFullCard) fullCardId = card.id;
              if (wsDef.isWork) {
                workCards.push({
                  id: card.id,
                  title,
                  boardTitle: boardDef.title,
                  workspaceId: workspace.id,
                  boardId: board.id,
                });
              }
            }
          }
        }
      }

      // 3) Örnek bildirimler — ana kullanıcıya. En yeni `mention` en zengin.
      await seedNotifications(tx, {
        ownerId,
        memberIds,
        workspaceId: workWorkspaceId,
        workspaceName: 'Ürün Ekibi',
        workCards,
        fullCardId,
        now,
        daysAgo,
        hoursAgo,
      });
    });

    // 4) Arama indeksini doldur.
    let searchDocs = 0;
    if (workWorkspaceId) searchDocs += (await syncSearchDocumentsForScope(db, { workspaceId: workWorkspaceId })).upserted;
    if (personalWorkspaceId)
      searchDocs += (await syncSearchDocumentsForScope(db, { workspaceId: personalWorkspaceId })).upserted;

    console.warn(
      `[seed] Ekran görüntüsü verisi hazır.\n` +
        `       Giriş: ${MAIN_EMAIL} / ${MAIN_PASSWORD}\n` +
        `       2 çalışma alanı, ${stats.boards} pano, ${stats.lists} liste, ${stats.cards} kart, ` +
        `${stats.covers} görsel kapak, ${stats.comments} yorum, ${stats.checklistItems} checklist maddesi.\n` +
        `       5 ek üye karta atandı. Arama indeksi: ${searchDocs} belge.`,
    );
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Bildirimler
// ---------------------------------------------------------------------------

interface NotifCtx {
  ownerId: string;
  memberIds: string[];
  workspaceId: string;
  workspaceName: string;
  workCards: BuiltCard[];
  fullCardId: string;
  now: Date;
  daysAgo: (n: number) => Date;
  hoursAgo: (n: number) => Date;
}

async function seedNotifications(tx: Tx, ctx: NotifCtx): Promise<void> {
  const { ownerId, memberIds, workspaceId, workspaceName, workCards, fullCardId } = ctx;
  if (workCards.length === 0) return;

  const memberName = (i: number) => MEMBERS[i]?.name ?? 'Ekip Üyesi';
  const memberAvatar = (i: number) => avatarUrl(memberName(i));
  // Bildirimde referans verilecek kartlar.
  const fullCard = workCards.find((c) => c.id === fullCardId) ?? workCards[0]!;
  const pickCard = (offset: number) => workCards[(offset * 3) % workCards.length]!;

  const base = (i: number, card: BuiltCard) => ({
    actorUserId: memberIds[i]!,
    actorName: memberName(i),
    actorImage: memberAvatar(i),
    workspaceId,
    workspaceName,
    boardId: card.boardId,
    boardName: card.boardTitle,
    cardId: card.id,
    cardTitle: card.title,
  });

  type Row = typeof notifications.$inferInsert;
  const rows: Row[] = [];

  // 1) card_assigned (okundu, 3 gün önce)
  {
    const card = fullCard;
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[1]!,
      type: 'card_assigned',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'card.member_added',
        notificationType: 'card_assigned',
        ...base(1, card),
      },
      readAt: ctx.daysAgo(2),
      createdAt: ctx.daysAgo(3),
    });
  }
  // 2) card_moved (okundu, 2 gün önce)
  {
    const card = pickCard(1);
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[0]!,
      type: 'card_moved',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'card.moved',
        notificationType: 'card_moved',
        ...base(0, card),
        fromListTitle: 'Backlog',
        toListTitle: 'Sprint',
      },
      readAt: ctx.daysAgo(2),
      createdAt: ctx.daysAgo(2),
    });
  }
  // 3) comment_reply (okundu, 2 gün önce)
  {
    const card = pickCard(2);
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[2]!,
      type: 'comment_reply',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'comment.created',
        notificationType: 'comment_reply',
        ...base(2, card),
        commentId: nanoid(),
        commentPreview: 'Bence bu yaklaşım daha sade olur, deneyelim mi?',
      },
      readAt: ctx.daysAgo(1),
      createdAt: ctx.daysAgo(2),
    });
  }
  // 4) due_overdue (SİSTEM — aktör yok, okunmadı, 1 gün önce)
  {
    const card = pickCard(3);
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: null,
      type: 'due_overdue',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'due_overdue',
        notificationType: 'due_overdue',
        workspaceId,
        workspaceName,
        boardId: card.boardId,
        boardName: card.boardTitle,
        cardId: card.id,
        cardTitle: card.title,
        dueAt: ctx.daysAgo(1).toISOString(),
      },
      readAt: null,
      createdAt: ctx.daysAgo(1),
    });
  }
  // 5) card_completed (okunmadı, 22 saat önce)
  {
    const card = pickCard(4);
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[3]!,
      type: 'card_completed',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'card.completed',
        notificationType: 'card_completed',
        ...base(3, card),
      },
      readAt: null,
      createdAt: ctx.hoursAgo(22),
    });
  }
  // 6) checklist_item_completed (okunmadı, 12 saat önce)
  {
    const card = fullCard;
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[4]!,
      type: 'checklist_item_completed',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'checklist.item_checked',
        notificationType: 'checklist_item_completed',
        ...base(4, card),
        checklistId: nanoid(),
        checklistItemId: nanoid(),
        content: 'İlk versiyonu tamamla',
      },
      readAt: null,
      createdAt: ctx.hoursAgo(12),
    });
  }
  // 6a) card_description_changed — kart açıklaması güncellendi (okunmadı, 11 saat önce)
  {
    const card = fullCard;
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[2]!,
      type: 'card_description_changed',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'card.description_changed',
        notificationType: 'card_description_changed',
        ...base(2, card),
        fromDescription: 'Onboarding akışını gözden geçir.',
        toDescription: 'Onboarding akışını baştan tasarla; üç adımlık karşılama ekle.',
      },
      readAt: null,
      createdAt: ctx.hoursAgo(11),
    });
  }
  // 6b) checklist_item_added — yapılacaklar listesine madde eklendi (okunmadı, 10 saat önce)
  {
    const card = fullCard;
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[0]!,
      type: 'checklist_item_added',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'checklist.item_added',
        notificationType: 'checklist_item_added',
        ...base(0, card),
        checklistId: nanoid(),
        checklistItemId: nanoid(),
        content: 'Erişilebilirlik kontrolünü ekle',
      },
      readAt: null,
      createdAt: ctx.hoursAgo(10),
    });
  }
  // 7) card_label_added (okunmadı, 8 saat önce)
  {
    const card = pickCard(5);
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[0]!,
      type: 'card_label_added',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'card.label_added',
        notificationType: 'card_label_added',
        ...base(0, card),
        labelId: nanoid(),
        labelName: 'Yüksek Öncelik',
      },
      readAt: null,
      createdAt: ctx.hoursAgo(8),
    });
  }
  // 8) attachment_added (okunmadı, 5 saat önce)
  {
    const card = pickCard(6);
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[2]!,
      type: 'attachment_added',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'attachment.added',
        notificationType: 'attachment_added',
        ...base(2, card),
        attachmentId: nanoid(),
        fileName: 'tasarim-mockup.png',
      },
      readAt: null,
      createdAt: ctx.hoursAgo(5),
    });
  }
  // 9) board_member_added (okunmadı, 2 saat önce)
  {
    const card = pickCard(0);
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[1]!,
      type: 'board_member_added',
      workspaceId,
      boardId: card.boardId,
      cardId: null,
      payload: {
        activityType: 'board.member_added',
        notificationType: 'board_member_added',
        actorUserId: memberIds[1]!,
        actorName: memberName(1),
        actorImage: memberAvatar(1),
        workspaceId,
        workspaceName,
        boardId: card.boardId,
        boardName: card.boardTitle,
        role: 'member',
      },
      readAt: null,
      createdAt: ctx.hoursAgo(2),
    });
  }
  // --- "Öncesi / sonrası" diff gösteren bildirimler ---
  // 11) card_renamed — kart başlığı değişti (okunmadı, 9 saat önce)
  {
    const card = fullCard;
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[0]!,
      type: 'card_renamed',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'card.renamed',
        notificationType: 'card_renamed',
        ...base(0, card),
        fromTitle: 'Onboarding ekranını gözden geçir',
        toTitle: card.title,
      },
      readAt: null,
      createdAt: ctx.hoursAgo(9),
    });
  }
  // 12) comment_updated — yorum düzenlendi (okunmadı, 7 saat önce)
  {
    const card = pickCard(2);
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[3]!,
      type: 'comment_updated',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'comment.updated',
        notificationType: 'comment_updated',
        ...base(3, card),
        commentId: nanoid(),
        fromBody: 'Yarın bakarım.',
        toBody: 'Bugün öğleden sonra hallederim, merak etme.',
      },
      readAt: null,
      createdAt: ctx.hoursAgo(7),
    });
  }
  // 13) card_due_changed — son tarih değişti (okunmadı, 6 saat önce)
  {
    const card = pickCard(1);
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[1]!,
      type: 'card_due_changed',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'card.due_set',
        notificationType: 'card_due_changed',
        ...base(1, card),
        fromDueAt: ctx.daysAgo(1).toISOString(),
        dueAt: ctx.hoursAgo(-72).toISOString(),
      },
      readAt: null,
      createdAt: ctx.hoursAgo(6),
    });
  }
  // 14) card_cover_changed — kapak değişti (okunmadı, 4 saat önce)
  {
    const card = pickCard(4);
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[2]!,
      type: 'card_cover_changed',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'card.cover_changed',
        notificationType: 'card_cover_changed',
        ...base(2, card),
        fromCoverColor: 'mavi',
        coverColor: 'mor',
      },
      readAt: null,
      createdAt: ctx.hoursAgo(4),
    });
  }
  // 15) checklist_item_removed — madde silindi (okunmadı, 16 saat önce)
  {
    const card = fullCard;
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[4]!,
      type: 'checklist_item_removed',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'checklist.item_removed',
        notificationType: 'checklist_item_removed',
        ...base(4, card),
        checklistId: nanoid(),
        checklistItemId: nanoid(),
        content: 'Eski tasarım notlarını taşı',
      },
      readAt: null,
      createdAt: ctx.hoursAgo(16),
    });
  }
  // 16) list_renamed — liste adı değişti (board seviyesi, okunmadı, 18 saat önce)
  {
    const card = pickCard(0);
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[0]!,
      type: 'list_renamed',
      workspaceId,
      boardId: card.boardId,
      cardId: null,
      payload: {
        activityType: 'list.renamed',
        notificationType: 'list_renamed',
        actorUserId: memberIds[0]!,
        actorName: memberName(0),
        actorImage: memberAvatar(0),
        workspaceId,
        workspaceName,
        boardId: card.boardId,
        boardName: card.boardTitle,
        listId: nanoid(),
        fromTitle: 'Yapılacaklar',
        toTitle: 'Backlog',
      },
      readAt: null,
      createdAt: ctx.hoursAgo(18),
    });
  }
  // 17) member_role_changed — rol değişti (board seviyesi, okunmadı, 3 saat önce)
  {
    const card = pickCard(0);
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[1]!,
      type: 'member_role_changed',
      workspaceId,
      boardId: card.boardId,
      cardId: null,
      payload: {
        activityType: 'board.member_role_changed',
        notificationType: 'member_role_changed',
        actorUserId: memberIds[1]!,
        actorName: memberName(1),
        actorImage: memberAvatar(1),
        workspaceId,
        workspaceName,
        boardId: card.boardId,
        boardName: card.boardTitle,
        targetUserId: ownerId,
        fromRole: 'member',
        toRole: 'admin',
      },
      readAt: null,
      createdAt: ctx.hoursAgo(3),
    });
  }
  // 18) mention (EN YENİ, en zengin — tablet detay panelinde açık) — 25 dk önce
  {
    const card = fullCard;
    rows.push({
      id: nanoid(),
      recipientId: ownerId,
      actorId: memberIds[1]!,
      type: 'mention',
      workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      payload: {
        activityType: 'comment.mentioned',
        notificationType: 'mention',
        ...base(1, card),
        commentId: nanoid(),
        mentionedUserId: ownerId,
        mentionText: `@${MAIN_NAME}`,
        commentPreview:
          'Onboarding tasarımının ilk halini ekledim, senin de görüşünü almak isterim @' +
          MAIN_NAME +
          '. Özellikle 2. adımdaki animasyon konusunda ne düşünüyorsun?',
      },
      readAt: null,
      createdAt: new Date(ctx.now.getTime() - 25 * 60 * 1000),
    });
  }

  await tx.insert(notifications).values(rows);
}

main().catch((err) => {
  console.error('[seed] ekran görüntüsü seed başarısız:', err);
  process.exitCode = 1;
});
