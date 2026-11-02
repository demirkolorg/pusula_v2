/**
 * İnceleme (değerlendirme) hesabı seed'i — "İyi Uygulama Örneği" başvurusu için.
 *
 * Bakanlık değerlendiricilerinin Pusula Portal'ı gezebilmesi için kurgusal bir
 * "Örnek İlçe Kaymakamlığı" ortamı üretir. İçerik bir kaymakamlığın günlük iş /
 * proje / toplantı takibini yansıtır; ancak kurum adları, kişiler, tarihler ve
 * tutarlar kurgusaldır ve her yerde "(Demo)" / "örnek veri" ibaresiyle bunun
 * belli olması amaçlanır.
 *
 *   - 1 ana kullanıcı (GİRİŞ YAPILABİLİR — Better Auth scrypt parolası).
 *   - 7 kurum temsilcisi (giriş yapamaz; yalnızca atama/yorum/avatar için).
 *   - 3 çalışma alanı: Örnek İlçe Kaymakamlığı · Ortak Projeler · Özel Kalem.
 *   - 6 pano; kartlarda açıklama, kontrol listesi, yorum, etiket, sorumlu,
 *     son tarih, ek (örnek PDF / saha fotoğrafı) alanları el ile yazılmıştır.
 *   - Geriye tarihli `activity_events` (oluşturma / taşıma / tamamlama / yorum)
 *     → pano raporları (akış, cycle time, ısı haritası, katkı) boş görünmez.
 *   - Ana kullanıcıya örnek bildirimler + birkaç hızlı not.
 *   - Tüm demo kullanıcılarında e-posta bildirimi kapalıdır (worker, demo
 *     adreslerine posta göndermez).
 *
 * Parola koda gömülmez; `INCELEME_PASSWORD` ortam değişkeninden okunur.
 *
 * IDEMPOTENT: ana çalışma alanı zaten varsa hiçbir şey yapmaz.
 * RESET:      `-- --reset` bu seed'in oluşturduğu alanları + kullanıcıları silip
 *             baştan kurar (yalnızca seed verisi; başka veriye dokunmaz).
 *
 * ÇALIŞTIRMA (canlıda — DATABASE_URL + S3_* üretime bakmalı):
 *   INCELEME_PASSWORD='…' pnpm --filter @pusula/db seed:inceleme
 *   INCELEME_PASSWORD='…' pnpm --filter @pusula/db seed:inceleme -- --reset
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
  activityEvents,
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
  notificationPreferences,
  notifications,
  quickNotes,
  users,
  workspaceMembers,
  workspaces,
} from '../src/schema';
import { syncSearchDocumentsForScope } from '../src/search-indexer';

loadDotenv({ path: resolve(import.meta.dirname, '../../..', '.env'), override: false });

const RESET = process.argv.includes('--reset');

// ---------------------------------------------------------------------------
// Kullanıcılar
// ---------------------------------------------------------------------------

const MAIN_EMAIL = 'inceleme@pusulaportal.com';
const MAIN_NAME = 'İnceleme Hesabı (Demo)';

type PersonKey = 'ben' | 'yazi' | 'mem' | 'gsb' | 'tarim' | 'sydv' | 'muftu' | 'muhtar';

interface Person {
  name: string;
  email: string;
  /** DiceBear initials seed'i (avatar üzerindeki baş harfler). */
  avatar: string;
}

const PEOPLE: Record<PersonKey, Person> = {
  ben: { name: MAIN_NAME, email: MAIN_EMAIL, avatar: 'İnceleme Hesabı' },
  yazi: { name: 'Yazı İşleri Md. (Demo)', email: 'demo.yaziisleri@pusulaportal.com', avatar: 'Yazı İşleri' },
  mem: { name: 'İlçe Milli Eğitim Md. (Demo)', email: 'demo.milliegitim@pusulaportal.com', avatar: 'Milli Eğitim' },
  gsb: { name: 'Gençlik ve Spor İlçe Md. (Demo)', email: 'demo.genclikspor@pusulaportal.com', avatar: 'Gençlik Spor' },
  tarim: { name: 'İlçe Tarım ve Orman Md. (Demo)', email: 'demo.tarim@pusulaportal.com', avatar: 'Tarım Orman' },
  sydv: { name: 'SYDV Müdürlüğü (Demo)', email: 'demo.sydv@pusulaportal.com', avatar: 'Sosyal Yardım' },
  muftu: { name: 'İlçe Müftülüğü (Demo)', email: 'demo.muftuluk@pusulaportal.com', avatar: 'Müftülük' },
  muhtar: { name: 'Muhtarlar Derneği (Demo)', email: 'demo.muhtarlar@pusulaportal.com', avatar: 'Muhtarlar' },
};

const MEMBER_KEYS: Exclude<PersonKey, 'ben'>[] = ['yazi', 'mem', 'gsb', 'tarim', 'sydv', 'muftu', 'muhtar'];
const ALL_EMAILS = Object.values(PEOPLE).map((p) => p.email);

const avatarUrl = (seed: string) =>
  `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(seed)}&size=200&radius=50` +
  `&backgroundColor=1e3a8a,0f766e,7c3aed,b45309,be123c,0369a1,4d7c0f`;

/** Better Auth (1.6.x) varsayılan scrypt hash'iyle birebir uyumlu — bkz. seed-screenshots.ts. */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password.normalize('NFKC'), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${key.toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Deterministik rastgelelik — tarih dağılımı her çalıştırmada aynı.
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

const rng = mulberry32(20261102);
const rndInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;

// ---------------------------------------------------------------------------
// Tiptap rich-text yardımcıları
// ---------------------------------------------------------------------------

const textNode = (text: string, bold = false) =>
  bold ? { type: 'text', marks: [{ type: 'bold' }], text } : { type: 'text', text };

/** Düz metni Tiptap doc'una çevirir — boş satırla ayrılmış her blok bir paragraf. */
function plainDoc(text: string): string {
  return JSON.stringify({
    type: 'doc',
    content: text
      .split('\n')
      .map((line) => (line.length > 0 ? { type: 'paragraph', content: [textNode(line)] } : { type: 'paragraph' })),
  });
}

type RichBlock = { h: string } | { p: string } | { b: string[] } | { kv: [string, string] };

/** Başlık / paragraf / madde listesi / "Etiket: değer" bloklarından zengin açıklama. */
function richDoc(blocks: RichBlock[]): string {
  return JSON.stringify({
    type: 'doc',
    content: blocks.map((block) => {
      if ('h' in block) return { type: 'heading', attrs: { level: 3 }, content: [textNode(block.h)] };
      if ('kv' in block)
        return { type: 'paragraph', content: [textNode(`${block.kv[0]}: `, true), textNode(block.kv[1])] };
      if ('b' in block)
        return {
          type: 'bulletList',
          content: block.b.map((item) => ({
            type: 'listItem',
            content: [{ type: 'paragraph', content: [textNode(item)] }],
          })),
        };
      return { type: 'paragraph', content: [textNode(block.p)] };
    }),
  });
}

const DEMO_NOTE = 'Not: Bu kart Pusula Portal inceleme hesabı için hazırlanmış kurgusal örnek veridir.';

// ---------------------------------------------------------------------------
// Pano içerikleri (el ile yazılmış)
// ---------------------------------------------------------------------------

interface SeedComment {
  by: PersonKey;
  text: string;
  daysAgo: number;
}

interface SeedCard {
  t: string;
  /** Düz metin açıklama ya da `richDoc` çıktısı (JSON string, `{` ile başlar). */
  d?: string;
  /** Son tarih: bugünden +gün (negatif = gecikmiş). Tamamlanan kartlarda yok sayılır. */
  due?: number;
  labels?: string[];
  a?: PersonKey[];
  w?: PersonKey[];
  cover?: string;
  cl?: { title: string; items: [string, boolean][] }[];
  cm?: SeedComment[];
  att?: AttachmentKey[];
}

interface SeedList {
  title: string;
  color: string;
  icon: string;
  iconColor: string;
  done?: boolean;
  cards: SeedCard[];
}

interface SeedBoard {
  title: string;
  icon: string;
  background: string;
  /** Listeler soldan sağa bir iş akışı mı (kart ilk listede açılıp ilerler)? */
  flow: boolean;
  members: PersonKey[];
  labels: { name: string; color: string }[];
  lists: SeedList[];
}

interface SeedWorkspace {
  name: string;
  slug: string;
  icon: string;
  members: PersonKey[];
  boards: SeedBoard[];
}

const L = (title: string, color: string, icon: string, iconColor = color) => ({ title, color, icon, iconColor });

const FULL_CARD_TITLE = 'Çocuk kütüphanesi tefrişat işi';

const WORKSPACES: SeedWorkspace[] = [
  // =========================================================================
  {
    name: 'Örnek İlçe Kaymakamlığı (Demo)',
    slug: 'demo-inceleme-kaymakamlik',
    icon: 'building',
    members: ['yazi', 'mem', 'gsb', 'tarim', 'sydv', 'muftu', 'muhtar'],
    boards: [
      // ---------------------------------------------------------------------
      {
        title: 'İlçe Proje Takip Panosu',
        icon: 'clipboard-list',
        background: 'gradient:trello-ocean',
        flow: false,
        members: ['yazi', 'mem', 'gsb', 'tarim', 'sydv', 'muftu', 'muhtar'],
        labels: [
          { name: 'Öncelikli', color: 'red' },
          { name: 'Yatırım', color: 'blue' },
          { name: 'İhale', color: 'orange' },
          { name: 'Kurumlar Arası', color: 'purple' },
          { name: 'Sosyal Fayda', color: 'green' },
          { name: 'Beklemede', color: 'yellow' },
        ],
        lists: [
          {
            ...L('Kaymakamlık Makamı', 'mavi', 'flag'),
            cards: [
              {
                t: 'Bu hesap inceleme amaçlı örnek veri içerir',
                cover: 'sky',
                d: richDoc([
                  {
                    p: 'Bu hesap, Pusula Portal’ın işleyişini göstermek amacıyla hazırlanmış bir inceleme (demo) hesabıdır.',
                  },
                  {
                    p: 'Hesaptaki “Örnek İlçe” kurumları, kişiler, projeler, tarihler ve tutarlar tamamen kurgusaldır; herhangi bir gerçek kurum kaydını yansıtmaz.',
                  },
                  { h: 'Neleri inceleyebilirsiniz?' },
                  {
                    b: [
                      'Sol menüden üç çalışma alanı: Kaymakamlık, Ortak Projeler ve Özel Kalem',
                      'Kartları açarak açıklama, kontrol listesi, yorum, etiket, sorumlu ve son tarih alanları',
                      'Kartları listeler arasında sürükleyerek aşama değiştirme',
                      'Pano menüsündeki raporlar (akış, tamamlanma süresi, iş yükü)',
                      'Sağ üstteki bildirim merkezi ve arama',
                    ],
                  },
                  { p: 'Önerilen başlangıç kartı: Milli Eğitim listesindeki “Çocuk kütüphanesi tefrişat işi”.' },
                ]),
              },
              {
                t: 'İlçe stratejik eylem planının hazırlanması',
                due: 12,
                labels: ['Kurumlar Arası'],
                a: ['ben', 'yazi'],
                w: ['mem'],
                d: richDoc([
                  { kv: ['Amaç', 'Kurumların 2027 yılı hedeflerini tek bir eylem planında toplamak.'] },
                  { kv: ['Koordinatör', 'Yazı İşleri Müdürlüğü (Demo)'] },
                  {
                    p: 'Her kurumdan en fazla beş öncelikli hedef ve bu hedeflere ait sorumlu birim, takvim ve ölçüt bilgisi istenecektir.',
                  },
                  { p: DEMO_NOTE },
                ]),
                cl: [
                  {
                    title: 'Hazırlık Adımları',
                    items: [
                      ['Kurumlardan katkı yazılarının istenmesi', true],
                      ['Gelen katkıların tek tabloda birleştirilmesi', true],
                      ['Taslak eylem planının hazırlanması', false],
                      ['Kurum amirleri toplantısında görüşülmesi', false],
                      ['Nihai metnin makam onayına sunulması', false],
                    ],
                  },
                ],
                cm: [
                  { by: 'yazi', text: 'Yedi kurumdan katkı yazısı geldi, ikisi bu hafta içinde gönderecek.', daysAgo: 6 },
                  { by: 'ben', text: 'Taslak, bir sonraki kurum amirleri toplantısının gündemine alınsın.', daysAgo: 4 },
                ],
              },
              {
                t: 'Afet ve acil durum koordinasyon planının güncellenmesi',
                due: -2,
                labels: ['Öncelikli', 'Kurumlar Arası'],
                a: ['ben'],
                w: ['yazi', 'sydv'],
                d: 'Kış dönemi öncesinde afet ve acil durum koordinasyon planındaki irtibat listeleri, toplanma alanları ve kurum görev dağılımı güncellenecektir.\n\nKurumlardan güncel irtibat bilgileri istenmiş olup iki kurumun dönüşü beklenmektedir.',
                cl: [
                  {
                    title: 'Güncelleme',
                    items: [
                      ['Kurum irtibat listelerinin güncellenmesi', true],
                      ['Toplanma alanlarının yerinde kontrolü', false],
                      ['Tatbikat tarihinin belirlenmesi', false],
                    ],
                  },
                ],
              },
              { t: 'Kurumsal kimlik ve tanıtım materyallerinin yenilenmesi', due: 20, labels: ['Sosyal Fayda'], a: ['yazi'] },
              {
                t: '2026 yılı faaliyet raporunun derlenmesi',
                due: 30,
                a: ['yazi'],
                cl: [
                  {
                    title: 'Rapor',
                    items: [
                      ['Kurumlardan faaliyet verilerinin istenmesi', true],
                      ['Fotoğraf arşivinin seçilmesi', false],
                      ['Taslak metnin yazılması', false],
                      ['Baskı öncesi son okuma', false],
                    ],
                  },
                ],
              },
            ],
          },
          {
            ...L('Yazı İşleri', 'sari', 'file-text', 'turuncu'),
            cards: [
              {
                t: 'Hükümet Konağı ön bahçe peyzaj düzenlemesi',
                due: 15,
                labels: ['Yatırım'],
                a: ['yazi'],
                d: 'Hükümet Konağı ön bahçesinde yürüyüş yolu, oturma alanları ve sulama hattını kapsayan peyzaj düzenlemesi yapılacaktır.\n\nÇalışmanın bahar dikim dönemine yetiştirilmesi planlanmaktadır.',
                cl: [
                  {
                    title: 'İş Adımları',
                    items: [
                      ['Keşif ve metraj', true],
                      ['Fidan ve malzeme temini', true],
                      ['Sulama hattının döşenmesi', false],
                      ['Çim ekimi ve son kontrol', false],
                    ],
                  },
                ],
              },
              { t: 'Arşiv odasındaki evrakın dijital arşive aktarılması', labels: ['Kurumlar Arası'], a: ['yazi'], due: 40 },
              {
                t: 'Kesintisiz güç kaynağı (UPS) alımı',
                due: 8,
                labels: ['İhale'],
                a: ['yazi'],
                d: 'Hizmet binasındaki sunucu ve iletişim cihazları için kesintisiz güç kaynağı alınacaktır. Teknik şartname hazırlanmış, piyasa fiyat araştırması sürmektedir.',
              },
              { t: 'Hizmet binası dış cephe bakım ve onarımı', labels: ['Yatırım', 'Beklemede'] },
            ],
          },
          {
            ...L('Milli Eğitim', 'mor', 'lightbulb'),
            cards: [
              {
                t: FULL_CARD_TITLE,
                due: 5,
                cover: 'turuncu',
                labels: ['Sosyal Fayda', 'Kurumlar Arası'],
                a: ['mem', 'ben'],
                w: ['yazi', 'muhtar'],
                att: ['teklif', 'foto1'],
                d: richDoc([
                  {
                    kv: [
                      'Amaç',
                      'İlçedeki 6–14 yaş grubu çocukların kitaba ve güvenli bir okuma ortamına erişimini kolaylaştırmak.',
                    ],
                  },
                  { kv: ['Yürütücü', 'İlçe Milli Eğitim Müdürlüğü (Demo)'] },
                  { kv: ['Paydaşlar', 'Kaymakamlık, Yazı İşleri, Muhtarlar Derneği'] },
                  { h: 'Kapsam' },
                  {
                    b: [
                      'Raf, okuma masası ve minder alanının tefrişi',
                      'Kitap bağışı kampanyası ile en az 1.500 kitaplık koleksiyon',
                      'Okul sonrası okuma saatleri için gönüllü öğretmen programı',
                    ],
                  },
                  { h: 'Durum' },
                  {
                    p: 'Mobilya teklifleri toplandı ve karşılaştırma tablosu ekte yer alıyor. Kitap bağışı kampanyasının duyurusu bu hafta yapılacak.',
                  },
                  { p: DEMO_NOTE },
                ]),
                cl: [
                  {
                    title: 'Tefrişat Adımları',
                    items: [
                      ['İhtiyaç listesinin çıkarılması', true],
                      ['Raf ve masa ölçülerinin alınması', true],
                      ['Mobilya tekliflerinin toplanması', true],
                      ['Kitap bağışı kampanyasının duyurulması', false],
                      ['Okuma köşesinin düzenlenmesi', false],
                      ['Açılış programının planlanması', false],
                    ],
                  },
                  {
                    title: 'Açılış Hazırlığı',
                    items: [
                      ['Davetli listesinin hazırlanması', false],
                      ['Protokol düzeninin belirlenmesi', false],
                      ['Basın duyurusunun yazılması', false],
                    ],
                  },
                ],
                cm: [
                  {
                    by: 'mem',
                    text: 'Üç firmadan mobilya teklifi alındı; karşılaştırma tablosunu ekledim.',
                    daysAgo: 5,
                  },
                  {
                    by: 'muhtar',
                    text: 'Kitap bağışı için mahalle muhtarlıklarında toplama kutusu kurabiliriz.',
                    daysAgo: 3,
                  },
                  {
                    by: 'yazi',
                    text: `@${MAIN_NAME} açılış için protokol listesinin taslağını hazırladım, uygun görürseniz kesinleştirelim.`,
                    daysAgo: 1,
                  },
                ],
              },
              {
                t: 'Öğretmenevi tadilat ve tefriş işi',
                due: 25,
                labels: ['Yatırım'],
                a: ['mem'],
                cl: [
                  {
                    title: 'Tadilat',
                    items: [
                      ['Oda ve banyoların keşfi', true],
                      ['Boya ve zemin yenileme', false],
                      ['Mobilya ve tekstil tefrişi', false],
                    ],
                  },
                ],
              },
              {
                t: 'Okullarda kış dönemi yakıt ihtiyacının tespiti',
                due: 2,
                labels: ['Öncelikli'],
                a: ['mem'],
                d: 'Merkez ve köy okullarının kış dönemi yakıt ihtiyacı okul müdürlüklerinden alınan bilgilerle tabloya işlenecektir.',
              },
              {
                t: 'Ortaokul için yeni derslik ihtiyacının yatırım programına önerilmesi',
                labels: ['Yatırım', 'Beklemede'],
                a: ['mem', 'ben'],
              },
              { t: 'Destekleme ve yetiştirme kursları takip çizelgesi', a: ['mem'] },
            ],
          },
          {
            ...L('Kültür Sanat', 'pembe', 'star'),
            cards: [
              {
                t: 'İlçe kültür sanat kulübünün kurulması',
                labels: ['Sosyal Fayda'],
                a: ['gsb', 'yazi'],
                due: 18,
                d: 'Müzik, resim, tiyatro ve fotoğraf atölyelerinden oluşan bir kulüp yapısı kurulacaktır. Atölye eğitmenleri gönüllülük esasıyla belirlenecektir.',
              },
              { t: 'İlçe bülteninin aylık yayına hazırlanması', a: ['yazi'], due: 9 },
              { t: 'Kültür merkezi ses ve ışık sisteminin yenilenmesi', labels: ['Yatırım', 'İhale'], a: ['gsb'] },
              { t: 'Halk oyunları ekibi için kostüm temini', a: ['gsb'] },
            ],
          },
          {
            ...L('Tarım & Hayvancılık', 'yesil', 'target'),
            cards: [
              {
                t: 'Soğuk zincir süt toplama merkezi projesi',
                due: 21,
                labels: ['Yatırım', 'Kurumlar Arası'],
                a: ['tarim', 'muhtar'],
                w: ['ben'],
                d: richDoc([
                  { kv: ['Amaç', 'Köylerden toplanan sütün soğuk zincir bozulmadan işletmeye ulaştırılması.'] },
                  {
                    b: [
                      'Üç toplama noktasına soğutma tankı kurulumu',
                      'Üreticilere hijyen ve kayıt eğitimi',
                      'Toplama güzergâhının planlanması',
                    ],
                  },
                  { p: DEMO_NOTE },
                ]),
                cl: [
                  {
                    title: 'Proje Adımları',
                    items: [
                      ['Toplama noktalarının belirlenmesi', true],
                      ['Tank kapasitelerinin hesaplanması', true],
                      ['Hibe başvuru dosyasının hazırlanması', false],
                      ['Üretici eğitim takvimi', false],
                    ],
                  },
                ],
                cm: [
                  { by: 'tarim', text: 'Hibe başvuru dosyası için üretici listesi tamamlandı.', daysAgo: 7 },
                ],
              },
              { t: 'Çiftçilere yem bitkisi tohumu dağıtımı', due: 10, a: ['tarim'] },
              { t: 'Mera ıslahı ve hayvan içme suyu göletleri', labels: ['Beklemede'], a: ['tarim'] },
              { t: 'Arıcılık eğitim programı', a: ['tarim'], due: 35 },
            ],
          },
          {
            ...L('Müftülük', 'turuncu', 'heart', 'kirmizi'),
            cards: [
              { t: 'Gençlik merkezi tefrişat işi', a: ['muftu'], due: 14, labels: ['Sosyal Fayda'] },
              {
                t: 'Kuran kursu yolu ve doğal gaz dönüşümü',
                labels: ['Yatırım', 'Kurumlar Arası'],
                a: ['muftu', 'yazi'],
                due: 28,
              },
              {
                t: 'Şehitlik çevre düzenlemesi ve bayrakların yenilenmesi',
                due: 7,
                labels: ['Öncelikli'],
                a: ['muftu', 'ben'],
                cl: [
                  {
                    title: 'Düzenleme',
                    items: [
                      ['Çevre duvarı ve yürüyüş yolu onarımı', true],
                      ['Bayrak ve direklerin yenilenmesi', false],
                      ['Peyzaj ve aydınlatma', false],
                    ],
                  },
                ],
              },
            ],
          },
          {
            ...L('Tamamlanan Projeler', 'yesil', 'circle-check'),
            done: true,
            cards: [
              { t: 'Aşevi kurulumu ve hizmete açılması', labels: ['Sosyal Fayda'], a: ['sydv'] },
              { t: 'Hastane helikopter pisti yapım işi', labels: ['Yatırım'], a: ['yazi'] },
              { t: 'Jandarma yerleşkesi halı saha onarımı', a: ['gsb'] },
              { t: 'Vardiya yatakhanesinin kütüphaneye dönüştürülmesi', labels: ['Sosyal Fayda'], a: ['mem'] },
              { t: 'İlçe futbol turnuvası organizasyonu', a: ['gsb'] },
              { t: 'Tören ve kutlama komisyonunun oluşturulması', a: ['yazi'] },
            ],
          },
        ],
      },
      // ---------------------------------------------------------------------
      {
        title: 'Toplantı Kararları ve Talimatlar',
        icon: 'calendar',
        background: 'gradient:lavender',
        flow: false,
        members: ['yazi', 'mem', 'gsb', 'tarim', 'sydv', 'muftu', 'muhtar'],
        labels: [
          { name: 'Karar', color: 'blue' },
          { name: 'Talimat', color: 'orange' },
          { name: 'Takipte', color: 'yellow' },
          { name: 'Acil', color: 'red' },
          { name: 'Bilgi', color: 'sky' },
        ],
        lists: [
          {
            ...L('Kurum Amirleri Toplantısı', 'mavi', 'users'),
            cards: [
              {
                t: 'Kış tedbirleri: kar mücadelesi ekip ve araç planı',
                due: 6,
                labels: ['Talimat'],
                a: ['ben', 'yazi'],
                w: ['muhtar'],
                att: ['tutanak'],
                d: richDoc([
                  { kv: ['Toplantı', 'Kurum Amirleri Toplantısı (örnek tarih)'] },
                  { kv: ['Karar', 'Kar mücadelesinde kurumlar arası nöbet ve araç planı ortak hazırlanacaktır.'] },
                  { h: 'Verilen talimatlar' },
                  {
                    b: [
                      'İş makinelerinin bakımları ay sonuna kadar tamamlanacak.',
                      'Köy yolları için öncelik sıralaması muhtarlarla birlikte belirlenecek.',
                      'Nöbet listesi tüm kurumlara yazılı olarak bildirilecek.',
                    ],
                  },
                  { p: DEMO_NOTE },
                ]),
                cl: [
                  {
                    title: 'Talimatlar',
                    items: [
                      ['İş makinelerinin bakımı', true],
                      ['Nöbet listesinin hazırlanması', true],
                      ['Köy yollarının öncelik sıralaması', false],
                      ['Muhtarlarla iletişim kanalının oluşturulması', false],
                    ],
                  },
                ],
                cm: [
                  { by: 'muhtar', text: 'Öncelikli köy yolu listesini muhtarlardan topladım, karta ekleyeceğim.', daysAgo: 2 },
                ],
              },
              { t: 'Kurumların bütçe ve yatırım ihtiyaçlarının bildirilmesi', due: 9, labels: ['Karar'], a: ['yazi'] },
              { t: 'Resmî bayram programı görev dağılımı', labels: ['Karar'], a: ['yazi', 'gsb'] },
              { t: 'Kamu binalarında enerji tasarrufu tedbirleri', labels: ['Talimat'] },
            ],
          },
          {
            ...L('Muhtarlar Toplantısı', 'sari', 'message-square', 'turuncu'),
            cards: [
              {
                t: 'Köy yollarındaki menfez ve stabilize ihtiyaçlarının listelenmesi',
                labels: ['Takipte'],
                a: ['muhtar'],
                due: 16,
              },
              { t: 'Köylerde içme suyu kalite kontrollerinin yapılması', labels: ['Talimat'], a: ['muhtar', 'tarim'], due: 11 },
              { t: 'Muhtarlık taleplerinin portal üzerinden takibi', labels: ['Bilgi'], a: ['ben'] },
            ],
          },
          {
            ...L('Valilik Koordinasyon Toplantısı', 'indigo', 'flag'),
            cards: [
              {
                t: 'Valilik toplantısında verilen talimatların kurumlara iletilmesi',
                due: 1,
                labels: ['Talimat', 'Acil'],
                a: ['ben'],
                w: ['yazi'],
                d: 'Valilik koordinasyon toplantısında ilçemizi ilgilendiren talimatlar ilgili kurumlara görev olarak iletilecek ve bu panodan takip edilecektir.',
              },
              { t: 'İlçe yatırım izleme tablosunun güncellenmesi', due: 6, labels: ['Karar'], a: ['yazi'] },
              {
                t: 'Sosyal yardım başvurularında değerlendirme süresinin kısaltılması',
                labels: ['Karar'],
                a: ['sydv'],
                due: 22,
              },
            ],
          },
          {
            ...L('Talimat Takibi', 'turuncu', 'hourglass', 'kirmizi'),
            cards: [
              { t: 'Okul servis araçlarının denetimi', due: 4, labels: ['Talimat'], a: ['mem'] },
              { t: 'Pazar yeri düzenlemesi ve denetim', labels: ['Takipte'], a: ['yazi'] },
              {
                t: 'Kamu binalarında erişilebilirlik eksiklerinin giderilmesi',
                labels: ['Talimat'],
                a: ['yazi'],
                due: 19,
              },
            ],
          },
          {
            ...L('Sonuçlanan Kararlar', 'yesil', 'circle-check'),
            done: true,
            cards: [
              { t: 'Hizmet içi eğitim takviminin belirlenmesi', labels: ['Karar'], a: ['yazi'] },
              { t: 'Kurumlar arası ortak duyuru panosunun oluşturulması', labels: ['Karar'], a: ['ben'] },
              { t: 'Bayram öncesi temizlik ve çevre düzenlemesi', labels: ['Talimat'], a: ['muhtar'] },
            ],
          },
        ],
      },
      // ---------------------------------------------------------------------
      {
        title: 'Yatırım ve İhale Süreçleri',
        icon: 'factory',
        background: 'gradient:trello-earth',
        flow: true,
        members: ['yazi', 'mem', 'gsb', 'muftu', 'muhtar'],
        labels: [
          { name: 'Keşif', color: 'sky' },
          { name: 'İhale', color: 'orange' },
          { name: 'Uygulama', color: 'blue' },
          { name: 'Kabul', color: 'green' },
          { name: 'Ödenek Bekliyor', color: 'yellow' },
          { name: 'Kritik', color: 'red' },
        ],
        lists: [
          {
            ...L('Planlama', 'mavi', 'list-todo'),
            cards: [
              { t: 'Kapalı spor salonu çatı yalıtımı', labels: ['Ödenek Bekliyor'], a: ['gsb'] },
              { t: 'İlkokul bahçesine çok amaçlı saha yapımı', a: ['mem'] },
              { t: 'Merkez mahallede yağmur suyu kanalı', labels: ['Kritik'], a: ['yazi'], due: 30 },
              { t: 'Mezarlık çevre duvarının yenilenmesi', a: ['muftu'] },
            ],
          },
          {
            ...L('Proje ve Keşif', 'sky', 'layers', 'mavi'),
            cards: [
              { t: 'Kültür merkezi modernizasyonu keşif çalışması', labels: ['Keşif'], a: ['gsb'], due: 12 },
              { t: 'Öğretmenevi ek bina dönüşüm projesi', labels: ['Keşif'], a: ['mem'], due: 17 },
              { t: 'Köy konağı onarım keşfi', labels: ['Keşif'], a: ['muhtar'] },
            ],
          },
          {
            ...L('İhale Aşamasında', 'turuncu', 'hammer'),
            cards: [
              {
                t: 'Hükümet Konağı dış cephe giydirme işi',
                due: 10,
                labels: ['İhale', 'Kritik'],
                a: ['yazi'],
                w: ['ben'],
                att: ['ilan'],
                d: richDoc([
                  { kv: ['Yaklaşık maliyet', 'Örnek tutar (demo)'] },
                  { kv: ['İhale usulü', 'Açık ihale'] },
                  {
                    p: 'İhale dokümanı hazırlanmış ve ilan yayımlanmıştır. Teklif değerlendirme komisyonu kurulmuştur.',
                  },
                  { p: DEMO_NOTE },
                ]),
                cl: [
                  {
                    title: 'İhale Süreci',
                    items: [
                      ['İhale dokümanının hazırlanması', true],
                      ['İlanın yayımlanması', true],
                      ['Tekliflerin değerlendirilmesi', false],
                      ['Sözleşmenin imzalanması', false],
                      ['Yer tesliminin yapılması', false],
                    ],
                  },
                ],
              },
              { t: 'Kaymakamlık hizmet aracı kiralama', labels: ['İhale'], a: ['yazi'], due: 14 },
              { t: 'Okul bahçe duvarı yapımı', labels: ['İhale'], a: ['mem'] },
            ],
          },
          {
            ...L('Uygulamada', 'mor', 'wrench'),
            cards: [
              {
                t: 'Kaymakamlık lojmanı yapım işi',
                due: 45,
                labels: ['Uygulama'],
                a: ['yazi'],
                att: ['hakedis', 'foto2'],
                d: 'Kaba inşaat tamamlanmış, ince işler devam etmektedir. Fiziki gerçekleşme yaklaşık %65 olarak bildirilmiştir.',
                cl: [
                  {
                    title: 'İş Programı',
                    items: [
                      ['Kaba inşaat', true],
                      ['Çatı ve yalıtım', true],
                      ['Elektrik ve mekanik tesisat', false],
                      ['İnce işler ve boya', false],
                      ['Çevre düzenlemesi', false],
                    ],
                  },
                ],
              },
              { t: 'Cemevi yapım işi', labels: ['Uygulama'], a: ['muftu', 'yazi'], due: 60 },
              { t: 'Kız Kuran kursu ısıtma sistemi dönüşümü', labels: ['Uygulama'], a: ['muftu'], due: 20 },
            ],
          },
          {
            ...L('Kabul ve Teslim', 'yesil', 'circle-check'),
            done: true,
            cards: [
              { t: 'Çocuk kütüphanesi mobilyalarının geçici kabulü', labels: ['Kabul'], a: ['mem'] },
              { t: 'Gençlik merkezi tefrişatının kesin kabulü', labels: ['Kabul'], a: ['muftu'] },
              { t: 'Hizmet binası UPS kurulumunun kabulü', labels: ['Kabul'], a: ['yazi'] },
            ],
          },
        ],
      },
    ],
  },
  // =========================================================================
  {
    name: 'Ortak Projeler (Demo)',
    slug: 'demo-inceleme-ortak-projeler',
    icon: 'network',
    members: ['yazi', 'mem', 'gsb', 'tarim', 'sydv', 'muftu', 'muhtar'],
    boards: [
      {
        title: 'Kültür, Sanat ve Spor Etkinlikleri',
        icon: 'trophy',
        background: 'gradient:sunrise',
        flow: true,
        members: ['yazi', 'mem', 'gsb', 'tarim', 'muftu'],
        labels: [
          { name: 'Spor', color: 'green' },
          { name: 'Kültür', color: 'purple' },
          { name: 'Tanıtım', color: 'sky' },
          { name: 'Gençlik', color: 'blue' },
          { name: 'Protokol', color: 'orange' },
        ],
        lists: [
          {
            ...L('Planlanan', 'mavi', 'calendar'),
            cards: [
              { t: 'Yaz dönemi bisiklet festivali', labels: ['Spor', 'Tanıtım'], a: ['gsb'] },
              { t: 'Kış sporları tanıtım günü', labels: ['Spor', 'Gençlik'], a: ['gsb'], due: 40 },
              { t: 'Yöresel ürünler ve el sanatları sergisi', labels: ['Kültür'], a: ['tarim'] },
              { t: 'Okullar arası kitap okuma kampanyası', labels: ['Kültür', 'Gençlik'], a: ['mem'], due: 25 },
            ],
          },
          {
            ...L('Hazırlık', 'mor', 'timer'),
            cards: [
              {
                t: 'Doğa yürüyüşü ve kamp organizasyonu',
                due: 13,
                labels: ['Spor', 'Tanıtım'],
                a: ['gsb'],
                w: ['ben'],
                d: 'Kurumların ortaklığıyla düzenlenecek doğa yürüyüşünde parkur güvenliği, sağlık ekibi ve ulaşım planı birlikte hazırlanacaktır.',
                cl: [
                  {
                    title: 'Hazırlık',
                    items: [
                      ['Parkur keşfi', true],
                      ['Katılımcı kayıt formu', true],
                      ['Güvenlik ve sağlık ekibi planı', false],
                      ['Ulaşım ve konaklama', false],
                    ],
                  },
                ],
                cm: [{ by: 'gsb', text: 'Kayıt formu yayında, ilk gün 40 başvuru geldi.', daysAgo: 2 }],
              },
              { t: 'Gençlik kampı programı', labels: ['Gençlik'], a: ['gsb', 'muftu'], due: 21 },
              { t: 'İlçe tanıtım filmi çekimi', labels: ['Tanıtım'], a: ['yazi'] },
            ],
          },
          {
            ...L('Kurumlar Arası Koordinasyon', 'turuncu', 'users'),
            cards: [
              { t: 'Festival güvenlik ve sağlık ekiplerinin planlanması', labels: ['Protokol'], a: ['yazi'], due: 8 },
              { t: 'Sponsor ve paydaş kurumlarla toplantı', labels: ['Protokol'], a: ['ben'], due: 5 },
            ],
          },
          {
            ...L('Gerçekleşen', 'yesil', 'trophy'),
            done: true,
            cards: [
              { t: 'Futbol turnuvası ödül töreni', labels: ['Spor'], a: ['gsb'] },
              { t: 'Okul tiyatro günleri', labels: ['Kültür'], a: ['mem'] },
              { t: 'Kurumlar arası satranç turnuvası', labels: ['Spor'], a: ['gsb'] },
            ],
          },
        ],
      },
      {
        title: 'Sosyal Destek Programları',
        icon: 'heart',
        background: 'gradient:trello-peach',
        flow: true,
        members: ['sydv', 'mem', 'muftu', 'muhtar'],
        labels: [
          { name: 'Gıda', color: 'orange' },
          { name: 'Eğitim Desteği', color: 'blue' },
          { name: 'Yaşlı ve Engelli', color: 'purple' },
          { name: 'Acil Destek', color: 'red' },
          { name: 'Kış Yardımı', color: 'sky' },
        ],
        lists: [
          {
            ...L('Tespit ve Başvuru', 'mavi', 'inbox'),
            cards: [
              {
                t: 'Kış dönemi yakacak yardımı ihtiyaç tespiti',
                due: 9,
                labels: ['Kış Yardımı'],
                a: ['sydv', 'muhtar'],
                d: 'Muhtarlıklardan gelen listeler ile hane ziyaretlerinde yapılan tespitler birleştirilecektir. Kişisel veri içeren listeler portala eklenmez; yalnızca hane sayısı ve ilerleme takip edilir.',
                cl: [
                  {
                    title: 'Tespit',
                    items: [
                      ['Muhtarlık listelerinin toplanması', true],
                      ['Hane ziyaretlerinin planlanması', false],
                      ['Mütevelli heyeti gündemine alınması', false],
                    ],
                  },
                ],
              },
              { t: 'Engelli bireylere evde bakım ziyaretleri', labels: ['Yaşlı ve Engelli'], a: ['sydv'] },
              { t: 'Okul kıyafeti desteği başvuruları', labels: ['Eğitim Desteği'], a: ['sydv', 'mem'], due: 15 },
            ],
          },
          {
            ...L('Değerlendirme', 'sari', 'list-checks', 'turuncu'),
            cards: [
              { t: 'Aşevi menü ve kapasite planı', labels: ['Gıda'], a: ['sydv'], due: 7 },
              { t: 'Üniversite öğrencilerine burs desteği', labels: ['Eğitim Desteği'], a: ['sydv'] },
            ],
          },
          {
            ...L('Uygulamada', 'mor', 'activity'),
            cards: [
              { t: 'Gıda kolisi dağıtımı', labels: ['Gıda'], a: ['sydv', 'muftu'], due: 3 },
              { t: 'Yaşlılara sıcak yemek servisi', labels: ['Yaşlı ve Engelli'], a: ['sydv'] },
              { t: 'Güdümlü destek projesi', labels: ['Eğitim Desteği'], a: ['mem', 'sydv'], due: 26 },
            ],
          },
          {
            ...L('Tamamlanan', 'yesil', 'circle-check'),
            done: true,
            cards: [
              { t: 'Kırtasiye seti dağıtımı', labels: ['Eğitim Desteği'], a: ['sydv'] },
              { t: 'Şehit ve gazi ailelerine bayram ziyaretleri', a: ['muftu'] },
              { t: 'Selzede ailelere acil barınma desteği', labels: ['Acil Destek'], a: ['sydv'] },
            ],
          },
        ],
      },
    ],
  },
  // =========================================================================
  {
    name: 'Özel Kalem (Demo)',
    slug: 'demo-inceleme-ozel-kalem',
    icon: 'briefcase',
    members: ['yazi'],
    boards: [
      {
        title: 'Makam Ajandası',
        icon: 'calendar',
        background: 'gradient:trello-crystal',
        flow: false,
        members: ['yazi'],
        labels: [
          { name: 'Ziyaret', color: 'blue' },
          { name: 'Toplantı', color: 'purple' },
          { name: 'Program', color: 'green' },
          { name: 'Takip', color: 'yellow' },
          { name: 'Önemli', color: 'red' },
        ],
        lists: [
          {
            ...L('Bu Hafta', 'mavi', 'calendar'),
            cards: [
              {
                t: 'Kurum amirleri toplantısı',
                due: 1,
                labels: ['Toplantı'],
                a: ['ben'],
                d: richDoc([
                  { h: 'Gündem' },
                  {
                    b: [
                      'Kış tedbirleri ve kar mücadelesi',
                      'Yatırım izleme tablosundaki son durum',
                      'Resmî bayram programı görev dağılımı',
                    ],
                  },
                  { p: DEMO_NOTE },
                ]),
              },
              { t: 'Okul ziyareti ve öğretmenlerle görüşme', due: 2, labels: ['Ziyaret'], a: ['ben'] },
              { t: 'Muhtarlarla istişare toplantısı', due: 3, labels: ['Toplantı'], a: ['ben', 'yazi'] },
              { t: 'Hastane ziyareti', due: 4, labels: ['Ziyaret'], a: ['ben'] },
            ],
          },
          {
            ...L('Ziyaret ve Programlar', 'mor', 'users'),
            cards: [
              { t: 'Köy ziyaretleri programı', labels: ['Program'], a: ['yazi'], due: 12 },
              { t: 'Şehit ailelerine ziyaret', labels: ['Ziyaret', 'Önemli'], a: ['ben'], due: 6 },
              { t: 'Sivil toplum kuruluşu temsilcileriyle görüşme', labels: ['Toplantı'], a: ['ben'] },
            ],
          },
          {
            ...L('Takip Edilecekler', 'sari', 'pin', 'turuncu'),
            cards: [
              { t: 'Valilikten gelen yazıların cevaplanması', due: 2, labels: ['Takip', 'Önemli'], a: ['yazi'] },
              { t: 'Vatandaş taleplerinin ilgili kurumlara iletilmesi', labels: ['Takip'], a: ['yazi'] },
              { t: 'Basın açıklaması metninin hazırlanması', labels: ['Takip'], a: ['yazi'], due: 5 },
            ],
          },
          {
            ...L('Tamamlandı', 'yesil', 'circle-check'),
            done: true,
            cards: [
              { t: 'Cumhuriyet Bayramı kutlama programı', labels: ['Program'], a: ['yazi'] },
              { t: 'Ekim ayı kurum ziyaretleri', labels: ['Ziyaret'], a: ['ben'] },
              { t: 'Yeni atanan personelle tanışma toplantısı', labels: ['Toplantı'], a: ['ben'] },
            ],
          },
        ],
      },
    ],
  },
];

const ALL_SLUGS = WORKSPACES.map((w) => w.slug);
const MAIN_SLUG = WORKSPACES[0]!.slug;

const QUICK_NOTES = [
  'Örnek not: Perşembe kurum amirleri toplantısı gündemine kış tedbirleri ve yatırım izleme tablosu eklenecek.',
  'Örnek not: Muhtarlar toplantısında konuşulan köy yolu talepleri ilgili panoya kart olarak işlendi.',
  'Örnek not: Valilik koordinasyon toplantısı notları “Toplantı Kararları ve Talimatlar” panosunda.',
];

// ---------------------------------------------------------------------------
// Ekler — örnek PDF'ler (script içinde üretilir) + saha fotoğrafı
// ---------------------------------------------------------------------------

type AttachmentKey = 'teklif' | 'tutanak' | 'ilan' | 'hakedis' | 'foto1' | 'foto2';

const PDF_DOCS: Record<Exclude<AttachmentKey, 'foto1' | 'foto2'>, { fileName: string; lines: string[] }> = {
  teklif: {
    fileName: 'mobilya-teklif-karsilastirma-ornek.pdf',
    lines: [
      'ORNEK BELGE - PUSULA PORTAL INCELEME HESABI',
      '',
      'Cocuk Kutuphanesi Tefrisat Isi',
      'Mobilya Teklif Karsilastirma Tablosu',
      '',
      'Firma A (ornek) ........ Raf + masa + minder seti',
      'Firma B (ornek) ........ Raf + masa seti',
      'Firma C (ornek) ........ Raf + masa + minder + aydinlatma',
      '',
      'Bu belge kurgusaldir; gercek firma veya tutar icermez.',
    ],
  },
  tutanak: {
    fileName: 'kurum-amirleri-toplanti-tutanagi-ornek.pdf',
    lines: [
      'ORNEK BELGE - PUSULA PORTAL INCELEME HESABI',
      '',
      'Ornek Ilce Kaymakamligi',
      'Kurum Amirleri Toplantisi Tutanagi',
      '',
      '1. Kis tedbirleri ve kar mucadelesi ekip plani gorusuldu.',
      '2. Is makinelerinin bakimlarinin ay sonuna kadar tamamlanmasina karar verildi.',
      '3. Koy yollari oncelik sirasi muhtarlarla birlikte belirlenecek.',
      '',
      'Bu belge kurgusaldir.',
    ],
  },
  ilan: {
    fileName: 'dis-cephe-ihale-ilani-ornek.pdf',
    lines: [
      'ORNEK BELGE - PUSULA PORTAL INCELEME HESABI',
      '',
      'Hukumet Konagi Dis Cephe Giydirme Isi',
      'Ihale Ilani (ornek)',
      '',
      'Ihale usulu: Acik ihale',
      'Isin suresi: Yer tesliminden itibaren 120 takvim gunu',
      '',
      'Bu belge kurgusaldir; gercek bir ihale ilani degildir.',
    ],
  },
  hakedis: {
    fileName: 'lojman-hakedis-ozeti-ornek.pdf',
    lines: [
      'ORNEK BELGE - PUSULA PORTAL INCELEME HESABI',
      '',
      'Kaymakamlik Lojmani Yapim Isi',
      'Hakedis Ozeti (ornek)',
      '',
      'Kaba insaat ................ tamamlandi',
      'Cati ve yalitim ............ tamamlandi',
      'Tesisat .................... devam ediyor',
      'Fiziki gerceklesme ......... yaklasik %65',
      '',
      'Bu belge kurgusaldir.',
    ],
  },
};

const PHOTOS: Record<'foto1' | 'foto2', { fileName: string; url: string }> = {
  foto1: { fileName: 'saha-fotografi-ornek-1.jpg', url: 'https://picsum.photos/seed/pusula-inceleme-1/1200/800' },
  foto2: { fileName: 'saha-fotografi-ornek-2.jpg', url: 'https://picsum.photos/seed/pusula-inceleme-2/1200/800' },
};

/** Tek sayfalık, yalnız ASCII metinli minimal PDF üretir (Helvetica). */
function buildPdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = [
    'BT',
    '/F1 13 Tf',
    '16 TL',
    '60 780 Td',
    ...lines.map((line, i) => `${i === 0 ? '' : 'T* '}(${esc(line)}) Tj`),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

interface UploadedFile {
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
}

const S3_BUCKET = process.env.S3_BUCKET ?? 'pusula';

/** Ekleri MinIO'ya yükler; erişilemeyenler atlanır (kart eksiz kalır, seed sürer). */
async function uploadAttachments(): Promise<Partial<Record<AttachmentKey, UploadedFile>>> {
  const out: Partial<Record<AttachmentKey, UploadedFile>> = {};
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'pusula',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'pusula-secret',
    },
  });

  const put = async (key: AttachmentKey, fileName: string, mimeType: string, body: Uint8Array) => {
    const storageKey = `inceleme/attachments/${nanoid()}-${fileName}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: storageKey,
        Body: body,
        ContentType: mimeType,
        ContentLength: body.byteLength,
      }),
    );
    out[key] = { storageKey, fileName, mimeType, size: body.byteLength };
  };

  for (const [key, doc] of Object.entries(PDF_DOCS) as [keyof typeof PDF_DOCS, (typeof PDF_DOCS)[keyof typeof PDF_DOCS]][]) {
    try {
      await put(key, doc.fileName, 'application/pdf', buildPdf(doc.lines));
    } catch (err) {
      console.warn(`[seed] ek yüklenemedi (${doc.fileName}):`, err);
    }
  }
  for (const [key, photo] of Object.entries(PHOTOS) as ['foto1' | 'foto2', (typeof PHOTOS)['foto1']][]) {
    try {
      const res = await fetch(photo.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await put(key, photo.fileName, 'image/jpeg', new Uint8Array(await res.arrayBuffer()));
    } catch (err) {
      console.warn(`[seed] fotoğraf yüklenemedi (${photo.url}):`, err);
    }
  }
  console.warn(`[seed] ${Object.keys(out).length} ek MinIO'ya yüklendi.`);
  return out;
}

// ---------------------------------------------------------------------------
// Walker
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

type Tx = Parameters<Parameters<ReturnType<typeof createDb>['db']['transaction']>[0]>[0];

async function ensureUser(tx: Tx, person: Person, createdAt: Date, password?: string): Promise<string> {
  const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, person.email)).limit(1);
  let userId = existing?.id;
  if (!userId) {
    userId = nanoid();
    await tx.insert(users).values({
      id: userId,
      name: person.name,
      email: person.email,
      emailVerified: true,
      image: avatarUrl(person.avatar),
      createdAt,
      updatedAt: createdAt,
    });
  }
  if (password) {
    const [acct] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, userId)).limit(1);
    if (!acct) {
      await tx.insert(accounts).values({
        id: nanoid(),
        accountId: userId,
        providerId: 'credential',
        userId,
        password: hashPassword(password),
      });
    }
  }
  // Demo adreslerine e-posta bildirimi gitmesin (global tercih satırı).
  await tx
    .insert(notificationPreferences)
    .values({ userId, emailEnabled: false })
    .onConflictDoNothing();
  return userId;
}

interface BuiltCard {
  id: string;
  title: string;
  workspaceId: string;
  workspaceName: string;
  boardId: string;
  boardTitle: string;
  listTitle: string;
}

async function main() {
  const password = process.env.INCELEME_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('INCELEME_PASSWORD ortam değişkeni (en az 8 karakter) gerekli.');
  }

  const { db, pool } = createDb();
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * DAY_MS);
  const daysFromNow = (n: number) => new Date(now.getTime() + n * DAY_MS);
  const hoursAgo = (n: number) => new Date(now.getTime() - n * HOUR_MS);
  /** Saat 09:00–17:00 arasına oturan geriye tarihli an (mesai görünümü). */
  const workTimeDaysAgo = (n: number) => {
    const d = daysAgo(n);
    d.setUTCHours(6 + rndInt(0, 8), rndInt(0, 59), 0, 0); // TR = UTC+3
    return d > now ? hoursAgo(1) : d;
  };

  try {
    if (RESET) {
      await db.delete(workspaces).where(inArray(workspaces.slug, ALL_SLUGS));
      await db.delete(users).where(inArray(users.email, ALL_EMAILS));
      console.warn('[seed] --reset: önceki inceleme verisi temizlendi.');
    }

    const [existing] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, MAIN_SLUG))
      .limit(1);
    if (existing) {
      console.warn(`[seed] "${MAIN_SLUG}" zaten var — yapılacak bir şey yok. Yeniden kurmak için --reset.`);
      return;
    }

    const files = await uploadAttachments();
    const stats = { boards: 0, lists: 0, cards: 0, comments: 0, checklistItems: 0, attachments: 0, activities: 0 };
    const built: BuiltCard[] = [];
    const workspaceIds: string[] = [];
    const ids = {} as Record<PersonKey, string>;
    const SETUP_DAYS = 120;

    await db.transaction(async (tx) => {
      ids.ben = await ensureUser(tx, PEOPLE.ben, daysAgo(SETUP_DAYS), password);
      for (const key of MEMBER_KEYS) ids[key] = await ensureUser(tx, PEOPLE[key], daysAgo(SETUP_DAYS));
      const ownerId = ids.ben;

      type ActivityRow = typeof activityEvents.$inferInsert;
      const activityRows: ActivityRow[] = [];

      for (const wsDef of WORKSPACES) {
        const wsCreated = daysAgo(SETUP_DAYS - 2);
        const [workspace] = await tx
          .insert(workspaces)
          .values({ name: wsDef.name, slug: wsDef.slug, icon: wsDef.icon, ownerId, createdAt: wsCreated, updatedAt: wsCreated })
          .returning();
        if (!workspace) throw new Error(`workspace oluşturulamadı: ${wsDef.name}`);
        workspaceIds.push(workspace.id);

        await tx.insert(workspaceMembers).values([
          { workspaceId: workspace.id, userId: ownerId, role: 'owner' },
          ...wsDef.members.map((key) => ({
            workspaceId: workspace.id,
            userId: ids[key],
            role: (key === 'yazi' ? 'admin' : 'member') as 'admin' | 'member',
          })),
        ]);

        for (const boardDef of wsDef.boards) {
          const boardCreated = daysAgo(SETUP_DAYS - 3);
          const [board] = await tx
            .insert(boards)
            .values({
              workspaceId: workspace.id,
              title: boardDef.title,
              icon: boardDef.icon,
              background: boardDef.background,
              createdAt: boardCreated,
              updatedAt: boardCreated,
            })
            .returning();
          if (!board) throw new Error(`board oluşturulamadı: ${boardDef.title}`);
          stats.boards++;

          await tx.insert(boardMembers).values([
            { boardId: board.id, userId: ownerId, role: 'admin' as const },
            ...boardDef.members.map((key) => ({
              boardId: board.id,
              userId: ids[key],
              role: (key === 'yazi' ? 'admin' : 'member') as 'admin' | 'member',
            })),
          ]);

          const labelRows = await tx
            .insert(labels)
            .values(boardDef.labels.map((l) => ({ boardId: board.id, name: l.name, color: l.color })))
            .returning();
          const labelIdByName = new Map(labelRows.map((r) => [r.name, r.id]));

          const listPositions = positionsBetween(null, null, boardDef.lists.length);
          const listRows = await tx
            .insert(lists)
            .values(
              boardDef.lists.map((listDef, i) => ({
                boardId: board.id,
                title: listDef.title,
                color: listDef.color,
                icon: listDef.icon,
                iconColor: listDef.iconColor,
                position: listPositions[i] ?? firstPosition(),
                createdAt: boardCreated,
                updatedAt: boardCreated,
              })),
            )
            .returning();
          stats.lists += listRows.length;

          for (let li = 0; li < boardDef.lists.length; li++) {
            const listDef = boardDef.lists[li]!;
            const list = listRows[li]!;
            const cardPositions = positionsBetween(null, null, listDef.cards.length);

            for (let ci = 0; ci < listDef.cards.length; ci++) {
              const c = listDef.cards[ci]!;
              const completed = listDef.done === true;
              const creator = c.a?.[0] ?? 'ben';

              // Zaman çizelgesi: oluşturma → (taşımalar) → (tamamlanma); yorumlar arada.
              const oldestComment = Math.max(0, ...(c.cm ?? []).map((m) => m.daysAgo));
              const completedDays = completed ? rndInt(2, 40) : 0;
              const createdDays = Math.max(rndInt(12, 80), oldestComment + 3, completedDays + rndInt(4, 25));
              const createdAt = workTimeDaysAgo(createdDays);
              const completedAt = completed ? workTimeDaysAgo(completedDays) : null;

              const [card] = await tx
                .insert(cards)
                .values({
                  boardId: board.id,
                  listId: list.id,
                  title: c.t,
                  description: c.d ? (c.d.startsWith('{') ? c.d : plainDoc(c.d)) : null,
                  position: cardPositions[ci] ?? firstPosition(),
                  dueAt: !completed && c.due != null ? daysFromNow(c.due) : null,
                  completed,
                  completedAt,
                  completedBy: completed ? ids[creator] : null,
                  coverColor: c.cover ?? null,
                  createdAt,
                  updatedAt: completedAt ?? workTimeDaysAgo(Math.min(createdDays, rndInt(0, 6))),
                })
                .returning();
              if (!card) throw new Error(`kart oluşturulamadı: ${c.t}`);
              stats.cards++;
              built.push({
                id: card.id,
                title: c.t,
                workspaceId: workspace.id,
                workspaceName: wsDef.name,
                boardId: board.id,
                boardTitle: boardDef.title,
                listTitle: listDef.title,
              });

              // --- activity: created / moved / completed ---
              const startIdx = boardDef.flow ? 0 : completed ? rndInt(0, Math.max(0, li - 1)) : li;
              const startList = listRows[startIdx]!;
              activityRows.push({
                workspaceId: workspace.id,
                boardId: board.id,
                cardId: card.id,
                actorId: ids[creator],
                type: 'card.created',
                payload: { cardId: card.id, listId: startList.id, title: c.t, position: card.position },
                createdAt,
              });
              const hops: number[] = [];
              if (boardDef.flow) for (let k = 1; k <= li; k++) hops.push(k);
              else if (startIdx !== li) hops.push(li);
              const endMs = (completedAt ?? hoursAgo(rndInt(2, 72))).getTime();
              let prevIdx = startIdx;
              hops.forEach((toIdx, h) => {
                const at = new Date(
                  createdAt.getTime() + ((endMs - createdAt.getTime()) * (h + 1)) / (hops.length + 1),
                );
                activityRows.push({
                  workspaceId: workspace.id,
                  boardId: board.id,
                  cardId: card.id,
                  actorId: ids[c.a?.[h % (c.a?.length ?? 1)] ?? 'ben'],
                  type: 'card.moved',
                  payload: {
                    cardId: card.id,
                    fromListId: listRows[prevIdx]!.id,
                    toListId: listRows[toIdx]!.id,
                    fromListTitle: boardDef.lists[prevIdx]!.title,
                    toListTitle: boardDef.lists[toIdx]!.title,
                  },
                  createdAt: at,
                });
                prevIdx = toIdx;
              });
              if (completedAt) {
                activityRows.push({
                  workspaceId: workspace.id,
                  boardId: board.id,
                  cardId: card.id,
                  actorId: ids[creator],
                  type: 'card.completed',
                  payload: { cardId: card.id },
                  createdAt: completedAt,
                });
              }

              // --- etiketler ---
              const labelIds = (c.labels ?? []).map((n) => labelIdByName.get(n)).filter((x): x is string => !!x);
              if (labelIds.length > 0) {
                await tx.insert(cardLabels).values(labelIds.map((labelId) => ({ cardId: card.id, labelId })));
              }

              // --- üyeler ---
              const memberRows = [
                ...(c.a ?? []).map((k) => ({ cardId: card.id, userId: ids[k], role: 'assignee' as const })),
                ...(c.w ?? [])
                  .filter((k) => !(c.a ?? []).includes(k))
                  .map((k) => ({ cardId: card.id, userId: ids[k], role: 'watcher' as const })),
              ];
              if (memberRows.length > 0) await tx.insert(cardMembers).values(memberRows);

              // --- kontrol listeleri ---
              const checklistPositions = positionsBetween(null, null, c.cl?.length ?? 0);
              for (const [i, clDef] of (c.cl ?? []).entries()) {
                const [checklist] = await tx
                  .insert(checklists)
                  .values({ cardId: card.id, title: clDef.title, position: checklistPositions[i] ?? firstPosition() })
                  .returning();
                if (!checklist) continue;
                const itemPositions = positionsBetween(null, null, clDef.items.length);
                await tx.insert(checklistItems).values(
                  clDef.items.map(([content, done], ii) => {
                    const itemDone = done || completed;
                    return {
                      checklistId: checklist.id,
                      content,
                      position: itemPositions[ii] ?? firstPosition(),
                      completed: itemDone,
                      completedAt: itemDone ? (completedAt ?? workTimeDaysAgo(rndInt(3, Math.max(3, createdDays - 1)))) : null,
                      completedBy: itemDone ? ids[creator] : null,
                    };
                  }),
                );
                stats.checklistItems += clDef.items.length;
              }

              // --- yorumlar ---
              for (const m of c.cm ?? []) {
                const at = workTimeDaysAgo(m.daysAgo);
                const [comment] = await tx
                  .insert(comments)
                  .values({ cardId: card.id, authorId: ids[m.by], body: plainDoc(m.text), createdAt: at, updatedAt: at })
                  .returning({ id: comments.id });
                if (!comment) continue;
                stats.comments++;
                activityRows.push({
                  workspaceId: workspace.id,
                  boardId: board.id,
                  cardId: card.id,
                  actorId: ids[m.by],
                  type: 'comment.created',
                  payload: { commentId: comment.id, cardId: card.id, commentPreview: m.text.slice(0, 140) },
                  createdAt: at,
                });
              }

              // --- ekler ---
              for (const key of c.att ?? []) {
                const file = files[key];
                if (!file) continue;
                const uploader = c.a?.[0] ?? 'ben';
                const at = workTimeDaysAgo(Math.max(1, Math.min(createdDays - 1, rndInt(2, 10))));
                const [att] = await tx
                  .insert(attachments)
                  .values({
                    cardId: card.id,
                    boardId: board.id,
                    uploaderId: ids[uploader],
                    storageKey: file.storageKey,
                    fileName: file.fileName,
                    mimeType: file.mimeType,
                    size: file.size,
                    committedAt: at,
                    createdAt: at,
                  })
                  .returning({ id: attachments.id });
                if (!att) continue;
                stats.attachments++;
                activityRows.push({
                  workspaceId: workspace.id,
                  boardId: board.id,
                  cardId: card.id,
                  actorId: ids[uploader],
                  type: 'attachment.added',
                  payload: { attachmentId: att.id, cardId: card.id, fileName: file.fileName },
                  createdAt: at,
                });
              }
            }
          }
        }
      }

      for (let i = 0; i < activityRows.length; i += 500) {
        await tx.insert(activityEvents).values(activityRows.slice(i, i + 500));
      }
      stats.activities = activityRows.length;

      await tx.insert(quickNotes).values(
        QUICK_NOTES.map((content, i) => ({ userId: ownerId, content, createdAt: daysAgo(i + 1), updatedAt: daysAgo(i + 1) })),
      );

      await seedNotifications(tx, { ids, built, now, daysAgo, hoursAgo });
    });

    let searchDocs = 0;
    for (const workspaceId of workspaceIds) {
      searchDocs += (await syncSearchDocumentsForScope(db, { workspaceId })).upserted;
    }

    console.warn(
      `[seed] İnceleme verisi hazır. Giriş: ${MAIN_EMAIL}\n` +
        `       ${workspaceIds.length} çalışma alanı, ${stats.boards} pano, ${stats.lists} liste, ${stats.cards} kart, ` +
        `${stats.comments} yorum, ${stats.checklistItems} kontrol maddesi, ${stats.attachments} ek, ` +
        `${stats.activities} aktivite. Arama indeksi: ${searchDocs} belge.`,
    );
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Bildirimler — ana kullanıcıya
// ---------------------------------------------------------------------------

interface NotifCtx {
  ids: Record<PersonKey, string>;
  built: BuiltCard[];
  now: Date;
  daysAgo: (n: number) => Date;
  hoursAgo: (n: number) => Date;
}

async function seedNotifications(tx: Tx, ctx: NotifCtx): Promise<void> {
  const { ids, built } = ctx;
  const card = (title: string) => {
    const found = built.find((c) => c.title === title);
    if (!found) throw new Error(`bildirim kartı bulunamadı: ${title}`);
    return found;
  };

  type Row = typeof notifications.$inferInsert;
  const rows: Row[] = [];
  const push = (
    type: Row['type'],
    activityType: string,
    actor: PersonKey | null,
    c: BuiltCard,
    createdAt: Date,
    readAt: Date | null,
    extra: Record<string, unknown> = {},
    withCard = true,
  ) => {
    rows.push({
      id: nanoid(),
      recipientId: ids.ben,
      actorId: actor ? ids[actor] : null,
      type,
      workspaceId: c.workspaceId,
      boardId: c.boardId,
      cardId: withCard ? c.id : null,
      payload: {
        activityType,
        notificationType: type,
        ...(actor
          ? { actorUserId: ids[actor], actorName: PEOPLE[actor].name, actorImage: avatarUrl(PEOPLE[actor].avatar) }
          : {}),
        workspaceId: c.workspaceId,
        workspaceName: c.workspaceName,
        boardId: c.boardId,
        boardName: c.boardTitle,
        ...(withCard ? { cardId: c.id, cardTitle: c.title } : {}),
        ...extra,
      },
      readAt,
      createdAt,
    });
  };

  const full = card(FULL_CARD_TITLE);
  push('card_assigned', 'card.member_added', 'mem', full, ctx.daysAgo(6), ctx.daysAgo(5));
  push('card_moved', 'card.moved', 'yazi', card('Hükümet Konağı dış cephe giydirme işi'), ctx.daysAgo(4), ctx.daysAgo(3), {
    fromListTitle: 'Proje ve Keşif',
    toListTitle: 'İhale Aşamasında',
  });
  push('board_member_added', 'board.member_added', 'yazi', full, ctx.daysAgo(3), ctx.daysAgo(3), { role: 'member' }, false);
  push('comment_reply', 'comment.created', 'muhtar', full, ctx.daysAgo(3), ctx.daysAgo(2), {
    commentId: nanoid(),
    commentPreview: 'Kitap bağışı için mahalle muhtarlıklarında toplama kutusu kurabiliriz.',
  });
  push('due_overdue', 'due_overdue', null, card('Afet ve acil durum koordinasyon planının güncellenmesi'), ctx.daysAgo(1), null, {
    dueAt: ctx.daysAgo(2).toISOString(),
  });
  push('card_completed', 'card.completed', 'mem', card('Çocuk kütüphanesi mobilyalarının geçici kabulü'), ctx.hoursAgo(26), null);
  push('attachment_added', 'attachment.added', 'yazi', card('Kaymakamlık lojmanı yapım işi'), ctx.hoursAgo(20), null, {
    attachmentId: nanoid(),
    fileName: PDF_DOCS.hakedis.fileName,
  });
  push('checklist_item_completed', 'checklist.item_checked', 'tarim', card('Soğuk zincir süt toplama merkezi projesi'), ctx.hoursAgo(9), null, {
    checklistId: nanoid(),
    checklistItemId: nanoid(),
    content: 'Tank kapasitelerinin hesaplanması',
  });
  push('card_due_changed', 'card.due_set', 'gsb', card('Doğa yürüyüşü ve kamp organizasyonu'), ctx.hoursAgo(5), null, {
    fromDueAt: ctx.daysAgo(-10).toISOString(),
    dueAt: ctx.daysAgo(-13).toISOString(),
  });
  push('comment_reply', 'comment.created', 'muhtar', card('Kış tedbirleri: kar mücadelesi ekip ve araç planı'), ctx.hoursAgo(3), null, {
    commentId: nanoid(),
    commentPreview: 'Öncelikli köy yolu listesini muhtarlardan topladım, karta ekleyeceğim.',
  });
  push('mention', 'comment.mentioned', 'yazi', full, new Date(ctx.now.getTime() - 40 * 60 * 1000), null, {
    commentId: nanoid(),
    mentionedUserId: ids.ben,
    mentionText: `@${MAIN_NAME}`,
    commentPreview: `@${MAIN_NAME} açılış için protokol listesinin taslağını hazırladım, uygun görürseniz kesinleştirelim.`,
  });

  await tx.insert(notifications).values(rows);
}

main().catch((err) => {
  console.error('[seed] inceleme seed başarısız:', err);
  process.exitCode = 1;
});
