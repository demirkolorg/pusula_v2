---
title: "Kart Yansitma Mimarisi v2"
description: "Pusula v2 mevcut yetkilendirme, board, arama, realtime ve bildirim mimarisine uyumlu kart yansitma tasarimi."
aliases:
  - "Kart Yansitma v2"
  - "Mirror Card v2"
tags:
  - "pusula"
  - "analysis/card-mirror"
type: "analysis"
axis: "root"
status: "draft"
parent: "[[README|Pusula]]"
updated: 2026-05-15
---
# Kart Yansitma Mimarisi v2

## 1. Karar Ozeti

Bu dokuman, onceki `kart-yansitma-mimarisi.md` fikrini mevcut Pusula v2 sistemiyle uyumlu hale getirir.

Ana karar degismiyor:

```txt
Yetki kart seviyesinde degil, workspace + board seviyesinde yonetilir.
```

Ancak v1'de onerilen su model yeterli degildir:

```txt
card_mirrors(cardId, boardId)
```

Cunku Pusula'da bir kart board ekraninda yalnizca "board icinde gorunur" degildir. Kartin:

- hangi listede gorunecegi,
- listedeki sirasi,
- hangi board baglaminda acildigi,
- hangi board'un realtime/search/notification kapsaminda oldugu,
- board-scope label/member bilgisinin nasil ayrilacagi

acik olarak modellenmelidir.

Bu nedenle v2 karari:

```txt
Kart icerigi tek veri kaynagidir.
Kartin board'lardaki gorunumleri card_placements ile modellenir.
```

---

## 2. Mevcut Sistemle Uyum

Pusula v2 bugun su kurallara dayanir:

```txt
Workspace
  -> Board
      -> List
          -> Card
```

Mevcut yetki modeli:

```txt
Workspace role -> Board access
Board role     -> Board iceriginde okuma/yazma yetkisi
Card role      -> assignee/watcher iliskisi, permission degil
```

Bu v2 dokuman su mevcut kararlarla uyumludur:

- Kart bazli ACL yoktur.
- `card_members` yetki seviyesi degil, ilgi/atama/bildirim iliskisidir.
- Kullanici bir karti gorebiliyorsa bu, kartin gorundugu board'a erisebildigi icindir.
- Board `viewer` karti okuyabilir; board `member+` icerigi duzenleyebilir.
- Server-side authorization her procedure icinde kalir.

Uyumsuz olan kisim, mevcut veritabaninda kartin tek `boardId` + tek `listId` tasimasidir. Yansitma bu varsayimi genisletmelidir.

---

## 3. V1 Modelindeki Mantiksal Eksikler

V1 dokumaninda yansitma iliskisi soyle onerilmisti:

```txt
card_mirrors
| cardId | boardId |
```

Bu model Pusula icin eksiktir.

### 3.1 Liste ve siralama eksik

Board ekraninda kartlar liste kolonlari altinda ve `position` sirasi ile render edilir.

Sadece `boardId` bilen bir mirror kaydi su sorulari cevaplayamaz:

- Kart hedef board'da hangi listede duracak?
- Liste icindeki `position` ne olacak?
- Kart suruklenince ana kart mi tasinacak, yoksa sadece hedef board'daki gorunumu mu?
- Hedef liste arsivliyse ne olacak?

### 3.2 Card procedure baglami eksik

Bugun `card.get({ cardId })`, kartin kendi `cards.boardId` degeri uzerinden board access cozer.

Yansitmada kullanici ana board'u gormeyebilir ama karti hedef board'daki yansima uzerinden gorebilir. Bu nedenle kart okumasi su baglama ihtiyac duyar:

```txt
cardId + boardId
```

veya daha net olarak:

```txt
placementId
```

### 3.3 Search modeli tek board varsayiyor

Mevcut `search_documents` modeli entity basina tek satir ve tek `boardId` varsayar.

Yansitilan kart birden fazla board'da aranabilir olmalidir. Bu da arama indeksinin board/placement scope'lu hale gelmesini gerektirir.

### 3.4 Realtime tek board odasina yayin varsayiyor

Kart icerigi degistiginde, kartin gorundugu tum board odalarina event gitmelidir.

Bu nedenle `board:{boardId}` fan-out'u yalnizca kartin kaynak board'una degil, aktif placement'larin tum board'larina yapilmalidir.

### 3.5 Label ve member davranisi board baglamina ayrilmali

Pusula'da label board-scope'tur. A board'undaki label B board'unda anlamli degildir.

Bu nedenle label ve kart uyesi gibi board baglamindan etkilenen metadata'lar global kart icerigine karistirilmamalidir.

---

## 4. V2 Kavramlari

### 4.1 Card

`cards` satiri kartin ortak icerigidir.

Ortak kart icerigi:

- title
- description
- dueAt
- completed / completedAt / completedBy
- coverColor
- coverImageAttachmentId
- checklist'ler
- yorumlar
- attachment'lar

Bu alanlar tek veri kaynagidir. Bir board'da degisirse kartin gorundugu diger board'larda da degismis sayilir.

### 4.2 Card Placement

`card_placements`, kartin belirli bir board/list icindeki gorunumudur.

Placement su bilgileri tasir:

- kart hangi board'da gorunuyor?
- o board icinde hangi listede duruyor?
- listede hangi sirada duruyor?
- bu gorunum ana gorunum mu, yansima mi?
- bu gorunum aktif mi, kaldirilmis mi?

### 4.3 Home Placement

Her kartin tam olarak bir ana gorunumu vardir.

```txt
kind = home
```

Home placement, kartin dogdugu ve varsayilan yasam dongusunun yonetildigi board/list baglamidir.

### 4.4 Mirror Placement

Bir kart baska bir board/list icinde gorunuyorsa bu satir mirror placement'tir.

```txt
kind = mirror
```

Mirror placement yeni kart olusturmaz. Ayni kart icerigine baska board baglamindan erisim verir.

---

## 5. Onerilen Veri Modeli

### 5.1 Hedef model

```txt
cards
  id
  workspaceId
  title
  description
  dueAt
  completed
  completedAt
  completedBy
  coverColor
  coverImageAttachmentId
  archivedAt
  createdAt
  updatedAt
```

```txt
card_placements
  id
  cardId
  boardId
  listId
  kind              home | mirror
  position
  archivedAt        null = board'da gorunur
  createdById
  createdAt
  updatedAt
```

V2 hedefinde kartin listede nerede durdugu `cards` satirinda degil, `card_placements` satirinda tutulur.

### 5.2 Gecis modeli

Mevcut sistemde `cards.boardId` ve `cards.listId` zorunlu oldugu icin tek adimda kaldirilmasi buyuk refactor olur.

Bu nedenle gecis icin:

```txt
cards.boardId/listId
  -> yalniz home placement ile uyumlu legacy alanlar

card_placements
  -> board ekranlari ve yeni yansitma davranisi icin canonical gorunum modeli
```

Migration sirasi:

1. Her mevcut kart icin bir `home` placement olustur.
2. `board.get` okumasini `cards.boardId` yerine `card_placements.boardId` uzerinden calistir.
3. Kart move/reorder islemlerini placement uzerinden yap.
4. Yeni mirror akisini `card_placements.kind = mirror` ile ekle.
5. Kod tamamen placement modeline gecince `cards.boardId/listId` alanlari legacy/deprecated kabul edilir.

### 5.3 Temel invariant'lar

```txt
Her kartin tam olarak bir aktif home placement'i vardir.
Bir kart ayni board'da en fazla bir aktif placement'a sahip olabilir.
Placement.listId, placement.boardId altindaki bir listeye ait olmalidir.
Mirror placement ayni workspace icindeki board'lara sinirlidir.
Archived board/list icine yeni placement eklenemez.
```

Ilk surumde cross-workspace mirror desteklenmemelidir. Dış kullanici ihtiyaci, mevcut board daveti ve workspace `guest` modeli ile ayni workspace icindeki izole board uzerinden cozulmelidir.

---

## 6. Yetki Modeli

Yansitma kart bazli permission getirmez.

### 6.1 Karti gorme

Kullanici karti su durumda gorur:

```txt
Kullanici -> placement.boardId uzerinde viewer+
```

Yani kullanici ana board'u gormese bile, kartin yansitildigi board'a erisiyorsa karti o board baglaminda gorebilir.

### 6.2 Kart icerigini duzenleme

Kart icerigi ortak oldugu icin duzenleme yetkisi su sekilde calisir:

```txt
Kullanici -> aktif placement'in board'unda member+
```

Bu, bilincli bir karardir. Bir kart bir danisman board'una yansitiliyorsa ve danismanin board rolu `member` ise kart icerigini degistirebilir. Sadece okuma isteniyorsa hedef board'daki rolu `viewer` olmalidir.

### 6.3 Yansitma olusturma

Yansitma olusturmak bilgi paylasimi oldugu icin normal kart duzenlemeden daha hassastir.

Onerilen kural:

```txt
Kaynak/home board'da admin+
Hedef board'da member+
```

Gerekce:

- Kaynak board admin'i kartin baska board'a acilmasina karar verebilir.
- Hedef board member'i board'a yeni kart gorunumu ekleyebilir.
- Kart bazli ACL yaratmadan kontrollu paylasim saglanir.

### 6.4 Yansitmayi kaldirma

Yansitmayi kaldirma placement seviyesindedir.

Yetki:

```txt
Hedef board'da member+ -> kendi board'undaki mirror placement'i kaldirabilir.
Kaynak/home board admin+ -> kartin tum mirror placement'larini yonetebilir.
```

Bu islem karti silmez, yalnizca ilgili board'daki gorunumu kaldirir.

### 6.5 Karti global arsivleme

Kartin kendisini arsivlemek global etkidir. Bu nedenle mirror board'daki siradan member bunu yapmamalidir.

Onerilen kural:

```txt
Global card archive/restore -> home board member+
Mirror context default action -> yansimayi kaldir
```

UI'da mirror kartta "Arsivle" yerine varsayilan aksiyon "Bu board'dan kaldir" olmalidir.

---

## 7. Board Ekrani Davranisi

`board.get({ boardId })` artik kartlari dogrudan `cards.boardId` ile degil, placement uzerinden getirmelidir.

Mantik:

```txt
board.get(boardId)
  -> lists where lists.boardId = boardId
  -> card_placements where placement.boardId = boardId and placement.archivedAt is null
  -> cards join card_placements.cardId
  -> placement.position ile sirala
```

Board ekraninda her kart su ek alanlari tasimalidir:

```txt
cardId
placementId
placementKind       home | mirror
boardId             aktif board context
listId              aktif placement listesi
position            aktif placement pozisyonu
isMirrored          placementKind = mirror
mirrorCount         kartin diger aktif placement sayisi
```

Kart uzerinde kucuk bir badge gosterilebilir:

```txt
Yansima
```

Home board'da ise:

```txt
3 board'da gorunuyor
```

gibi daha bilgilendirici bir metin kullanilabilir.

---

## 8. Kart Detay Davranisi

Kart detay acilisi yalniz `cardId` ile yapilmamalidir.

Onerilen input:

```txt
card.get({
  cardId,
  boardId
})
```

veya:

```txt
card.get({
  placementId
})
```

Tercih:

```txt
placementId
```

Cunku placement, kartin hangi board/list baglaminda acildigini tekil ve net olarak tasir.

Kart detay cevabi:

```txt
card: ortak icerik
placement: aktif board/list/position/kind bilgisi
permissions: aktif board rolunden turetilmis yetkiler
relations: aktif placement baglamindaki uyelik/izleme bilgisi
```

---

## 9. Hangi Veriler Ortak, Hangileri Board Baglamli?

Yansitmanin saglikli calismasi icin "tek kart" ifadesi ayrintilandirilmalidir.

### 9.1 Ortak kart icerigi

Asagidaki veriler globaldir ve tum placement'larda ayni gorunur:

- title
- description
- dueAt
- completed state
- coverColor
- cover image
- checklist'ler
- checklist item'lar
- yorumlar
- attachment'lar

Bu alanlarda yapilan degisiklik tum board'lara yansir.

### 9.2 Placement-scope veriler

Asagidaki veriler board/list baglamina aittir:

- listId
- position
- placement archive/remove durumu
- board uzerindeki label iliskileri
- board uzerindeki assignee/watcher iliskileri

Bu ayrim gereklidir. Cunku label'lar board-scope'tur ve bir board'un label'i baska board'da gosterilmemelidir. Ayni sekilde bir danisman board'una eklenen watcher'in kaynak board uyelerine gereksiz bilgi sizdirmamasi gerekir.

---

## 10. Label ve Member Modeli

Mevcut sistemde:

```txt
card_labels(cardId, labelId)
card_members(cardId, userId, role)
```

Bu model yansitma icin yetersizdir; cunku ayni `cardId` birden fazla board'da gorunebilir.

### 10.1 Label icin v2 model

```txt
card_placement_labels
  placementId
  labelId
```

Kural:

```txt
label.boardId == placement.boardId
```

Boylece kaynak board'daki "Finans" label'i hedef board'a otomatik tasinmaz. Hedef board kendi label setini kullanir.

### 10.2 Member icin v2 model

```txt
card_placement_members
  placementId
  userId
  role        assignee | watcher
```

Kural:

```txt
user, placement.boardId uzerinde effectiveBoardRole != null olmali
```

Bu, mevcut "atanmis ama goremez" problemini mirror senaryosunda da engeller.

Not: Mevcut `card_members` tablosu gecis surecinde home placement icin legacy kaynak sayilabilir. Hedef modelde assignee/watcher board baglamli olmalidir.

---

## 11. Move, Copy ve Mirror Iliskisi

Pusula'da zaten iki farkli davranis vardir:

```txt
move      -> karti tasir
copy      -> yeni kart olusturur
mirror    -> ayni kart icin yeni placement olusturur
```

### 11.1 Move

Home placement icinde move:

```txt
home placement listId/position degisir
```

Mirror placement icinde move:

```txt
mirror placement listId/position degisir
```

Mirror board'da surukle-birak, ana kartin home placement'ini tasimamali; yalniz o board'daki placement'i tasimalidir.

### 11.2 Cross-board move

Mevcut `card.moveToList` davranisi "kartin evini degistirme" olarak kalabilir.

Bu islem:

- home placement'i yeni board/list'e tasir,
- kartin home board'unu degistirir,
- mevcut mirror placement'lar icin ayrica politika gerektirir.

Onerilen politika:

```txt
Cross-board move, mevcut mirror placement'lari korur.
Home placement yeni hedef board'a gecer.
Eger hedef board'da zaten aktif mirror placement varsa islem conflict verir.
```

### 11.3 Copy

Copy yansitma degildir.

Copy:

- yeni `cards` satiri olusturur,
- yeni home placement olusturur,
- comments/activity kopyalamaz,
- opsiyonel checklist/member/label kopyalama kurallarini korur.

### 11.4 Mirror

Mirror:

- yeni `cards` satiri olusturmaz,
- yeni `card_placements` satiri olusturur,
- ortak kart icerigine baska board/list baglamindan erisim verir.

---

## 12. Realtime Davranisi

Kart icerigi ortak oldugu icin kart icerigi degistiginde event kartin aktif gorundugu tum board'lara gitmelidir.

### 12.1 Content event fan-out

Ornek:

```txt
card.updated(cardId)
  -> aktif placements: A, B, C
  -> board:A room
  -> board:B room
  -> board:C room
```

Bu durumda ilgili tum board'larin `boards.version` degeri artirilmalidir. Aksi halde client `seq` gap ve refetch disiplinini dogru kullanamaz.

### 12.2 Placement event fan-out

Placement-scope olaylar yalniz ilgili board'a gider.

Ornek:

```txt
mirror placement B board'unda baska listeye tasindi
  -> yalniz board:B room
```

### 12.3 Onerilen event tipleri

```txt
card.placement_created
card.placement_removed
card.placement_moved
card.mirror_created
card.mirror_removed
```

Mevcut `card.updated`, `card.completed`, `card.archived` gibi event'ler content-scope olarak kalir.

---

## 13. Arama Davranisi

Arama index'i query-time permission filtreli kalmalidir. Search index guvenlik siniri degildir.

Ancak index satirlari placement-aware olmalidir.

### 13.1 Onerilen search modeli

```txt
search_documents
  ...
  boardId
  cardId
  placementId
  entityType
  entityId
```

Unique key:

```txt
(entityType, entityId, placementId)
```

Kart ve yorum gibi kart-scope entity'ler her aktif placement icin aranabilir satir uretir.

### 13.2 Target URL

Arama sonucu karti dogru board baglaminda acmalidir.

```txt
/workspaces/:workspaceId/boards/:boardId?card=:cardId&placement=:placementId
```

veya yalniz:

```txt
/workspaces/:workspaceId/boards/:boardId?placement=:placementId
```

Tercih:

```txt
placementId URL'de tasinmali
```

Cunku ayni `cardId` birden fazla board'da gorunebilir.

---

## 14. Bildirim Davranisi

Bildirim alicilari placement baglaminda hesaplanmalidir.

### 14.1 Watcher / assignee

Bildirim havuzu:

```txt
card_placement_members where placementId in affected placements
```

Content-scope event'lerde:

- kartin gorundugu aktif placement'lar bulunur,
- her placement'in watcher/assignee kullanicilari toplanir,
- actor self-skip uygulanir,
- kullanicinin ilgili board'a hala erisebildigi kontrol edilir.

### 14.2 Mention

Mention kuralinda mentioned user, yorumun yazildigi placement board'una erisebilmelidir.

Eger kullanici kaynak board'da var ama mirror board'da yoksa, mirror context'te mention edilmemelidir veya mention notification'i uretilmemelidir.

### 14.3 Notification preference

Mevcut preference hiyerarsisi su sekilde korunabilir:

```txt
card + board context
board
workspace
global
```

Card-level preference, board context ile birlikte degerlendirilmelidir. Ayni kartin farkli board'lardaki notification davranisi farkli olabilir.

---

## 15. Activity Davranisi

Mevcut `activity_events.boardId` tek board varsayar. Mirror icin iki yol vardir.

### 15.1 Onerilen yol: activity scope tablosu

```txt
activity_events
  id
  workspaceId
  cardId
  actorId
  type
  payload
  contextPlacementId
  contextBoardId

activity_event_board_scopes
  eventId
  boardId
```

Content event'lerde scope, kartin gorundugu tum aktif board'lardir.

Placement event'lerde scope, yalniz ilgili board'dur.

### 15.2 Daha basit gecis yolu

Ilk implementasyonda ayni activity olayi her board icin ayri satir olarak yazilabilir.

Bu daha kolaydir ama audit trail icin tekrarli satir uretir. Uzun vadede scope tablosu daha dogrudur.

---

## 16. API Yuzeyi

### 16.1 Yeni procedure'ler

```txt
card.mirror.create({
  cardId,
  toBoardId,
  toListId,
  beforeCardId?,
  afterCardId?,
  clientMutationId?
})

card.mirror.remove({
  placementId,
  clientMutationId?
})

card.placements.list({
  cardId
})
```

### 16.2 Degisecek procedure'ler

```txt
board.get({ boardId })
  -> placement-aware kart listesi doner

card.get({ placementId })
  -> karti aktif placement context'i ile doner

card.update({ placementId, ...patch })
  -> ortak kart icerigini gunceller

card.move({ placementId, toListId, ...positionInput })
  -> aktif placement'i tasir

card.labels.*
  -> card_placement_labels uzerinden calisir

card.members.*
  -> card_placement_members uzerinden calisir
```

### 16.3 Backward compatibility

Gecis surecinde eski `card.get({ cardId })` korunabilir, ancak yalniz home placement context'i icin calismalidir.

Yeni UI ve yeni API'ler `placementId` kullanmalidir.

---

## 17. UI / UX Akisi

### 17.1 Kart context menu

Kart sag tik menusu:

```txt
Tasi
Kopyala
Yansit
Arsivle / Bu board'dan kaldir
```

Mirror placement'ta:

```txt
Bu board'dan kaldir
```

home placement'ta:

```txt
Arsivle
```

### 17.2 Yansit akisi

```txt
Kart -> Yansit
  -> hedef board sec
  -> hedef liste sec
  -> konum sec veya liste sonuna ekle
  -> "Bu ayni karttir; icerik degisiklikleri tum gorunumlere yansir" uyarisi goster
```

### 17.3 Badge ve bilgi metni

Mirror kart:

```txt
Yansima
```

Home kart:

```txt
3 board'da gorunuyor
```

Kart detayinda:

```txt
Bu kart su board'larda gorunuyor:
- Ana Pano / Yapilacaklar
- Danisman Pano / Inceleme
```

Bu liste yalniz kullanicinin gorebildigi board'lari gostermelidir. Kullanici erisemedigi board adlarini gormemelidir.

---

## 18. Gizlilik Kurallari

Yansitma gizlilik saglar, ancak bu otomatik olarak "kart icerigi herkesten gizli" demek degildir.

Kural:

```txt
Kullanici yalniz erisebildigi board'lardaki placement'lari gorur.
```

Bu nedenle:

- Ana board'u gormeyen kullanici ana liste adini gormez.
- Kartin baska hangi gizli board'larda gorundugunu gormez.
- Search sonucu yalniz erisebildigi placement context'inde cikar.
- Notification yalniz erisebildigi board context'inden gelir.
- Board activity feed yalniz o board kapsamindaki activity scope'unu gosterir.

---

## 19. Performans Notlari

Mirror, kart bazli ACL'den daha basit kalsa da su maliyetleri getirir:

- `board.get` artik placement join'i yapar.
- Kart content mutation'lari birden fazla board version bump uretebilir.
- Realtime fan-out aktif placement sayisi kadar genisler.
- Search index, kart/comment icin placement sayisi kadar satir uretir.

Bu maliyetler yonetilebilir kalir cunku:

- bir kartin aktif placement sayisi pratikte dusuktur,
- board seviyesinde permission modeli korunur,
- query-time permission filtreleri mevcut board/workspace join mantigini kullanmaya devam eder,
- yansitma istisnai akistir, varsayilan kart modeli degildir.

Yine de MVP'de su sinirlar onerilir:

```txt
Bir kart ayni board'da en fazla bir kez gorunur.
Cross-workspace mirror yoktur.
Mirror sayisi icin soft limit uygulanabilir.
```

---

## 20. Uygulama Sirasi

### Faz 1 - Placement temel modeli

- `card_placements` tablosu eklenir.
- Mevcut kartlar icin `home` placement backfill edilir.
- `board.get` placement uzerinden okumaya baslar.
- UI kart modellerine `placementId` eklenir.

### Faz 2 - Kart detay ve mutation baglami

- `card.get` placement context ile calisir.
- `card.update`, `card.move`, `card.archive` davranislari content-scope / placement-scope olarak ayrilir.
- `card.labels` ve `card.members` placement-scope modele tasinir.

### Faz 3 - Mirror create/remove

- `card.mirror.create` eklenir.
- `card.mirror.remove` eklenir.
- Context menu ve modal akisi eklenir.
- Permission kurallari uygulanir.

### Faz 4 - Realtime/search/notification uyumu

- Content mutation'lari tum aktif placement board'larina fan-out yapar.
- Search index placement-aware hale gelir.
- Notification alicilari placement context ile hesaplanir.
- Activity scope modeli eklenir veya gecis icin board basina activity satiri yazilir.

### Faz 5 - Test ve sertlestirme

- Permission leak testleri eklenir.
- Search sonucu gizlilik testleri eklenir.
- Realtime multi-board yansima testleri eklenir.
- Mirror remove/archive edge-case testleri eklenir.

---

## 21. Nihai Karar

V2 karar:

```txt
Kart bazli permission eklenmeyecek.
Kart yansitma, board seviyesinde gorunurluk veren placement modeliyle kurulacak.
```

Bu model:

- mevcut workspace + board yetki kararini korur,
- kart bazli ACL karmasasini sisteme sokmaz,
- tek kart icerigi prensibini korur,
- board/list/position ihtiyacini acik modeller,
- search/realtime/notification varsayimlarini kirmaz,
- label/member gibi board-scope metadata'lari dogru yere tasir.

V1'deki fikir dogrudur; v2'deki fark, yansitmanin "kart + board iliskisi" degil, "kart + board/list/position baglaminda placement" olarak modellenmesidir.
