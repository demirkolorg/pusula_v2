import { db } from './index'; // Veritabanı bağlantı objenizin yolu
import {
  users,
  workspaces,
  workspaceMembers,
  boards,
  boardMembers,
  lists,
  cards,
} from './schema'; // Şema tanımlarınızın yolu
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';

// Sıralama için basit lexorank benzeri stringler (a, b, c, d, e...)
const positions = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

const positionFor = (index: number) => positions[index] ?? `z${index}`;

const seedData = [
  {
    workspaceName: 'Sosyal Yardımlaşma Vakfı',
    slug: 'syv',
    boards: [
      {
        title: 'Nakdi Yardımlar',
        lists: [
          { title: 'Yeni Başvurular', cards: ['Ahmet Y. - Kira Yardımı (Ocak)', 'Ayşe K. - Eğitim Yardımı', 'Mehmet T. - Gıda Desteği', 'Fatma S. - Sağlık Gideri'] },
          { title: 'Sosyal İnceleme Bekleyenler', cards: ['Hasan B. - Saha Ziyareti Yapılacak', 'Zeynep C. - Evrak Eksik', 'Ali V. - İkametgah Kontrolü'] },
          { title: 'Kurul Onayına Sunulacaklar', cards: ['Mustafa D. - Şartlı Eğitim Yardımı', 'Emine E. - Yakacak Yardımı', 'Hüseyin F. - Barınma Yardımı'] },
          { title: 'Onaylananlar (Ödeme Bekleyen)', cards: ['Ayşe G. - 2.000 TL Nakdi', 'Kemal H. - Doğalgaz Desteği', 'Elif I. - 1.500 TL Nakdi', 'Ömer J. - Eğitim Materyali'] },
          { title: 'Reddedilenler / Arşiv', cards: ['Veli K. - Şartları Sağlamıyor', 'Hatice L. - Gelir Kriteri Aşımı', 'Osman M. - Mükerrer Başvuru'] },
        ],
      },
      {
        title: 'Erzak ve Kömür Dağıtımı',
        lists: [
          { title: 'Gelen Talepler', cards: ['Merkez Mah. 15 Aile Erzak', 'Yeni Mah. 10 Ton Kömür', 'Cumhuriyet Mah. 5 Aile Erzak'] },
          { title: 'Stok Kontrolü', cards: ['Depo 1 - Kömür Sayımı', 'Depo 2 - Gıda Kolisi Hazırlığı', 'Gelen Bağışların Tasnifi', 'Tedarikçi Görüşmeleri'] },
          { title: 'Dağıtım Planına Alınanlar', cards: ['Merkez Mah. Kamyon 1 Rota Planı', 'Yeni Mah. Kamyon 2 Rota Planı', 'Muhtarlara Bilgi Verilmesi'] },
          { title: 'Dağıtımda', cards: ['Cumhuriyet Mah. Ekibi Sahada', 'Atatürk Mah. Teslimatları Devam Ediyor', 'Köy Yolları Dağıtım Ekibi'] },
          { title: 'Teslim Edilenler', cards: ['Geçen Haftanın Erzak Teslimatları', 'Merkez Mah. Kömür Dağıtım Tutanakları', 'Şubat Ayı Gıda Kolileri'] },
        ],
      },
    ],
  },
  {
    workspaceName: 'KÖYDES Projeleri',
    slug: 'koydes',
    boards: [
      {
        title: 'Köy Yolları Yapım İşleri',
        lists: [
          { title: 'Planlama ve Keşif', cards: ['A Köyü Asfalt Yama Keşfi', 'B Köyü Menfez Yapımı Etüdü', 'C Köyü Grup Yolu Planlaması', 'D Köyü Kilit Parke İhtiyacı'] },
          { title: 'İhale Süreci', cards: ['B Köyü Menfez İlanı Çıkılacak', 'E Köyü İstinat Duvarı İhale Dosyası', 'Komisyon Toplantısı Hazırlığı'] },
          { title: 'Sözleşme ve Yer Teslimi', cards: ['A Köyü Asfalt Sözleşmesi İmzalandı', 'C Köyü Grup Yolu Yer Teslimi', 'Müteahhit Firma Bilgilendirmesi'] },
          { title: 'İnşaatı Devam Edenler', cards: ['F Köyü Sanat Yapıları %50 Seviyesinde', 'G Köyü Sathi Kaplama Devam Ediyor', 'H Köyü Parke Döşeme'] },
          { title: 'Geçici Kabul Yapılanlar', cards: ['I Köyü Asfalt İşi Kesin Hesap', 'J Köyü Menfez İşi Kabul Tutanağı', 'K Köyü Yol Çizgi Çalışmaları'] },
        ],
      },
      {
        title: 'İçme Suyu Projeleri',
        lists: [
          { title: 'Talep ve Etüt', cards: ['X Köyü Su Kaynağı Araştırması', 'Y Köyü Depo Bakım Talebi', 'Z Köyü Şebeke Yenileme Keşfi'] },
          { title: 'Projelendirme', cards: ['W Köyü İsale Hattı Proje Çizimi', 'V Köyü Güneş Enerjili Pompa Sistemi', 'Terfi Merkezi Kapasite Hesabı', 'İller Bankası Onay Süreci'] },
          { title: 'İhale ve Yapım', cards: ['U Köyü İçme Suyu Şebekesi İhalesi', 'T Köyü Kaptaj Yapımı Sürüyor', 'S Köyü Su Deposu İzolasyonu'] },
          { title: 'Test ve Analiz', cards: ['P Köyü Su Kalitesi Analiz Sonuçları', 'R Köyü Şebeke Basınç Testi', 'Klorlama Cihazı Kalibrasyonu'] },
          { title: 'Devreye Alınanlar', cards: ['N Köyü Yeni Depo Devrede', 'M Köyü Sondaj Kuyusu Aktif', 'L Köyü Tesisat Kabulü Yapıldı'] },
        ],
      },
    ],
  },
  {
    workspaceName: 'Açık Kapı / Vatandaş İlişkileri',
    slug: 'acik-kapi',
    boards: [
      {
        title: 'CİMER Başvuruları',
        lists: [
          { title: 'Yeni Gelenler', cards: ['CİMER-2026-10112 Nolu Başvuru', 'CİMER-2026-10115 Nolu Başvuru', 'CİMER-2026-10119 Nolu Başvuru', 'CİMER-2026-10125 Nolu Başvuru'] },
          { title: 'İlgili Kuruma Sevk', cards: ['CİMER-10098 (Emniyete Sevk)', 'CİMER-10100 (Belediyeye Sevk)', 'CİMER-10105 (Milli Eğitime Sevk)'] },
          { title: 'Cevap Beklenenler', cards: ['CİMER-10050 (Tarım Müdürlüğü)', 'CİMER-10065 (Sağlık Müdürlüğü)', 'CİMER-10072 (Nüfus Müdürlüğü)'] },
          { title: 'Cevabı Hazırlananlar', cards: ['CİMER-10040 Onaya Sunuldu', 'CİMER-10045 Yazısı Yazıldı', 'CİMER-10048 Sistemden Gönderilecek'] },
          { title: 'İşlemi Tamamlananlar', cards: ['CİMER-10010 Kapatıldı', 'CİMER-10012 Kapatıldı', 'CİMER-10015 Kapatıldı'] },
        ],
      },
      {
        title: 'Doğrudan Dilekçeler',
        lists: [
          { title: 'Gelen Evrak', cards: ['Ahmet S. Dilekçesi', 'Mehmet Y. Ruhsat Talebi', 'Muhtarlık Ortak Dilekçesi', 'Spor Kulübü Yardım Talebi'] },
          { title: 'Kaymakam Havalesi', cards: ['Yazı İşlerine Havale Edilenler', 'SYDV\'ye Yönlendirilenler', 'Özel İdareye Gidenler'] },
          { title: 'İşlemde Olanlar', cards: ['Dernek Kuruluş Evrakları', 'İşyeri Açma Ruhsat Görüşü', 'Güvenlik Soruşturması Bekleyenler'] },
          { title: 'Postaya Verilecekler', cards: ['Cevap Yazısı - Ali Rıza K.', 'Bilgilendirme Yazısı - Ayşe B.', 'Kurumlar Arası Yazışmalar'] },
          { title: 'Arşiv', cards: ['Ocak Ayı Kapanan Dilekçeler', 'Geçen Yılın Kayıtları', 'Reddedilen Ruhsat Başvuruları'] },
        ],
      },
    ],
  },
];

async function main() {
  console.log('🌱 Kaymakamlık demo verileri yükleniyor...');

  // 1. Demo Kullanıcı Oluştur (Eğer yoksa)
  let demoUserId: string = crypto.randomUUID();
  await db.insert(users).values({
    id: demoUserId,
    name: 'Hüseyin',
    email: 'huseyin@pusula.local',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  // Veritabanındaki güncel ID'yi al (kullanıcı zaten varsa, o ID ile devam et)
  const existingUser = await db.select().from(users).where(eq(users.email, 'huseyin@pusula.local')).limit(1);
  if (existingUser.length > 0) {
    demoUserId = existingUser[0]!.id;
  }

  // 1.5. Önceki Verileri Temizle
  console.log('🧹 Önceki veriler temizleniyor...');
  await db.delete(cards);
  await db.delete(lists);
  await db.delete(boardMembers);
  await db.delete(boards);
  await db.delete(workspaceMembers);
  await db.delete(workspaces);

  // 2. Döngü ile Çalışma Alanları, Panolar, Listeler ve Görevleri Oluştur
  for (const workspace of seedData) {
    const workspaceId = crypto.randomUUID();

    await db.insert(workspaces).values({ id: workspaceId, name: workspace.workspaceName, slug: workspace.slug, ownerId: demoUserId });
    await db.insert(workspaceMembers).values({ workspaceId, userId: demoUserId, role: 'owner' });
    console.log(`📁 Çalışma Alanı eklendi: ${workspace.workspaceName}`);

    for (const board of workspace.boards) {
      const boardId = crypto.randomUUID();

      await db.insert(boards).values({ id: boardId, workspaceId, title: board.title });
      await db.insert(boardMembers).values({ boardId, userId: demoUserId, role: 'admin' });

      for (const [listIndex, list] of board.lists.entries()) {
        const listId = crypto.randomUUID();

        await db.insert(lists).values({ id: listId, boardId, title: list.title, position: positionFor(listIndex) });

        for (const [cardIndex, cardTitle] of list.cards.entries()) {
          const cardId = crypto.randomUUID();
          await db.insert(cards).values({ id: cardId, listId, boardId, title: cardTitle, position: positionFor(cardIndex) });
        }
      }
      console.log(`  └─ 📋 Pano eklendi: ${board.title}`);
    }
  }

  console.log('✅ Demo verileri başarıyla yüklendi!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Hata oluştu:', err);
  process.exit(1);
});
