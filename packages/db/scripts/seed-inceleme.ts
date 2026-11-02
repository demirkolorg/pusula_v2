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
 *     Avatarlar MinIO `avatars/*` (public) altına yüklenir — web CSP'si
 *     `img-src`'i yalnız `s3.pusulaportal.com` ile sınırlar.
 *   - 3 çalışma alanı: Örnek İlçe Kaymakamlığı · Ortak Projeler · Özel Kalem.
 *   - 6 pano; kartlarda kapak fotoğrafı, açıklama, iç içe (3 seviye) kontrol
 *     listesi, madde yorumu/eki, kart yorumu, etiket, sorumlu, son tarih ve ek
 *     (örnek PDF / saha fotoğrafı) alanları el ile yazılmıştır.
 *   - Geriye tarihli `activity_events` (oluşturma / taşıma / tamamlama / yorum /
 *     ek) → pano raporları boş görünmez.
 *   - Ana kullanıcıya örnek bildirimler + birkaç hızlı not.
 *   - Tüm demo kullanıcılarında e-posta bildirimi kapalıdır.
 *
 * Fotoğraflar picsum.photos (Unsplash lisanslı) sabit id'lerinden gelir.
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
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
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
  /** Avatar arka plan rengi (hex, # olmadan). */
  color: string;
}

const PEOPLE: Record<PersonKey, Person> = {
  ben: { name: MAIN_NAME, email: MAIN_EMAIL, avatar: 'İnceleme Hesabı', color: '1e3a8a' },
  yazi: { name: 'Yazı İşleri Md. (Demo)', email: 'demo.yaziisleri@pusulaportal.com', avatar: 'Yazı İşleri', color: '0f766e' },
  mem: { name: 'İlçe Milli Eğitim Md. (Demo)', email: 'demo.milliegitim@pusulaportal.com', avatar: 'Milli Eğitim', color: '7c3aed' },
  gsb: { name: 'Gençlik ve Spor İlçe Md. (Demo)', email: 'demo.genclikspor@pusulaportal.com', avatar: 'Gençlik Spor', color: 'b45309' },
  tarim: { name: 'İlçe Tarım ve Orman Md. (Demo)', email: 'demo.tarim@pusulaportal.com', avatar: 'Tarım Orman', color: '4d7c0f' },
  sydv: { name: 'SYDV Müdürlüğü (Demo)', email: 'demo.sydv@pusulaportal.com', avatar: 'Sosyal Yardım', color: 'be123c' },
  muftu: { name: 'İlçe Müftülüğü (Demo)', email: 'demo.muftuluk@pusulaportal.com', avatar: 'Müftülük', color: '0369a1' },
  muhtar: { name: 'Muhtarlar Derneği (Demo)', email: 'demo.muhtarlar@pusulaportal.com', avatar: 'Muhtarlar', color: '9a3412' },
};

const PERSON_KEYS = Object.keys(PEOPLE) as PersonKey[];
const ALL_EMAILS = Object.values(PEOPLE).map((p) => p.email);

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

/** Düz metni Tiptap doc'una çevirir — her satır bir paragraf. */
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
// Ekler — örnek PDF'ler (script içinde üretilir) + saha fotoğrafları
// ---------------------------------------------------------------------------

const PDF_DOCS = {
  teklif: {
    fileName: 'mobilya-teklif-karsilastirma-ornek.pdf',
    title: 'Cocuk Kutuphanesi - Mobilya Teklif Karsilastirmasi',
    lines: [
      'Firma A (ornek) ........ Raf + masa + minder seti',
      'Firma B (ornek) ........ Raf + masa seti',
      'Firma C (ornek) ........ Raf + masa + minder + aydinlatma',
      '',
      'Degerlendirme: Firma C kapsam olarak ihtiyaci tam karsilamaktadir.',
    ],
  },
  ihtiyac: {
    fileName: 'kutuphane-ihtiyac-listesi-ornek.pdf',
    title: 'Cocuk Kutuphanesi - Ihtiyac Listesi',
    lines: ['12 adet kitap rafi', '6 adet okuma masasi', '30 adet minder', '2 adet bilgisayar masasi'],
  },
  tutanak: {
    fileName: 'kurum-amirleri-toplanti-tutanagi-ornek.pdf',
    title: 'Kurum Amirleri Toplantisi Tutanagi',
    lines: [
      '1. Kis tedbirleri ve kar mucadelesi ekip plani gorusuldu.',
      '2. Is makinelerinin bakimlari ay sonuna kadar tamamlanacak.',
      '3. Koy yollari oncelik sirasi muhtarlarla birlikte belirlenecek.',
      '4. Resmi bayram programi gorev dagilimi kesinlesti.',
    ],
  },
  muhtarTutanak: {
    fileName: 'muhtarlar-toplantisi-notlari-ornek.pdf',
    title: 'Muhtarlar Toplantisi Notlari',
    lines: [
      '1. Koy yollarindaki menfez ihtiyaclari listelenecek.',
      '2. Icme suyu kalite kontrol takvimi paylasildi.',
      '3. Muhtarlik talepleri portal uzerinden takip edilecek.',
    ],
  },
  ilan: {
    fileName: 'dis-cephe-ihale-ilani-ornek.pdf',
    title: 'Hukumet Konagi Dis Cephe Giydirme Isi - Ihale Ilani',
    lines: ['Ihale usulu: Acik ihale', 'Isin suresi: Yer tesliminden itibaren 120 takvim gunu', 'Gercek bir ihale ilani degildir.'],
  },
  sartname: {
    fileName: 'ups-teknik-sartname-ornek.pdf',
    title: 'Kesintisiz Guc Kaynagi - Teknik Sartname',
    lines: ['Guc: 10 kVA, cevrimici (online)', 'Aku suresi: tam yukte en az 15 dakika', 'Garanti: en az 2 yil'],
  },
  hakedis: {
    fileName: 'lojman-hakedis-ozeti-ornek.pdf',
    title: 'Kaymakamlik Lojmani - Hakedis Ozeti',
    lines: [
      'Kaba insaat ................ tamamlandi',
      'Cati ve yalitim ............ tamamlandi',
      'Tesisat .................... devam ediyor',
      'Fiziki gerceklesme ......... yaklasik %65',
    ],
  },
  kesif: {
    fileName: 'kultur-merkezi-kesif-raporu-ornek.pdf',
    title: 'Kultur Merkezi Modernizasyonu - Kesif Raporu',
    lines: ['Salon kapasitesi: 250 kisi', 'Ses sistemi: yenilenmeli', 'Isik sistemi: kismi yenileme', 'Koltuklar: bakim gerekli'],
  },
  eylem: {
    fileName: 'ilce-eylem-plani-taslagi-ornek.pdf',
    title: 'Ilce Stratejik Eylem Plani - Taslak',
    lines: [
      'Hedef 1: Egitim altyapisinin guclendirilmesi',
      'Hedef 2: Kirsal kalkinma ve uretici destegi',
      'Hedef 3: Sosyal destek hizmetlerinin yayginlastirilmasi',
      'Hedef 4: Kultur, sanat ve spor faaliyetleri',
    ],
  },
  afet: {
    fileName: 'afet-koordinasyon-plani-ornek.pdf',
    title: 'Afet ve Acil Durum Koordinasyon Plani',
    lines: ['Toplanma alanlari: 6 nokta (ornek)', 'Kurum irtibat listesi: guncellendi', 'Tatbikat: planlaniyor'],
  },
  faaliyet: {
    fileName: 'faaliyet-raporu-taslak-ornek.pdf',
    title: '2026 Yili Faaliyet Raporu - Taslak Icindekiler',
    lines: ['1. Genel bilgiler', '2. Yatirimlar', '3. Egitim ve kultur', '4. Sosyal destek', '5. Degerlendirme'],
  },
  program: {
    fileName: 'doga-yuruyusu-programi-ornek.pdf',
    title: 'Doga Yuruyusu ve Kamp - Etkinlik Programi',
    lines: ['08:00 Toplanma ve kayit', '09:00 Yuruyus baslangici', '13:00 Ogle yemegi', '16:00 Kapanis'],
  },
  yakacak: {
    fileName: 'yakacak-ihtiyac-ozeti-ornek.pdf',
    title: 'Kis Donemi Yakacak Ihtiyac Ozeti',
    lines: ['Tespit edilen hane sayisi: ornek veri', 'Kisisel veri icermez; yalnizca toplam sayilar.'],
  },
  egitim: {
    fileName: 'hizmet-ici-egitim-takvimi-ornek.pdf',
    title: 'Hizmet Ici Egitim Takvimi',
    lines: ['Ocak: Resmi yazisma', 'Subat: Pusula Portal kullanimi', 'Mart: Afet farkindaligi'],
  },
} satisfies Record<string, { fileName: string; title: string; lines: string[] }>;

type PdfKey = keyof typeof PDF_DOCS;

/** Fotoğraf eki: [picsum id, dosya adı]. */
type Photo = [number, string];

/** Tek sayfalık, yalnız ASCII metinli minimal PDF üretir (Helvetica). */
function buildPdf(title: string, lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const all = [
    'ORNEK BELGE - PUSULA PORTAL INCELEME HESABI',
    'Ornek Ilce Kaymakamligi (Demo)',
    '',
    title,
    '',
    ...lines,
    '',
    'Bu belge kurgusaldir; gercek kurum, kisi veya tutar icermez.',
  ];
  const stream = ['BT', '/F1 12 Tf', '18 TL', '60 780 Td', ...all.map((l, i) => `${i === 0 ? '' : 'T* '}(${esc(l)}) Tj`), 'ET'].join('\n');
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

// ---------------------------------------------------------------------------
// Pano içerikleri (el ile yazılmış)
// ---------------------------------------------------------------------------

interface SeedComment {
  by: PersonKey;
  text: string;
  daysAgo: number;
}

/** Kontrol listesi maddesi — `sub` ile en fazla 3 seviye iç içe. */
interface CItem {
  t: string;
  done?: boolean;
  sub?: CItem[];
  cm?: SeedComment[];
  pdf?: PdfKey;
  photo?: Photo;
}

const I = (t: string, done = false, extra: Omit<CItem, 't' | 'done'> = {}): CItem => ({ t, done, ...extra });
const C = (by: PersonKey, daysAgo: number, text: string): SeedComment => ({ by, daysAgo, text });

interface SeedCard {
  t: string;
  /** Düz metin açıklama ya da `richDoc` çıktısı (JSON string, `{` ile başlar). */
  d?: string;
  /** Son tarih: bugünden +gün (negatif = gecikmiş). Tamamlanan kartlarda yok sayılır. */
  due?: number;
  labels?: string[];
  a?: PersonKey[];
  w?: PersonKey[];
  /** Renk kapağı (görsel kapak yoksa). */
  cover?: string;
  /** Görsel kapak: picsum id. */
  img?: number;
  cl?: { title: string; items: CItem[] }[];
  cm?: SeedComment[];
  pdf?: PdfKey[];
  photos?: Photo[];
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
const ALL_INSTITUTIONS: PersonKey[] = ['yazi', 'mem', 'gsb', 'tarim', 'sydv', 'muftu', 'muhtar'];

const WORKSPACES: SeedWorkspace[] = [
  // =========================================================================
  {
    name: 'Örnek İlçe Kaymakamlığı (Demo)',
    slug: 'demo-inceleme-kaymakamlik',
    icon: 'building',
    members: ALL_INSTITUTIONS,
    boards: [
      // ---------------------------------------------------------------------
      {
        title: 'İlçe Proje Takip Panosu',
        icon: 'clipboard-list',
        background: 'gradient:trello-ocean',
        flow: false,
        members: ALL_INSTITUTIONS,
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
                      'Kartları açarak açıklama, alt maddeli kontrol listesi, yorum, etiket, sorumlu, son tarih ve ek alanları',
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
                img: 180,
                due: 12,
                labels: ['Kurumlar Arası'],
                a: ['ben', 'yazi'],
                w: ['mem'],
                pdf: ['eylem'],
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
                      I('Kurumlardan katkı yazılarının istenmesi', true),
                      I('Gelen katkıların tek tabloda birleştirilmesi', true, {
                        sub: [
                          I('Milli Eğitim katkısı', true),
                          I('Tarım ve Orman katkısı', true),
                          I('Gençlik ve Spor katkısı', false, {
                            cm: [C('gsb', 2, 'Katkı yazımız bu hafta içinde gönderilecek.')],
                          }),
                        ],
                      }),
                      I('Taslak eylem planının hazırlanması', false, { pdf: 'eylem' }),
                      I('Kurum amirleri toplantısında görüşülmesi'),
                      I('Nihai metnin makam onayına sunulması'),
                    ],
                  },
                ],
                cm: [
                  C('yazi', 6, 'Yedi kurumdan beşinin katkı yazısı geldi, ikisi bu hafta içinde gönderecek.'),
                  C('mem', 5, 'Eğitim hedeflerimizi tabloya ekledik; derslik ihtiyacını ayrıca vurguladık.'),
                  C('ben', 4, 'Taslak, bir sonraki kurum amirleri toplantısının gündemine alınsın.'),
                ],
              },
              {
                t: 'Afet ve acil durum koordinasyon planının güncellenmesi',
                img: 442,
                due: -2,
                labels: ['Öncelikli', 'Kurumlar Arası'],
                a: ['ben'],
                w: ['yazi', 'sydv'],
                pdf: ['afet'],
                d: 'Kış dönemi öncesinde afet ve acil durum koordinasyon planındaki irtibat listeleri, toplanma alanları ve kurum görev dağılımı güncellenecektir.\n\nKurumlardan güncel irtibat bilgileri istenmiş olup iki kurumun dönüşü beklenmektedir.',
                cl: [
                  {
                    title: 'Güncelleme',
                    items: [
                      I('Kurum irtibat listelerinin güncellenmesi', true),
                      I('Toplanma alanlarının yerinde kontrolü', false, {
                        sub: [I('Merkez mahalle (2 alan)', true), I('Köy toplanma alanları', false)],
                      }),
                      I('Tatbikat tarihinin belirlenmesi'),
                    ],
                  },
                ],
                cm: [
                  C('sydv', 3, 'Barınma ve gıda stok bilgilerimizi plana işledik.'),
                  C('ben', 1, 'Son tarih geçti; kalan iki kurumla bugün görüşelim lütfen.'),
                ],
              },
              {
                t: 'Kurumsal kimlik ve tanıtım materyallerinin yenilenmesi',
                img: 464,
                due: 20,
                labels: ['Sosyal Fayda'],
                a: ['yazi'],
                cm: [C('yazi', 4, 'Logo ve renk kılavuzunun taslağı hazır; broşür tasarımına geçiyoruz.')],
              },
              {
                t: '2026 yılı faaliyet raporunun derlenmesi',
                img: 20,
                due: 30,
                a: ['yazi'],
                pdf: ['faaliyet'],
                cl: [
                  {
                    title: 'Rapor',
                    items: [
                      I('Kurumlardan faaliyet verilerinin istenmesi', true),
                      I('Fotoğraf arşivinin seçilmesi', false, {
                        sub: [I('Yatırım fotoğrafları', true), I('Etkinlik fotoğrafları')],
                      }),
                      I('Taslak metnin yazılması'),
                      I('Baskı öncesi son okuma'),
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
                img: 553,
                due: 15,
                labels: ['Yatırım'],
                a: ['yazi'],
                photos: [[785, 'fidan-teslimi-ornek.jpg']],
                d: 'Hükümet Konağı ön bahçesinde yürüyüş yolu, oturma alanları ve sulama hattını kapsayan peyzaj düzenlemesi yapılacaktır.\n\nÇalışmanın bahar dikim dönemine yetiştirilmesi planlanmaktadır.',
                cl: [
                  {
                    title: 'İş Adımları',
                    items: [
                      I('Keşif ve metraj', true),
                      I('Fidan ve malzeme temini', true, {
                        sub: [I('Fidanlar', true, { photo: [785, 'fidanlar-ornek.jpg'] }), I('Bank ve çöp kutuları', true)],
                      }),
                      I('Sulama hattının döşenmesi'),
                      I('Çim ekimi ve son kontrol'),
                    ],
                  },
                ],
                cm: [C('yazi', 3, 'Fidanlar teslim alındı, fotoğrafını ekledim.')],
              },
              {
                t: 'Arşiv odasındaki evrakın dijital arşive aktarılması',
                img: 998,
                labels: ['Kurumlar Arası'],
                a: ['yazi'],
                due: 40,
                cl: [
                  {
                    title: 'Aktarım',
                    items: [
                      I('Evrakın yıllara göre ayrılması', true),
                      I('Taranacak klasörlerin listelenmesi', false, {
                        sub: [I('2020–2022 klasörleri', true), I('2023–2025 klasörleri')],
                      }),
                      I('Taramaların portala yüklenmesi'),
                    ],
                  },
                ],
              },
              {
                t: 'Kesintisiz güç kaynağı (UPS) alımı',
                due: 8,
                labels: ['İhale'],
                a: ['yazi'],
                pdf: ['sartname'],
                d: 'Hizmet binasındaki sunucu ve iletişim cihazları için kesintisiz güç kaynağı alınacaktır. Teknik şartname hazırlanmış, piyasa fiyat araştırması sürmektedir.',
                cm: [C('yazi', 2, 'Teknik şartnameyi ekledim; üç firmadan fiyat istendi.')],
              },
              { t: 'Hizmet binası dış cephe bakım ve onarımı', labels: ['Yatırım', 'Beklemede'] },
            ],
          },
          {
            ...L('Milli Eğitim', 'mor', 'lightbulb'),
            cards: [
              {
                t: FULL_CARD_TITLE,
                img: 24,
                due: 5,
                labels: ['Sosyal Fayda', 'Kurumlar Arası'],
                a: ['mem', 'ben'],
                w: ['yazi', 'muhtar'],
                pdf: ['teklif', 'ihtiyac'],
                photos: [
                  [1073, 'bagis-kitaplar-ornek.jpg'],
                  [625, 'okuma-salonu-ornek.jpg'],
                ],
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
                      I('İhtiyaç listesinin çıkarılması', true, { pdf: 'ihtiyac' }),
                      I('Raf ve masa ölçülerinin alınması', true),
                      I('Mobilya tekliflerinin toplanması', true, {
                        pdf: 'teklif',
                        sub: [I('Firma A teklifi', true), I('Firma B teklifi', true), I('Firma C teklifi', true)],
                        cm: [C('mem', 5, 'Üç teklif de geldi; karşılaştırma tablosu bu maddeye eklendi.')],
                      }),
                      I('Kitap bağışı kampanyasının duyurulması', false, {
                        sub: [
                          I('Afiş ve duyuru metni', true),
                          I('Toplama noktaları', false, {
                            sub: [I('Muhtarlıklar', false), I('Okullar', true)],
                          }),
                        ],
                        cm: [C('muhtar', 3, 'Mahalle muhtarlıklarında toplama kutusu kurabiliriz.')],
                      }),
                      I('Okuma köşesinin düzenlenmesi'),
                      I('Açılış programının planlanması'),
                    ],
                  },
                  {
                    title: 'Açılış Hazırlığı',
                    items: [
                      I('Davetli listesinin hazırlanması', false, {
                        sub: [I('Kurum amirleri'), I('Okul müdürleri'), I('Veliler')],
                      }),
                      I('Protokol düzeninin belirlenmesi'),
                      I('Basın duyurusunun yazılması'),
                    ],
                  },
                ],
                cm: [
                  C('mem', 6, 'Raf ve masa ölçüleri alındı; salon 30 çocuğu rahat ağırlıyor.'),
                  C('mem', 5, 'Üç firmadan mobilya teklifi alındı; karşılaştırma tablosunu ekledim.'),
                  C('muhtar', 3, 'Kitap bağışı için mahalle muhtarlıklarında toplama kutusu kurabiliriz.'),
                  C('ben', 2, 'Firma C’nin kapsamı uygun görünüyor; geçici kabul sonrası açılış tarihini belirleyelim.'),
                  C('yazi', 1, `@${MAIN_NAME} açılış için protokol listesinin taslağını hazırladım, uygun görürseniz kesinleştirelim.`),
                ],
              },
              {
                t: 'Öğretmenevi tadilat ve tefriş işi',
                img: 625,
                due: 25,
                labels: ['Yatırım'],
                a: ['mem'],
                photos: [[284, 'tadilat-malzeme-ornek.jpg']],
                cl: [
                  {
                    title: 'Tadilat',
                    items: [
                      I('Oda ve banyoların keşfi', true),
                      I('Boya ve zemin yenileme', false, {
                        sub: [I('Zemin kaplaması', true), I('Boya'), I('Kapı ve pencere bakımı')],
                      }),
                      I('Mobilya ve tekstil tefrişi'),
                    ],
                  },
                ],
                cm: [C('mem', 4, 'Zemin kaplaması bitti, boya işine pazartesi başlanacak.')],
              },
              {
                t: 'Okullarda kış dönemi yakıt ihtiyacının tespiti',
                img: 571,
                due: 2,
                labels: ['Öncelikli'],
                a: ['mem'],
                d: 'Merkez ve köy okullarının kış dönemi yakıt ihtiyacı okul müdürlüklerinden alınan bilgilerle tabloya işlenecektir.',
                cl: [
                  {
                    title: 'Tespit',
                    items: [I('Merkez okullar', true), I('Köy okulları', false, { sub: [I('Kuzey köyleri', true), I('Güney köyleri')] })],
                  },
                ],
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
                img: 453,
                labels: ['Sosyal Fayda'],
                a: ['gsb', 'yazi'],
                due: 18,
                d: 'Müzik, resim, tiyatro ve fotoğraf atölyelerinden oluşan bir kulüp yapısı kurulacaktır. Atölye eğitmenleri gönüllülük esasıyla belirlenecektir.',
                cl: [
                  {
                    title: 'Atölyeler',
                    items: [
                      I('Müzik atölyesi', true, { sub: [I('Eğitmen belirlendi', true), I('Enstrüman envanteri')] }),
                      I('Resim atölyesi', true),
                      I('Tiyatro atölyesi'),
                      I('Fotoğraf atölyesi'),
                    ],
                  },
                ],
                cm: [C('gsb', 5, 'Müzik ve resim atölyeleri için 42 başvuru aldık.')],
              },
              {
                t: 'İlçe bülteninin aylık yayına hazırlanması',
                img: 885,
                a: ['yazi'],
                due: 9,
                cm: [C('yazi', 2, 'Kasım sayısının haber başlıkları belirlendi.')],
              },
              {
                t: 'Kültür merkezi ses ve ışık sisteminin yenilenmesi',
                img: 158,
                labels: ['Yatırım', 'İhale'],
                a: ['gsb'],
                pdf: ['kesif'],
              },
              { t: 'Halk oyunları ekibi için kostüm temini', a: ['gsb'] },
            ],
          },
          {
            ...L('Tarım & Hayvancılık', 'yesil', 'target'),
            cards: [
              {
                t: 'Soğuk zincir süt toplama merkezi projesi',
                img: 200,
                due: 21,
                labels: ['Yatırım', 'Kurumlar Arası'],
                a: ['tarim', 'muhtar'],
                w: ['ben'],
                photos: [[699, 'mera-ziyareti-ornek.jpg']],
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
                      I('Toplama noktalarının belirlenmesi', true, {
                        sub: [I('Kuzey toplama noktası', true), I('Merkez toplama noktası', true), I('Güney toplama noktası', true)],
                      }),
                      I('Tank kapasitelerinin hesaplanması', true),
                      I('Hibe başvuru dosyasının hazırlanması', false, {
                        cm: [C('tarim', 7, 'Üretici listesi tamamlandı; dosyaya fizibilite eklenecek.')],
                      }),
                      I('Üretici eğitim takvimi'),
                    ],
                  },
                ],
                cm: [
                  C('tarim', 7, 'Hibe başvuru dosyası için üretici listesi tamamlandı.'),
                  C('muhtar', 4, 'Güney toplama noktası için köy konağının yanı uygun, muhtar onayladı.'),
                ],
              },
              { t: 'Çiftçilere yem bitkisi tohumu dağıtımı', img: 729, due: 10, a: ['tarim'] },
              { t: 'Mera ıslahı ve hayvan içme suyu göletleri', img: 699, labels: ['Beklemede'], a: ['tarim'] },
              {
                t: 'Arıcılık eğitim programı',
                img: 312,
                a: ['tarim'],
                due: 35,
                cm: [C('tarim', 3, 'Eğitime 25 üretici kaydoldu; uygulamalı ders için arılık belirlendi.')],
              },
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
                cover: 'kirmizi',
                labels: ['Öncelikli'],
                a: ['muftu', 'ben'],
                cl: [
                  {
                    title: 'Düzenleme',
                    items: [
                      I('Çevre duvarı ve yürüyüş yolu onarımı', true),
                      I('Bayrak ve direklerin yenilenmesi'),
                      I('Peyzaj ve aydınlatma'),
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
              {
                t: 'Aşevi kurulumu ve hizmete açılması',
                img: 490,
                labels: ['Sosyal Fayda'],
                a: ['sydv'],
                cm: [C('sydv', 9, 'Aşevi günlük 150 kişilik kapasiteyle hizmete açıldı.')],
              },
              { t: 'Hastane helikopter pisti yapım işi', labels: ['Yatırım'], a: ['yazi'] },
              { t: 'Jandarma yerleşkesi halı saha onarımı', img: 1058, a: ['gsb'] },
              { t: 'Vardiya yatakhanesinin kütüphaneye dönüştürülmesi', labels: ['Sosyal Fayda'], a: ['mem'] },
              { t: 'İlçe futbol turnuvası organizasyonu', img: 840, a: ['gsb'] },
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
        members: ALL_INSTITUTIONS,
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
                img: 964,
                due: 6,
                labels: ['Talimat'],
                a: ['ben', 'yazi'],
                w: ['muhtar'],
                pdf: ['tutanak'],
                photos: [[559, 'kar-yolu-kontrol-ornek.jpg']],
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
                      I('İş makinelerinin bakımı', true, {
                        sub: [I('Greyderler', true), I('Kepçeler', true), I('Tuz serpme aracı', true)],
                      }),
                      I('Nöbet listesinin hazırlanması', true),
                      I('Köy yollarının öncelik sıralaması', false, {
                        cm: [C('muhtar', 2, 'Okul ve sağlık ocağı güzergâhları birinci öncelik olarak işaretlendi.')],
                      }),
                      I('Muhtarlarla iletişim kanalının oluşturulması'),
                    ],
                  },
                ],
                cm: [
                  C('yazi', 4, 'Toplantı tutanağını ekledim; nöbet listesi kurumlara gönderildi.'),
                  C('muhtar', 2, 'Öncelikli köy yolu listesini muhtarlardan topladım, karta ekleyeceğim.'),
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
                img: 335,
                labels: ['Takipte'],
                a: ['muhtar'],
                due: 16,
                pdf: ['muhtarTutanak'],
                cl: [
                  {
                    title: 'Listeleme',
                    items: [
                      I('Menfez ihtiyacı', true, { sub: [I('Kuzey köyleri', true), I('Güney köyleri', true)] }),
                      I('Stabilize ihtiyacı', false, { sub: [I('Kuzey köyleri', true), I('Güney köyleri')] }),
                    ],
                  },
                ],
              },
              {
                t: 'Köylerde içme suyu kalite kontrollerinin yapılması',
                img: 466,
                labels: ['Talimat'],
                a: ['muhtar', 'tarim'],
                due: 11,
              },
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
                cl: [
                  {
                    title: 'İletilecek talimatlar',
                    items: [
                      I('Kış tedbirleri → Yazı İşleri', true),
                      I('Okul güvenliği → Milli Eğitim', true),
                      I('Sosyal destek başvuruları → SYDV'),
                    ],
                  },
                ],
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
              {
                t: 'Okul servis araçlarının denetimi',
                due: 4,
                labels: ['Talimat'],
                a: ['mem'],
                cm: [C('mem', 1, '18 aracın 14’ü denetlendi; kalan araçlar perşembe.')],
              },
              { t: 'Pazar yeri düzenlemesi ve denetim', labels: ['Takipte'], a: ['yazi'] },
              {
                t: 'Kamu binalarında erişilebilirlik eksiklerinin giderilmesi',
                img: 240,
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
              { t: 'Hizmet içi eğitim takviminin belirlenmesi', labels: ['Karar'], a: ['yazi'], pdf: ['egitim'] },
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
              { t: 'İlkokul bahçesine çok amaçlı saha yapımı', img: 820, a: ['mem'] },
              { t: 'Merkez mahallede yağmur suyu kanalı', labels: ['Kritik'], a: ['yazi'], due: 30 },
              { t: 'Mezarlık çevre duvarının yenilenmesi', a: ['muftu'] },
            ],
          },
          {
            ...L('Proje ve Keşif', 'sky', 'layers', 'mavi'),
            cards: [
              {
                t: 'Kültür merkezi modernizasyonu keşif çalışması',
                img: 117,
                labels: ['Keşif'],
                a: ['gsb'],
                due: 12,
                pdf: ['kesif'],
                cm: [C('gsb', 3, 'Keşif raporu hazır; ses sistemi öncelikli yenilenmeli.')],
              },
              { t: 'Öğretmenevi ek bina dönüşüm projesi', labels: ['Keşif'], a: ['mem'], due: 17 },
              { t: 'Köy konağı onarım keşfi', labels: ['Keşif'], a: ['muhtar'] },
            ],
          },
          {
            ...L('İhale Aşamasında', 'turuncu', 'hammer'),
            cards: [
              {
                t: 'Hükümet Konağı dış cephe giydirme işi',
                img: 946,
                due: 10,
                labels: ['İhale', 'Kritik'],
                a: ['yazi'],
                w: ['ben'],
                pdf: ['ilan'],
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
                      I('İhale dokümanının hazırlanması', true, {
                        sub: [I('Teknik şartname', true), I('İdari şartname', true), I('Yaklaşık maliyet', true)],
                      }),
                      I('İlanın yayımlanması', true, { pdf: 'ilan' }),
                      I('Tekliflerin değerlendirilmesi', false, {
                        cm: [C('yazi', 1, 'Komisyon toplantısı salı günü saat 10:00’da.')],
                      }),
                      I('Sözleşmenin imzalanması'),
                      I('Yer tesliminin yapılması'),
                    ],
                  },
                ],
                cm: [C('yazi', 2, 'İlan yayımlandı; dört firma ihale dokümanını indirdi.')],
              },
              { t: 'Kaymakamlık hizmet aracı kiralama', labels: ['İhale'], a: ['yazi'], due: 14 },
              { t: 'Okul bahçe duvarı yapımı', img: 210, labels: ['İhale'], a: ['mem'] },
            ],
          },
          {
            ...L('Uygulamada', 'mor', 'wrench'),
            cards: [
              {
                t: 'Kaymakamlık lojmanı yapım işi',
                img: 514,
                due: 45,
                labels: ['Uygulama'],
                a: ['yazi'],
                pdf: ['hakedis'],
                photos: [
                  [284, 'santiye-malzeme-ornek.jpg'],
                  [437, 'cephe-gorunumu-ornek.jpg'],
                ],
                d: 'Kaba inşaat tamamlanmış, ince işler devam etmektedir. Fiziki gerçekleşme yaklaşık %65 olarak bildirilmiştir.',
                cl: [
                  {
                    title: 'İş Programı',
                    items: [
                      I('Kaba inşaat', true),
                      I('Çatı ve yalıtım', true),
                      I('Elektrik ve mekanik tesisat', false, {
                        sub: [
                          I('Elektrik', true, { sub: [I('Kablolama', true), I('Pano montajı', true)] }),
                          I('Sıhhi tesisat', false),
                          I('Isıtma', false),
                        ],
                      }),
                      I('İnce işler ve boya'),
                      I('Çevre düzenlemesi'),
                    ],
                  },
                ],
                cm: [
                  C('yazi', 6, 'Hakediş özetini ekledim; fiziki gerçekleşme %65.'),
                  C('yazi', 2, 'Şantiye ziyaretinde çekilen fotoğraflar eklendi.'),
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
    members: ALL_INSTITUTIONS,
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
              { t: 'Yaz dönemi bisiklet festivali', img: 1076, labels: ['Spor', 'Tanıtım'], a: ['gsb'] },
              { t: 'Kış sporları tanıtım günü', img: 1036, labels: ['Spor', 'Gençlik'], a: ['gsb'], due: 40 },
              { t: 'Yöresel ürünler ve el sanatları sergisi', img: 674, labels: ['Kültür'], a: ['tarim'] },
              {
                t: 'Okullar arası kitap okuma kampanyası',
                img: 1073,
                labels: ['Kültür', 'Gençlik'],
                a: ['mem'],
                due: 25,
              },
            ],
          },
          {
            ...L('Hazırlık', 'mor', 'timer'),
            cards: [
              {
                t: 'Doğa yürüyüşü ve kamp organizasyonu',
                img: 177,
                due: 13,
                labels: ['Spor', 'Tanıtım'],
                a: ['gsb'],
                w: ['ben'],
                pdf: ['program'],
                photos: [[324, 'parkur-kesfi-ornek.jpg']],
                d: 'Kurumların ortaklığıyla düzenlenecek doğa yürüyüşünde parkur güvenliği, sağlık ekibi ve ulaşım planı birlikte hazırlanacaktır.',
                cl: [
                  {
                    title: 'Hazırlık',
                    items: [
                      I('Parkur keşfi', true, { photo: [324, 'parkur-ornek.jpg'] }),
                      I('Katılımcı kayıt formu', true),
                      I('Güvenlik ve sağlık ekibi planı', false, {
                        sub: [I('Sağlık ekibi', true), I('Arama kurtarma desteği')],
                      }),
                      I('Ulaşım ve konaklama'),
                    ],
                  },
                ],
                cm: [
                  C('gsb', 4, 'Parkur keşfi tamamlandı, fotoğrafları ekledim.'),
                  C('gsb', 2, 'Kayıt formu yayında, ilk gün 40 başvuru geldi.'),
                ],
              },
              { t: 'Gençlik kampı programı', img: 287, labels: ['Gençlik'], a: ['gsb', 'muftu'], due: 21 },
              { t: 'İlçe tanıtım filmi çekimi', img: 319, labels: ['Tanıtım'], a: ['yazi'] },
            ],
          },
          {
            ...L('Kurumlar Arası Koordinasyon', 'turuncu', 'users'),
            cards: [
              { t: 'Festival güvenlik ve sağlık ekiplerinin planlanması', labels: ['Protokol'], a: ['yazi'], due: 8 },
              {
                t: 'Sponsor ve paydaş kurumlarla toplantı',
                labels: ['Protokol'],
                a: ['ben'],
                due: 5,
                cm: [C('yazi', 1, 'Toplantı salonu ayarlandı, davet yazıları gönderildi.')],
              },
            ],
          },
          {
            ...L('Gerçekleşen', 'yesil', 'trophy'),
            done: true,
            cards: [
              { t: 'Futbol turnuvası ödül töreni', img: 1058, labels: ['Spor'], a: ['gsb'] },
              { t: 'Okul tiyatro günleri', img: 452, labels: ['Kültür'], a: ['mem'] },
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
                img: 261,
                due: 9,
                labels: ['Kış Yardımı'],
                a: ['sydv', 'muhtar'],
                pdf: ['yakacak'],
                d: 'Muhtarlıklardan gelen listeler ile hane ziyaretlerinde yapılan tespitler birleştirilecektir. Kişisel veri içeren listeler portala eklenmez; yalnızca hane sayısı ve ilerleme takip edilir.',
                cl: [
                  {
                    title: 'Tespit',
                    items: [
                      I('Muhtarlık listelerinin toplanması', true),
                      I('Hane ziyaretlerinin planlanması', false, {
                        sub: [I('Merkez mahalleler', true), I('Köyler')],
                      }),
                      I('Mütevelli heyeti gündemine alınması'),
                    ],
                  },
                ],
                cm: [C('sydv', 3, 'Muhtarlık listeleri birleştirildi; özet tabloyu ekledim (kişisel veri içermez).')],
              },
              { t: 'Engelli bireylere evde bakım ziyaretleri', labels: ['Yaşlı ve Engelli'], a: ['sydv'] },
              { t: 'Okul kıyafeti desteği başvuruları', labels: ['Eğitim Desteği'], a: ['sydv', 'mem'], due: 15 },
            ],
          },
          {
            ...L('Değerlendirme', 'sari', 'list-checks', 'turuncu'),
            cards: [
              { t: 'Aşevi menü ve kapasite planı', img: 292, labels: ['Gıda'], a: ['sydv'], due: 7 },
              { t: 'Üniversite öğrencilerine burs desteği', img: 832, labels: ['Eğitim Desteği'], a: ['sydv'] },
            ],
          },
          {
            ...L('Uygulamada', 'mor', 'activity'),
            cards: [
              {
                t: 'Gıda kolisi dağıtımı',
                img: 488,
                labels: ['Gıda'],
                a: ['sydv', 'muftu'],
                due: 3,
                cl: [
                  {
                    title: 'Dağıtım',
                    items: [I('Kolilerin hazırlanması', true), I('Merkez dağıtımı', true), I('Köy dağıtımı')],
                  },
                ],
                cm: [C('muftu', 2, 'Gönüllü ekibimiz köy dağıtımına cumartesi katılacak.')],
              },
              { t: 'Yaşlılara sıcak yemek servisi', labels: ['Yaşlı ve Engelli'], a: ['sydv'] },
              { t: 'Güdümlü destek projesi', labels: ['Eğitim Desteği'], a: ['mem', 'sydv'], due: 26 },
            ],
          },
          {
            ...L('Tamamlanan', 'yesil', 'circle-check'),
            done: true,
            cards: [
              { t: 'Kırtasiye seti dağıtımı', img: 533, labels: ['Eğitim Desteği'], a: ['sydv'] },
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
                img: 445,
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
                cl: [
                  {
                    title: 'Hazırlık',
                    items: [I('Gündemin kurumlara gönderilmesi', true), I('Sunum dosyasının hazırlanması'), I('Salon düzeni')],
                  },
                ],
              },
              { t: 'Okul ziyareti ve öğretmenlerle görüşme', img: 193, due: 2, labels: ['Ziyaret'], a: ['ben'] },
              { t: 'Muhtarlarla istişare toplantısı', due: 3, labels: ['Toplantı'], a: ['ben', 'yazi'] },
              { t: 'Hastane ziyareti', due: 4, labels: ['Ziyaret'], a: ['ben'] },
            ],
          },
          {
            ...L('Ziyaret ve Programlar', 'mor', 'users'),
            cards: [
              { t: 'Köy ziyaretleri programı', img: 563, labels: ['Program'], a: ['yazi'], due: 12 },
              { t: 'Şehit ailelerine ziyaret', labels: ['Ziyaret', 'Önemli'], a: ['ben'], due: 6 },
              { t: 'Sivil toplum kuruluşu temsilcileriyle görüşme', labels: ['Toplantı'], a: ['ben'] },
            ],
          },
          {
            ...L('Takip Edilecekler', 'sari', 'pin', 'turuncu'),
            cards: [
              {
                t: 'Valilikten gelen yazıların cevaplanması',
                due: 2,
                labels: ['Takip', 'Önemli'],
                a: ['yazi'],
                cm: [C('yazi', 1, 'Üç yazının cevabı hazır, imzaya sunulacak.')],
              },
              { t: 'Vatandaş taleplerinin ilgili kurumlara iletilmesi', labels: ['Takip'], a: ['yazi'] },
              { t: 'Basın açıklaması metninin hazırlanması', labels: ['Takip'], a: ['yazi'], due: 5 },
            ],
          },
          {
            ...L('Tamamlandı', 'yesil', 'circle-check'),
            done: true,
            cards: [
              { t: 'Cumhuriyet Bayramı kutlama programı', img: 828, labels: ['Program'], a: ['yazi'] },
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
// S3 / MinIO yüklemeleri
// ---------------------------------------------------------------------------

interface UploadedFile {
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
}

const S3_BUCKET = process.env.S3_BUCKET ?? 'pusula';
const S3_PUBLIC_URL = (process.env.S3_PUBLIC_URL ?? process.env.S3_ENDPOINT ?? 'http://localhost:9000').replace(/\/$/, '');

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.S3_REGION ?? 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'pusula',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'pusula-secret',
  },
});

async function putObject(storageKey: string, mimeType: string, body: Uint8Array): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: storageKey, Body: body, ContentType: mimeType, ContentLength: body.byteLength }),
  );
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Eşzamanlılığı sınırlı map (picsum / MinIO'yu boğmamak için). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

interface Uploads {
  pdfs: Map<PdfKey, UploadedFile>;
  photos: Map<string, UploadedFile>;
  covers: Map<number, UploadedFile>;
}

const photoKey = ([id, name]: Photo) => `${id}:${name}`;

/** Kart/madde tanımlarında geçen tüm PDF, fotoğraf ve kapakları toplayıp yükler. */
async function uploadAll(): Promise<Uploads> {
  const pdfKeys = new Set<PdfKey>();
  const photos = new Map<string, Photo>();
  const covers = new Set<number>();
  const walkItems = (items: CItem[]) => {
    for (const it of items) {
      if (it.pdf) pdfKeys.add(it.pdf);
      if (it.photo) photos.set(photoKey(it.photo), it.photo);
      if (it.sub) walkItems(it.sub);
    }
  };
  for (const ws of WORKSPACES)
    for (const b of ws.boards)
      for (const l of b.lists)
        for (const c of l.cards) {
          c.pdf?.forEach((k) => pdfKeys.add(k));
          c.photos?.forEach((p) => photos.set(photoKey(p), p));
          if (c.img != null) covers.add(c.img);
          c.cl?.forEach((cl) => walkItems(cl.items));
        }

  const result: Uploads = { pdfs: new Map(), photos: new Map(), covers: new Map() };
  const tryUpload = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      console.warn(`[seed] yüklenemedi (${label}):`, err instanceof Error ? err.message : err);
    }
  };

  await mapLimit([...pdfKeys], 6, (key) =>
    tryUpload(key, async () => {
      const doc = PDF_DOCS[key];
      const body = buildPdf(doc.title, doc.lines);
      const storageKey = `inceleme/attachments/${nanoid()}-${doc.fileName}`;
      await putObject(storageKey, 'application/pdf', body);
      result.pdfs.set(key, { storageKey, fileName: doc.fileName, mimeType: 'application/pdf', size: body.byteLength });
    }),
  );
  await mapLimit([...photos.values()], 6, (photo) =>
    tryUpload(photo[1], async () => {
      const body = await fetchBytes(`https://picsum.photos/id/${photo[0]}/1400/933`);
      const storageKey = `inceleme/attachments/${nanoid()}-${photo[1]}`;
      await putObject(storageKey, 'image/jpeg', body);
      result.photos.set(photoKey(photo), { storageKey, fileName: photo[1], mimeType: 'image/jpeg', size: body.byteLength });
    }),
  );
  await mapLimit([...covers], 6, (id) =>
    tryUpload(`kapak ${id}`, async () => {
      const body = await fetchBytes(`https://picsum.photos/id/${id}/1200/675`);
      const fileName = `kapak-${id}.jpg`;
      const storageKey = `inceleme/covers/${nanoid()}-${fileName}`;
      await putObject(storageKey, 'image/jpeg', body);
      result.covers.set(id, { storageKey, fileName, mimeType: 'image/jpeg', size: body.byteLength });
    }),
  );
  console.warn(
    `[seed] MinIO: ${result.pdfs.size}/${pdfKeys.size} PDF, ${result.photos.size}/${photos.size} fotoğraf, ` +
      `${result.covers.size}/${covers.size} kapak yüklendi.`,
  );
  return result;
}

/** Avatarı DiceBear'dan alıp public `avatars/{userId}/…` altına koyar; URL döner. */
async function uploadAvatar(userId: string, person: Person): Promise<string | null> {
  const url =
    `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(person.avatar)}` +
    `&size=256&radius=50&backgroundColor=${person.color}&fontWeight=600`;
  try {
    const body = await fetchBytes(url);
    const key = `avatars/${userId}/${randomUUID()}.png`;
    await putObject(key, 'image/png', body);
    return `${S3_PUBLIC_URL}/${S3_BUCKET}/${key}`;
  } catch (err) {
    console.warn(`[seed] avatar yüklenemedi (${person.name}):`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Walker
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

type Tx = Parameters<Parameters<ReturnType<typeof createDb>['db']['transaction']>[0]>[0];

async function ensureUser(
  tx: Tx,
  person: Person,
  id: string,
  image: string | null,
  createdAt: Date,
  password?: string,
): Promise<string> {
  const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, person.email)).limit(1);
  let userId = existing?.id;
  if (!userId) {
    userId = id;
    await tx.insert(users).values({
      id: userId,
      name: person.name,
      email: person.email,
      emailVerified: true,
      image,
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
  await tx.insert(notificationPreferences).values({ userId, emailEnabled: false }).onConflictDoNothing();
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
  /** Saat 09:00–17:00 (TR) arasına oturan geriye tarihli an (mesai görünümü). */
  const workTimeDaysAgo = (n: number) => {
    const d = daysAgo(n);
    d.setUTCHours(6 + rndInt(0, 8), rndInt(0, 59), 0, 0);
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

    // Transaction öncesi: S3 yüklemeleri (rollback'e katılmaz).
    const preIds = Object.fromEntries(PERSON_KEYS.map((k) => [k, nanoid()])) as Record<PersonKey, string>;
    const avatars = Object.fromEntries(
      await Promise.all(PERSON_KEYS.map(async (k) => [k, await uploadAvatar(preIds[k], PEOPLE[k])] as const)),
    ) as Record<PersonKey, string | null>;
    const files = await uploadAll();

    const stats = { boards: 0, lists: 0, cards: 0, comments: 0, checklistItems: 0, attachments: 0, covers: 0, activities: 0 };
    const built: BuiltCard[] = [];
    const workspaceIds: string[] = [];
    const ids = {} as Record<PersonKey, string>;
    const SETUP_DAYS = 120;

    await db.transaction(async (tx) => {
      for (const key of PERSON_KEYS) {
        ids[key] = await ensureUser(
          tx,
          PEOPLE[key],
          preIds[key],
          avatars[key],
          daysAgo(SETUP_DAYS),
          key === 'ben' ? password : undefined,
        );
      }
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
              const itemCommentDays: number[] = [];
              const collectDays = (items: CItem[]) =>
                items.forEach((it) => {
                  it.cm?.forEach((m) => itemCommentDays.push(m.daysAgo));
                  if (it.sub) collectDays(it.sub);
                });
              c.cl?.forEach((cl) => collectDays(cl.items));
              const oldestComment = Math.max(0, ...(c.cm ?? []).map((m) => m.daysAgo), ...itemCommentDays);
              const completedDays = completed ? rndInt(2, 40) : 0;
              const createdDays = Math.max(rndInt(12, 80), oldestComment + 3, completedDays + rndInt(4, 25));
              const createdAt = workTimeDaysAgo(createdDays);
              const completedAt = completed ? workTimeDaysAgo(completedDays) : null;
              const attachedDaysAgo = () => Math.max(1, Math.min(createdDays - 1, rndInt(2, 10)));

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
                  coverColor: c.img != null && files.covers.has(c.img) ? null : (c.cover ?? null),
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

              const activity = (row: Omit<ActivityRow, 'workspaceId' | 'boardId' | 'cardId'>) =>
                activityRows.push({ workspaceId: workspace.id, boardId: board.id, cardId: card.id, ...row });

              /** Ek satırı + `attachment.added` aktivitesi; id döner. */
              const addAttachment = async (
                file: UploadedFile,
                uploader: PersonKey,
                at: Date,
                checklistItemId: string | null = null,
              ): Promise<string | null> => {
                const [att] = await tx
                  .insert(attachments)
                  .values({
                    cardId: card.id,
                    checklistItemId,
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
                if (!att) return null;
                stats.attachments++;
                activity({
                  actorId: ids[uploader],
                  type: 'attachment.added',
                  payload: { attachmentId: att.id, cardId: card.id, fileName: file.fileName },
                  createdAt: at,
                });
                return att.id;
              };

              /** Kart ya da madde yorumu + `comment.created` aktivitesi. */
              const addComment = async (m: SeedComment, checklistItemId: string | null = null) => {
                const at = workTimeDaysAgo(m.daysAgo);
                const [comment] = await tx
                  .insert(comments)
                  .values({
                    cardId: card.id,
                    checklistItemId,
                    authorId: ids[m.by],
                    body: plainDoc(m.text),
                    createdAt: at,
                    updatedAt: at,
                  })
                  .returning({ id: comments.id });
                if (!comment) return;
                stats.comments++;
                activity({
                  actorId: ids[m.by],
                  type: 'comment.created',
                  payload: {
                    commentId: comment.id,
                    cardId: card.id,
                    commentPreview: m.text.slice(0, 140),
                    ...(checklistItemId ? { checklistItemId } : {}),
                  },
                  createdAt: at,
                });
              };

              // --- activity: created / moved / completed ---
              const startIdx = boardDef.flow ? 0 : completed ? rndInt(0, Math.max(0, li - 1)) : li;
              activity({
                actorId: ids[creator],
                type: 'card.created',
                payload: { cardId: card.id, listId: listRows[startIdx]!.id, title: c.t, position: card.position },
                createdAt,
              });
              const hops: number[] = [];
              if (boardDef.flow) for (let k = 1; k <= li; k++) hops.push(k);
              else if (startIdx !== li) hops.push(li);
              const endMs = (completedAt ?? hoursAgo(rndInt(2, 72))).getTime();
              let prevIdx = startIdx;
              hops.forEach((toIdx, h) => {
                activity({
                  actorId: ids[c.a?.[h % (c.a?.length ?? 1)] ?? 'ben'],
                  type: 'card.moved',
                  payload: {
                    cardId: card.id,
                    fromListId: listRows[prevIdx]!.id,
                    toListId: listRows[toIdx]!.id,
                    fromListTitle: boardDef.lists[prevIdx]!.title,
                    toListTitle: boardDef.lists[toIdx]!.title,
                  },
                  createdAt: new Date(createdAt.getTime() + ((endMs - createdAt.getTime()) * (h + 1)) / (hops.length + 1)),
                });
                prevIdx = toIdx;
              });
              if (completedAt) {
                activity({ actorId: ids[creator], type: 'card.completed', payload: { cardId: card.id }, createdAt: completedAt });
              }

              // --- kapak görseli ---
              const coverFile = c.img != null ? files.covers.get(c.img) : undefined;
              if (coverFile) {
                const coverId = await addAttachment(coverFile, creator, workTimeDaysAgo(Math.max(1, createdDays - 1)));
                if (coverId) {
                  await tx.update(cards).set({ coverImageAttachmentId: coverId }).where(eq(cards.id, card.id));
                  stats.covers++;
                }
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

              // --- kontrol listeleri (iç içe maddeler + madde yorumu/eki) ---
              const insertItems = async (
                checklistId: string,
                items: CItem[],
                parentItemId: string | null,
                depth: number,
              ) => {
                const positions = positionsBetween(null, null, items.length);
                for (const [ii, it] of items.entries()) {
                  const itemDone = it.done === true || completed;
                  const [row] = await tx
                    .insert(checklistItems)
                    .values({
                      checklistId,
                      parentItemId,
                      depth,
                      content: it.t,
                      position: positions[ii] ?? firstPosition(),
                      completed: itemDone,
                      completedAt: itemDone
                        ? (completedAt ?? workTimeDaysAgo(rndInt(3, Math.max(3, createdDays - 1))))
                        : null,
                      completedBy: itemDone ? ids[creator] : null,
                    })
                    .returning({ id: checklistItems.id });
                  if (!row) continue;
                  stats.checklistItems++;
                  for (const m of it.cm ?? []) await addComment(m, row.id);
                  const pdf = it.pdf ? files.pdfs.get(it.pdf) : undefined;
                  if (pdf) await addAttachment(pdf, creator, workTimeDaysAgo(attachedDaysAgo()), row.id);
                  const photo = it.photo ? files.photos.get(photoKey(it.photo)) : undefined;
                  if (photo) await addAttachment(photo, creator, workTimeDaysAgo(attachedDaysAgo()), row.id);
                  if (it.sub && depth < 2) await insertItems(checklistId, it.sub, row.id, depth + 1);
                }
              };
              const checklistPositions = positionsBetween(null, null, c.cl?.length ?? 0);
              for (const [i, clDef] of (c.cl ?? []).entries()) {
                const [checklist] = await tx
                  .insert(checklists)
                  .values({ cardId: card.id, title: clDef.title, position: checklistPositions[i] ?? firstPosition() })
                  .returning();
                if (checklist) await insertItems(checklist.id, clDef.items, null, 0);
              }

              // --- kart yorumları ---
              for (const m of c.cm ?? []) await addComment(m);

              // --- kart ekleri ---
              const uploader = c.a?.[0] ?? 'ben';
              for (const key of c.pdf ?? []) {
                const file = files.pdfs.get(key);
                if (file) await addAttachment(file, uploader, workTimeDaysAgo(attachedDaysAgo()));
              }
              for (const p of c.photos ?? []) {
                const file = files.photos.get(photoKey(p));
                if (file) await addAttachment(file, uploader, workTimeDaysAgo(attachedDaysAgo()));
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

      await seedNotifications(tx, { ids, avatars, built, now, daysAgo, hoursAgo });
    });

    let searchDocs = 0;
    for (const workspaceId of workspaceIds) {
      searchDocs += (await syncSearchDocumentsForScope(db, { workspaceId })).upserted;
    }

    console.warn(
      `[seed] İnceleme verisi hazır. Giriş: ${MAIN_EMAIL}\n` +
        `       ${workspaceIds.length} çalışma alanı, ${stats.boards} pano, ${stats.lists} liste, ${stats.cards} kart, ` +
        `${stats.covers} görsel kapak, ${stats.comments} yorum, ${stats.checklistItems} kontrol maddesi, ` +
        `${stats.attachments} ek, ${stats.activities} aktivite. Arama indeksi: ${searchDocs} belge.`,
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
  avatars: Record<PersonKey, string | null>;
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
        ...(actor ? { actorUserId: ids[actor], actorName: PEOPLE[actor].name, actorImage: ctx.avatars[actor] } : {}),
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
