---
title: '22 — Pano Performans Analizi ve İyileştirme Önerileri'
description: 'Pusula web pano ekranı ile liste, kart, yorum ve kontrol listesi işlemlerinin algılanan ve teknik performansını geliştirmek için kod-temelli analiz, ölçüm bütçeleri ve öncelikli öneriler.'
aliases:
  - 'Pano Performans Analizi'
  - 'Board Performance Review'
  - 'Hızlı Pano Deneyimi'
tags:
  - 'pusula'
  - 'architecture/performance'
  - 'architecture/board'
type: 'architecture'
axis: 'architecture'
status: 'active'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
related:
  - '[[docs/architecture/05-board-mekanigi|Board Mekaniği]]'
  - '[[docs/architecture/08-web-ve-mobil|Web ve Mobil]]'
  - '[[docs/architecture/10-platform|Platform]]'
updated: 2026-09-18
---

# 22 — Pano Performans Analizi ve İyileştirme Önerileri

> [!summary]
> Pusula'nın temel yaklaşımı doğru: optimistic board mutation'ları, realtime cache
> yamaları, kart bileşeninde `memo`, kart detayının lazy chunk olması ve kapak URL
> waterfall'ının kaldırılması iyi bir taban oluşturuyor. En yüksek getirili sonraki
> adımlar; **kart başına kurulan mutation/hook ağını tekilleştirmek**, **yorum ve
> checklist işlemlerini hedefli optimistic güncellemek**, **büyük listelerde DOM'u
> pencerelemek** ve **`board.get` projection'ını küçültüp sorgu planını ölçmektir**.

## 22.1 Kapsam ve yöntem

Bu çalışma özellikle web pano rotasını ve pano içinde sık tekrarlanan işlemleri kapsar:

- panonun ilk açılışı ve yatay liste/kart render'ı,
- liste ve kart ekleme/düzenleme/taşıma,
- kart detay modalının açılması,
- yorum ekleme/düzenleme/silme,
- kontrol listesi ve madde ekleme/toggle/düzenleme/silme/sıralama,
- optimistic UI ile realtime uzlaşması,
- `board.get` PostgreSQL sorguları ve payload büyümesi.

Analiz 2026-09-17 tarihli kaynak kodun statik incelemesine dayanır. Üretim RUM,
PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` çıktısı ve sentetik büyük-pano ölçümü henüz
yoktur; dolayısıyla aşağıdaki darboğazlar **koddan doğrulanan riskler**, süre kazancı
tahminleri ise ölçümle doğrulanması gereken hipotezlerdir. Repoda dokümante edilmiş
`tests/load/` profilleri bulunmadığı için mevcut `<500 ms board.get p95` hedefi bugün
CI tarafından korunmuyor.

## 22.2 Mevcut durumda iyi çalışan kararlar

| Alan             | Kodda doğrulanan güçlü taraf                                                                                                         | Etkisi                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Pano cache'i     | `board.get` için 5 dk `staleTime`, window-focus refetch kapalı; kopma/sequence gap halinde realtime hook refetch ediyor (`page.tsx`) | Sekme odağında gereksiz tam pano refetch'i yok                     |
| Kart render'ı    | `CardItem` `React.memo`; cache helper'ları değişmeyen kart referanslarını koruyor (`card-item.tsx:243`, `:965`)                      | Tek kart değişiminde kardeş kart render'larının çoğu atlanabiliyor |
| Ağ şelalesi      | Kapak görsellerinin presigned URL'leri `board.get` içinde üretiliyor                                                                 | Kart başına ayrı download-URL isteği yok                           |
| Ağır modal kodu  | `CardDetailDialog` `next/dynamic` ile yalnız `?card=` varken yükleniyor                                                              | Tiptap ve modal bağımlılıkları ilk pano bundle'ını şişirmiyor      |
| Sıralama         | Fractional position; drag sırasında istek yok, drop'ta tek mutation                                                                  | Reorder yazma maliyeti liste boyuyla büyümüyor                     |
| Realtime         | Event bazlı hedefli cache yaması, sequence/gap kurtarması ve echo filtreleme                                                         | Sürekli polling yerine düşük gecikmeli uzlaşma                     |
| Sunucu sorguları | Kart etiket/checklist/yorum/ek/üye metadata'sı N+1 yerine board-geneli toplu sorgulanıyor                                            | Kart sayısı kadar round-trip oluşmuyor                             |

TanStack Query'nin structural sharing davranışı, değişmeyen alt nesne referanslarını
koruyan mevcut helper'larla uyumludur; bu kazanımın devamı için cache yamaları immutable
ama hedefli kalmalıdır. Kaynak: [TanStack Query — Render Optimizations](https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations).

## 22.3 Darboğaz haritası

### A. Kart başına ağır davranış ağacı — en yüksek istemci riski

`CardItem` yalnız görsel kart değildir. Her kart instance'ı kendi içinde:

- 5 yerel state,
- drag kayıt effect'i,
- archive/delete/complete/uncomplete/update için 5 optimistic mutation hook'u,
- attachment initiate/commit mutation'ları,
- label/member mutation'ları,
- context menu alt ağaçları ve kapalı dialog kabukları

kuruyor (`card-item.tsx:243-418`). 500 kartlık bir panoda yalnız kart yüzleri için
binlerce hook/observer ve büyük bir React ağacı oluşur. `memo` güncelleme maliyetini
azaltır fakat **ilk mount, bellek ve abonelik maliyetini azaltmaz**.

**Öneri P0 — tek paylaşılan kart aksiyon katmanı:**

1. `BoardCardActionsProvider` pano başına mutation hook'larını bir kez kursun.
2. `CardItem` yalnız render + DnD registration + `onOpen`/`onContextMenu` taşısın.
3. Tek bir `CardContextMenuHost`, `ArchiveCardDialog`, `DeleteCardDialog`,
   `MoveCardToBoardDialog` ve `ShareDialog` aktif `cardId` için pano kökünde render edilsin.
4. Kartlara stabil aksiyon callback'leri ve salt veri geçilsin.

Bu değişiklik domain veya tRPC sözleşmesini değiştirmez. Önce React Profiler ile 100,
500 ve 2.000 kartta mount süresi, commit süresi ve heap ölçülmelidir. React'in
`actualDuration`/`baseDuration` alanları memoizasyon etkisini ölçmek için tasarlanmıştır:
[React `<Profiler>`](https://react.dev/reference/react/Profiler).

### B. Liste seviyesinde referans kaybı ve tüm-board türetme

`BoardColumns`, kart değiştiğinde tüm kartları filtreleyip sıralayarak yeniden
`cardsByList` üretir. Her bucket yeni array olduğu için yalnız bir kart değişse bile tüm
`ListColumn.cards` referansları değişir. `ListColumn` 909 satırlık ağır bir bileşendir ve
memoize değildir; kartlar `memo` sayesinde kaçsa bile bütün kolon kabuğu yeniden çalışır.

**Öneri P0:**

- `ListColumn`'u ölçüm sonrası `memo` ile sınırla.
- `cardsByList` view-model'ini önceki map ile karşılaştırıp içeriği değişmeyen listenin
  array referansını koruyan pure helper'a taşı.
- Filtre kapalıyken server sırasını tekrar `.sort()` etme; yalnız arşivli kartlar
  birleştirildiğinde veya filtre sonucu gerektirdiğinde sırala.
- `selectedLabelIds` değişimi gibi gerçekten bütün kartları ilgilendiren işlemleri
  `useDeferredValue`/`startTransition` adayı olarak profil et; drag state ve input gibi
  acil güncellemeleri transition içine alma.

React de `memo`nun yalnız props referansları stabilken faydalı olduğunu ve önce profiler
ile doğrulanması gerektiğini vurgular: [React `memo`](https://react.dev/reference/react/memo).

### C. Yorum/checklist işlemlerinde geniş invalidation ve gecikmeli geri bildirim

Kart detayı açıldığında 10 query paralel başlıyor (`card-detail-dialog.tsx:152`): kart,
üyeler, etiketler, checklist, yorumlar, activity, board üyeleri, board etiketleri,
`board.get` ve attachment listesi. Daha önemlisi, ortak `invalidateCard` bir mutation
sonrasında 9 query'yi invalidate ediyor (`:190-202`). Yorum ve çoğu checklist mutation'ı
optimistic değil; hepsi aynı geniş `onMutated` yolunu kullanıyor (`:358`, `:425`).

Bu desen küçük kartta kabul edilebilir, fakat hızlı ardışık kullanıcı işlemlerinde:

- yazılan yorumun görünmesi ağ dönüşünü bekler,
- checklist toggle gözle görülür şekilde bekleyebilir,
- tek yorum ekleme bile tüm `board.get` projection'ını yeniden çalıştırabilir,
- activity, üye ve etiket gibi değişmeyen veriler tekrar sorgulanır.

**Öneri P0 — mutation-spesifik optimistic patch:**

| İşlem                | Anlık cache davranışı                                                 | Başarı sonrası                                                                        |
| -------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Yorum ekle           | `tmp:${clientMutationId}` yorumunu listeye ekle, `commentCount + 1`   | Temp kaydı server kaydıyla değiştir; yalnız activity'yi düşük öncelikle invalidate et |
| Yorum düzenle/sil    | Hedef yorum satırını patch et; silmede sayaç semantiğine göre azalt   | Server sonucu reconcile; hata halinde snapshot rollback                               |
| Checklist/madde ekle | Temp id ile ilgili checklist'e ekle, kart toplam sayacını artır       | Server id/position ile reconcile                                                      |
| Toggle               | Maddeyi anında toggle et, `checklistDone` sayacını delta ile güncelle | Hata halinde rollback; geniş refetch yok                                              |
| Yeniden sırala       | Mevcut optimistic yol korunur                                         | Yalnız checklist query'sini doğrula                                                   |
| Liste/kart ekle      | Temp entity'yi hedef konuma anında ekle                               | Server id/position ile değiştir                                                       |

Kendi realtime echo'su mevcut `clientMutationId` filtresiyle atlanmalıdır. Başarı yolunda
tam `board.get` invalidation varsayılan olmamalı; yalnız server'ın istemcinin
hesaplayamadığı alan ürettiği veya sequence gap bulunduğu durumlarda kurtarma yolu
olmalıdır. TanStack Query, refetch'in optimistic sonucu ezmemesi için önce cancel,
ardından `setQueryData`, hata halinde rollback modelini destekler:
[TanStack Query `QueryClient`](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient).

### D. Kart modalı veriyi görünürlükten bağımsız yüklüyor

Activity sekmesi, yorum sidebar'ı ve ekler galerisi kapalı olsa bile ilgili query'ler ilk
açılışta başlıyor. Yorum listesi ayrıca cursor/limit olmadan kartın bütün kart-seviyesi
yorumlarını döndürüyor (`comment.ts:112`). Uzun yaşayan kartlar modal açılışını giderek
yavaşlatır.

**Öneri P0/P1:**

- İlk modal kapısı: `card.get`, checklist özeti/içeriği ve cache-warm board referansları.
- `comment.list`: yalnız sidebar açık + comments tab aktifken `enabled`; cursor tabanlı,
  ilk sayfa 30–50 yorum.
- `card.activity.list`: yalnız activity tab aktifken `enabled`.
- `attachment.list`: yalnız ek galerisi/kapak seçici açıldığında; sayaç için
  `board.get.attachmentCount` yeterli.
- Board üye/etiket sorguları yalnız ilgili picker ilk kez açıldığında veya pano
  cache'inde yoksa çalışsın.
- Kart üzerinde `pointerenter`/keyboard focus sırasında düşük öncelikli `card.get` ve
  modal chunk prefetch'i ölçülerek denenebilir; touch cihazlarda gereksiz prefetch yapma.

Next.js, modal gibi ilk anda gerekmeyen client bileşenlerini lazy yüklemenin route'un ilk
JavaScript yükünü azalttığını belirtir; mevcut modal sınırı korunmalı ve alt sekmelere de
uygulanmalıdır: [Next.js — Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading).

### E. Büyük pano DOM'u pencerelemiyor

`ListColumn` görünür listedeki tüm kartları doğrudan `cards.map(...)` ile mount ediyor
(`list-column.tsx:727`). Bu, kart sayısı arttıkça DOM, layout, style calculation ve DnD
registration maliyetini doğrusal büyütür. Büyük DOM, interaction sonrası presentation
delay'i artırabilir; INP'nin iyi eşiği p75'te 200 ms veya altıdır:
[web.dev — Optimize INP](https://web.dev/articles/optimize-inp).

**Öneri P1 — iki kademeli yaklaşım:**

1. **Düşük riskli ara adım:** off-screen kolon/kart bölgelerinde ölçülerek
   `content-visibility: auto` + doğru `contain-intrinsic-size`; erişilebilirlik ve DnD
   hitbox testi zorunlu.
2. **Kalıcı büyük-pano çözümü:** liste başına dikey virtualization. Sabit/tahmini kart
   yüksekliği yerine ölçülen dinamik yükseklik, overscan ve ayrı board-level DnD monitor
   kullanılmalı. Drag overlay ve placeholder sanal listedeki gerçek ölçüleri korumalı.

Pragmatic Drag and Drop virtualization ile uyumludur; orijinal draggable DOM'dan
çıktığında event takibinin kaldırılmayan monitor/drop target üzerinde tutulmasını önerir:
[Atlassian PDD — Virtualization](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/recipes/virtualization).

Virtualization şu eşiklerde benchmark edilmelidir: liste başına 50, 200 ve 1.000 kart.
Küçük listelerde virtualization'ın karmaşıklığına girmemek için eşik tabanlı açılabilir.

### F. `board.get` payload ve sorgu planı büyüyor

`board.get` bugün board + listeler + tüm aktif kartları, ardından kart id'leri üzerinden
etiket/checklist/yorum/attachment/üye/kapak için altı paralel zenginleştirme sorgusunu
çalıştırıyor (`board.ts:375-625`). Bu tasarım N+1 değildir ve orta ölçek için makuldür;
ancak iki somut optimizasyon fırsatı vardır:

1. Board kart yüzü tam `description` içeriğini kullanmıyor; yalnız açıklama var/yok
   sinyali gerekiyor. `description: string | null` yerine board projection'ında
   `hasDescription: boolean` dönmek, büyük Tiptap JSON'larının her pano açılışında ağdan
   ve cache'ten geçmesini engeller. Tam içerik `card.get`te kalır.
2. Aktif kart sorgusu `WHERE board_id = ? AND archived_at IS NULL ORDER BY position`,
   fakat şemada `(list_id, position)` ve yalnız `(board_id)` indexleri vardır
   (`cards.ts:53-54`). Gerçek veri üzerinde önce `EXPLAIN (ANALYZE, BUFFERS)` alınmalı;
   plan doğrularsa aktif kartlar için kısmi bileşik index ve sorgu sırası denenmelidir:

```sql
CREATE INDEX CONCURRENTLY cards_board_list_position_active_idx
ON cards (board_id, list_id, position)
WHERE archived_at IS NULL;
```

Sorgu `ORDER BY list_id, position` dönebilir; istemci zaten kartları `listId` ile
grupluyor. Migration öncesi ve sonrası 100/500/2.000/10.000 kart veri setinde plan,
buffer hit/read, sort memory ve response byte ölçülmelidir. PostgreSQL gerçek satır ve
çalışma sürelerini görmek için `EXPLAIN ANALYZE` kullanımını tanımlar:
[PostgreSQL — Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html).
Kısmi index yalnız predicate'i karşılayan satırları taşıdığı için aktif-kart yolu için
uygundur, ancak planner eşleşmesi ölçülmelidir:
[PostgreSQL — Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html).

**P2 — yalnız ölçüm gerektirirse büyük-pano veri sözleşmesi:** `board.get`i hemen
parçalamak önerilmez; web, mobil, ana sayfa ve rapor izinleri bu sözleşmeyi tüketiyor.
2.000+ kartta response/parse/render bütçesi aşılırsa additive `board.shell` +
`board.cardsByList({ cursor, limit, filters })` modeli tasarlanmalı; mevcut `board.get`
geçiş süresince korunmalıdır. Server-side filtreleme, toplamlar ve DnD komşu bilgisi bu
tasarımda ayrıca çözülmeden pagination'a geçilmemelidir.

## 22.4 Önerilen uygulama sırası

| Öncelik | İş                                                                 | Beklenen ana kazanım                                | Risk / doğrulama                                         |
| ------- | ------------------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------- |
| P0      | Ölçüm fixture'ları + RUM + React Profiler + SQL planları           | Yanlış optimizasyondan kaçınma, güvenilir baseline  | 100/500/2.000 kart; uzun yorum/checklist kartı           |
| P0      | Geliştirme öncesi baseline test paketi ve sonuç kaydı              | Sonraki kazanımın aynı koşullarda karşılaştırılması | Commit, ortam, fixture seed'i ve ham çıktılar sabitlenir |
| P0      | Yorum/checklist/list/card create için hedefli optimistic cache     | Kullanıcı eyleminde ağ bekleme hissini kaldırma     | temp-id reconcile, rollback, duplicate echo testleri     |
| P0      | Kart başına mutation/dialog ağını board-level action host'a taşıma | İlk mount, heap ve observer sayısında büyük düşüş   | context menu, keyboard ve DnD regresyon testleri         |
| P0      | `invalidateCard`ı mutation-spesifik hale getirme                   | Tek işlem sonrası 9 query refetch'ini kaldırma      | uzak kullanıcı realtime sayaç tutarlılığı                |
| P0      | `board.get`te `description` → `hasDescription` projection          | Payload/JSON parse/cache belleği azalması           | web + mobil tüketicileri additive geçişle taşı           |
| P1      | Modal query'lerini sekme/görünürlük bazlı lazy + yorum pagination  | Kart açılışında daha az ağ ve DB işi                | deep-link hedefi eski sayfadaysa hedef sayfayı çek       |
| P1      | Stabil per-list card bucket + memoized `ListColumn`                | Tek kart değişiminde diğer kolonları atlama         | Profiler ile actual/base duration karşılaştır            |
| P1      | Eşik tabanlı kart virtualization                                   | Büyük listede DOM ve DnD registration azalması      | PDD monitor, auto-scroll, a11y, dynamic height           |
| P1      | Aktif kart partial index deneyi                                    | `board.get` DB süresini düşürme                     | yalnız EXPLAIN sonucu olumluysa migration                |
| P2      | Büyük-pano için parçalı/paginated veri sözleşmesi                  | 2.000+ kartta bounded payload                       | web+mobile cache/realtime/DnD tasarımı gerekir           |

### Uygulama fazları ve geliştirme ipuçları

> [!note]
> Aşağıdaki fazlar ürün yol haritası veya iş takip kaydı değildir. Bu performans
> çalışmasının teknik uygulama sırasıdır. Her faz kendi test ve ölçüm kapısını geçmeden
> sonraki fazın kazanımı güvenilir kabul edilmez.

#### Faz A — Baseline ve test düzeneği

> **Uygulama durumu — 2026-09-17:** Kod seviyesi başlangıç doğrulaması
> `pnpm typecheck` ile başarılıdır (8 paket, 28.9 sn); `@pusula/api` birim
> testleri de 172 başarılı / 535 entegrasyon-senaryosu atlanmış durumdadır.
> Optimized production `pnpm build` derlemesinde web derlemesi başarıyla
> tamamlanmıştır; mobil export da aynı build akışında tamamlanır. Bu kontroller
> işlevsel yayın doğrulamasıdır, kullanıcı etkileşim hızının yerine geçmez.
> Gerçek kullanıcı-performans baseline'ı henüz kaydedilemedi: bu çalışma
> ortamında başlangıçta Docker Desktop/Linux engine çalışmıyordu; 2026-09-17
> itibarıyla yerel PostgreSQL/Redis ayağa kaldırıldı, migration ve deterministik
> seed başarıyla çalıştı. Pusula portu, aynı makinedeki başka uygulamayla
> çakışmaması için smoke koşusunda `3002/3003` olarak ayrıldı; giriş smoke
> senaryosu geçti. Planlayıcı smoke senaryosu pano performansıyla ilgisiz bir
> mevcut UI/test uyumsuzluğunda başarısızdır. Aynı seed + production build ile
> Faz A'nın tarayıcı ve SQL ölçümleri çalıştırılmadan önce/sonra sayı
> karşılaştırması yapılmış sayılmaz.

**Ne yapılacak?** Kod değiştirilmeden önce küçük/orta/büyük pano fixture'ları,
otomatik performans senaryoları ve ilk ölçüm raporu hazırlanacak.

**Nasıl yapılacak?**

- Deterministik bir seed komutu; 100, 500 ve 2.000 kartlık panoları, uzun yorumlu kartı
  ve yoğun checklist kartını aynı id dağılımıyla üretsin.
- E2E seed aracı, normal test verisini değiştirmeden `--perf-cards=<n>` opsiyonuyla
  ana E2E panosuna tek bir "Yük Testi" listesi ekler. Windows dahil tüm ortamlarda
  örnek kullanım: `pnpm e2e:seed -- --perf-cards=2000`. Bu komut yalnız yerel/test
  veritabanına reset-then-seed yapar; production bağlantısında çalıştırılmaz.
- `E2E_PERF_CARDS=<n>` ortam değişkeniyle çalıştırılan `board-performance.spec.ts`,
  aynı fixture'ı global setup sırasında kurar ve pano açılışındaki navigation/resource
  süreleri, transfer byte'ları ve mount edilen kart sayısını Playwright artifact'i olarak
  kaydeder. Bu senaryo geliştirme sunucusunda **tanısal** bir koşudur; kabul bütçesi için
  aynı senaryonun production build'de beş kez koşturulması gerekir.
- `tests/load/` altında `board-read`, `board-collaborative-writes` ve
  `realtime-fanout` k6 senaryoları oluşturulsun; kök scriptler yalnız `pnpm` ile
  `load:smoke` ve `load:full` çalıştırsın.
- Playwright senaryosu production build'e karşı pano açılışı, kart açma, kart ekleme,
  yorum ekleme, checklist toggle ve drag-drop akışlarında trace toplasın.
- React profiling build'inde `BoardColumns`, `ListColumn` ve `CardDetailDialog`
  sınırlarına `<Profiler>` eklensin. Profiler normal production build'de sürekli açık
  bırakılmasın.
- API tarafında `board.get` span'ına yalnız bucket'lanmış `listCount`, `cardCount`,
  `responseBytes` ve alt sorgu süreleri yazılsın; `boardId` gibi yüksek-cardinality
  alanlar tag yapılmasın.
- Baseline commit SHA'sı ve ortam bilgisiyle “Ölçüm sonuçları” tablosunun `Önce`
  sütunu doldurulsun.

**Dokunulması beklenen alanlar:** `tests/load/`, `e2e/`, `package.json`, test seed
yardımcıları, `apps/web` profiling sınırları ve `packages/api/src/routers/board.ts`
ölçüm noktaları.

**Geliştirme ipuçları:**

- Dev server ölçülmez; `next build` + production server kullanılır.
- İlk koşu ısınma için atılır; en az 5 ölçümün median/p75/p95 değeri alınır.
- Seed, uygulamanın public tRPC akışını zorlamak yerine test DB'sine kontrollü ve hızlı
  veri kurabilir; ancak ölçülen kullanıcı senaryosu gerçek tRPC/HTTP yolundan geçmelidir.
- Trace veya profiler çıktısı uygulama repo kaynağı gibi elle düzenlenmez; CI artifact
  olarak saklanır.

**Faz çıkış kriteri:** Baseline tablosu dolu, testler tekrarlanabilir ve iki ardışık
koşunun varyansı kazanım hedefinden küçük olmalı.

#### Faz B — Anlık kullanıcı geri bildirimi ve hedefli cache

> **Uygulama durumu — 2026-09-17:** Kart detayındaki yorum mutation'ları,
> üyeler/etiketler/checklistler gibi ilişkisiz modal sorgularını artık
> yenilemeyecek; yalnız yorum listesi, aktivite geçmişi ve pano kart sayacı
> için gerekli `board.get` yenilenir. Checklist mutation'ları da yalnız
> checklist, aktivite ve pano rozet verisini yeniler. Tam optimistic
> temp-comment ve eşzamanlı mutation uzlaştırması sonraki güvenli genişletmedir.

**Ne yapılacak?** Kart/liste oluşturma, yorum ve checklist işlemleri ağ cevabını
beklemeden ekranda görünecek; mutation sonrası geniş invalidation kaldırılacak.

**Nasıl yapılacak?**

- `apps/web/src/lib/board-cache/` içine yorum ve checklist için pure cache primitive'leri
  eklenir: add/replace/patch/remove ve sayaç delta helper'ları.
- Her create işleminde `clientMutationId` bir kez üretilir; optimistic satır id'si
  `tmp:${clientMutationId}` olur. Başarıda temp kayıt server kaydıyla değiştirilir,
  hatada snapshot geri yüklenir.
- `comment.create/update/delete`, `checklist.create/update/delete`, item
  create/toggle/update/delete ve `card.create`/`list.create` mutation'ları ayrı lifecycle
  kullanır; hepsi ortak dokuz-query `invalidateCard` callback'ine bağlanmaz.
- Kart yüzündeki `commentCount`, `checklistTotal` ve `checklistDone` aynı optimistic
  işlem içinde delta ile güncellenir.
- Başarıda server sonucu yeterliyse refetch yapılmaz. Activity feed, kullanıcı
  tarafından görünürse düşük öncelikli invalidate edilebilir. Sequence gap ve reconnect
  tam `board.get` refetch kurtarmasını korur.
- `in-flight-store`, temp kayıt server sonucu gelene kadar `clientMutationId`yi tutar;
  aynı client'ın realtime echo'su optimistic kaydı ikinci kez eklemez.

Örnek create akışı:

```ts
const clientMutationId = crypto.randomUUID();
const tempId = `tmp:${clientMutationId}`;

onMutate: async (input) => {
  await queryClient.cancelQueries(commentFilter);
  const snapshot = queryClient.getQueryData(commentKey);
  queryClient.setQueryData(commentKey, (old) =>
    applyCommentAdd(old, optimisticComment({ ...input, id: tempId })),
  );
  patchBoardCardCount(cardId, 'commentCount', +1);
  return { snapshot, tempId };
};
```

**Dokunulması beklenen alanlar:** `apps/web/src/lib/board-cache/*`,
`card-detail-dialog.tsx`, `card-detail-comments.tsx`, checklist bileşenleri,
`add-card-form.tsx`, `add-list-form.tsx` ve realtime in-flight/handler testleri.

**Geliştirme ipuçları:**

- Counter değeri hiçbir zaman sıfırın altına düşmemeli.
- Temp entity, gerçek entity ile yalnız id üzerinden değil `clientMutationId` üzerinden
  eşleştirilmelidir; hızlı ardışık aynı içerikli yorumlar karıştırılmamalı.
- Mutation retry otomatik açılmamalı; idempotency olsa bile kullanıcıya kontrollü
  “tekrar dene” davranışı korunmalı.
- Cache primitive'leri React ve QueryClient bağımsız pure fonksiyon olarak test edilmeli.
- Aynı kartta iki eşzamanlı optimistic işlem için tek global snapshot yerine mutation
  bazlı rollback/delta yaklaşımı test edilmelidir; eski snapshot yeni başarılı işlemi
  ezmemelidir.

**Faz çıkış kriteri:** Kart/list/comment/checklist ana işlemleri p75 ≤ 50 ms görsel
geri bildirim verir; normal başarı yolunda tam-board refetch sayısı sıfırdır; rollback,
duplicate echo ve concurrent mutation testleri geçer.

#### Faz C — Kart ve liste render mimarisini hafifletme

> **Uygulama durumu — 2026-09-17:** `ListColumn`, kart referanslarını sığ
> karşılaştıran `memo` sınırıyla sarıldı. Bir kartın cache güncellemesinde
> değişmeyen kardaki ve listelerdeki render zinciri kesilir; DnD context
> güncellemeleri bilinçli olarak bu sınırı aşar. Tek action-host'a geçiş henüz
> yapılmadı; o değişiklik etkileşim mimarisini geniş çapta değiştirdiğinden,
> React Profiler baseline'ı alınarak ayrı tamamlanmalıdır.

**Ne yapılacak?** Her kartın kendi mutation/dialog/menu altyapısını kurması önlenecek;
değişmeyen listelerin referansları korunacak.

**Nasıl yapılacak?**

- Pano kökünde bir `BoardCardActionsProvider` veya eşdeğer hook kurulur. Card archive,
  delete, complete, update, label/member ve attachment mutation hook'ları pano başına
  bir kez oluşturulur.
- `CardItem` salt kart yüzü + DnD registration + open/context-menu tetikleyicisine
  indirgenir. Aktif kart kimliği provider'a yazılır.
- Tek `CardContextMenuHost` ve tek dialog host pano kökünde aktif karta göre render
  edilir. Menü açılırken güncel kart `cardId` ile cache'ten okunur; kapanmış-overwrite
  edilmiş eski prop closure'ı kullanılmaz.
- `cardsByList` helper'ı önceki map'i alır ve kart id/referans dizisi değişmeyen listenin
  array referansını geri döndürür.
- `ListColumn` ölçümle doğrulandıktan sonra `memo` ile sarılır; props içindeki
  `allLists`, `boardLabels`, `boardMembers` ve action callback'leri stabil tutulur.

Önerilen sorumluluk sınırı:

```txt
BoardColumns
  ├─ BoardCardActionsProvider   → mutation hook'ları bir kez
  ├─ ListColumn[]               → liste görünümü ve DnD
  │    └─ CardItem[]            → hafif sunum + registerCard
  └─ CardActionHost             → tek context menu + tek dialog seti
```

**Dokunulması beklenen alanlar:** `board-columns.tsx`, `list-column.tsx`,
`card-item.tsx`, yeni action context/host dosyaları ve board cache view-model helper'ı.

**Geliştirme ipuçları:**

- Provider value her render'da yeni obje olursa bütün kartlar yeniden render edilir;
  action API'si stabil callback'lerle veya ayrı state/action context'leriyle kurulmalıdır.
- DnD'nin kart element ref'i `CardItem`te kalmalı; action host'a taşınmamalı.
- Context menu koordinatı ve keyboard ile açma davranışı korunmalı.
- Tek host'a geçerken aynı anda yalnız bir destructive dialog açık olmalı; aktif kart
  silinirse host kendini kapatmalı.
- `memo` eklemeden önce ve sonra React Profiler `actualDuration` karşılaştırılmalı.

**Faz çıkış kriteri:** 500 kart mount'unda mutation observer/hook sayısı kart sayısıyla
doğrusal büyümez; React actual duration baseline'a göre hedeflenen düşüşü gösterir;
menü, keyboard, yetki ve drag testleri davranış değişmeden geçer.

#### Faz D — Kart modalını kademeli yükleme

> **Uygulama durumu — 2026-09-17:** `CardDetailDialog` yorum, aktivite ve
> attachment sorgularını koşullu `enabled` ile ertelemektedir: yorumlar yalnız
> yorum sidebar'ı açıldığında, aktivite kendi sekmesinde, attachment ise galeri
> ya da ilgili ekleme/kapak görünümü açıldığında yüklenir. Kart, checklist ve
> üst metadata başlangıçta korunur. `comment.list` son 50 yorumu döndürerek
> limitsiz ilk yüklemeyi keser; UI sırası en eskiten yeniye korunur. API tarafında
> `(createdAt,id)` cursor kabul edilir. Web modalı, yalnız tam bir sayfa varsa
> "Eski yorumları yükle" denetimini gösterip ilk satırı cursor olarak yollar;
> dönen sayfayı mevcut sıralamayı bozmadan öne ekler. Hover prefetch ve mobil
> thread arayüzünün aynı denetime taşınması ayrı uyumluluk işleridir.

**Ne yapılacak?** Kart modalı ilk açılışta yalnız görünür çekirdek veriyi yükleyecek;
yorum, aktivite, ek ve picker verileri ihtiyaç anında yüklenecek.

**Nasıl yapılacak?**

- `useQueries` içindeki sorgular görünür bölümlere ayrılır. `card.get` ve checklist
  çekirdekte; comments yalnız sidebar/comments, activity yalnız activity tab,
  attachments yalnız galeri/kapak seçici açıldığında `enabled` olur.
- Pano üyeleri ve etiketleri board cache'inde varsa tekrar fetch edilmez; picker ilk
  açılışında eksikse query aktive edilir.
- `comment.list` input'una cursor ve limit eklenir; ilk sayfa 30–50 kayıt döndürür.
  `(createdAt, id)` bileşik cursor kullanılır ve mevcut ascending UI sırası korunur.
- Notification deep-link hedef yorumu ilk sayfada değilse API hedef çevresini getiren
  ayrı güvenli yol veya cursor sayfalarını kontrollü ilerleten çözüm kullanır; limitsiz
  listeye geri dönülmez.
- Kart hover/focus prefetch'i deneysel tutulur: kısa gecikme sonrası `card.get` ve modal
  chunk yüklenir; pointer karttan hızla çıkarsa gereksiz istek başlatılmaz.

**Dokunulması beklenen alanlar:** `card-detail-dialog.tsx`, sidebar/tab bileşenleri,
`packages/domain/src/schemas/comment.ts`, `packages/api/src/routers/comment.ts`, query
testleri ve notification deep-link testleri.

**Geliştirme ipuçları:**

- Yeni procedure değil, mevcut `comment.list` için additive input/output genişletmesi
  tercih edilir; tRPC ana sözleşmesi korunur.
- Cursor yalnız `createdAt` olmamalı; eşit timestamp'te kayıt atlamamak için `id` ile
  tie-break yapılmalı.
- Query kapatılıp açıldığında cache korunmalı; sekme değişiminde spinner yerine son veri
  gösterilmelidir.
- Modal kabuğu, yorum/aktivite beklemeden açılmalı; alt bölüm skeleton'ları layout shift
  üretmemeli.

**Faz çıkış kriteri:** Modal ilk açılışındaki zorunlu query sayısı azalır; 2.000 yorumlu
kartta ilk görünür kabuk bütçeyi karşılar; pagination ve deep-link testleri geçer.

#### Faz E — `board.get` projection ve PostgreSQL sorgu planı

> **Uygulama durumu — 2026-09-17:** `board.get` kart özetinden tam
> `description` gövdesi çıkarıldı; UI için `hasDescription` işareti döner ve
> ayrıntı `card.get`te kalır. `cards_active_board_position_idx` partial index'i
> migration `0058_cultured_rattler.sql` ile eklendi ve yerel PostgreSQL'e
> uygulandı. 2026-09-17 yerel seed'inde en büyük panoda 31 aktif kart vardı;
> `EXPLAIN (ANALYZE, BUFFERS)` filtrede bu index için `Bitmap Index Scan`,
> toplamda 0.333 ms ve 49 shared buffer gösterdi. Yeni opt-in fixture ile
> 2.009 aktif kartta `ANALYZE` sonrası planner 1.849 ms / 246 shared buffer ile
> doğru biçimde `Seq Scan + Sort` seçti: bu test veritabanında tek pano cards
> tablosunun çoğunu kapladığından index seçici değil. Sonuç, index için henüz
> genellenebilir p95 kazanımı kanıtlamaz; çok panolu staging verisiyle read/write
> karşılaştırması yapılmadan üretim kararı verilmemelidir.

**Ne yapılacak?** Pano payload'ındaki gereksiz büyük alanlar çıkarılacak ve aktif kart
sorgusu gerçek plan verisiyle iyileştirilecek.

**Nasıl yapılacak?**

- `board.get.cards[]` projection'ına additive `hasDescription` eklenir. Web ve mobil
  kart yüzleri/drag preview bu boolean'a taşınır.
- Tüketiciler taşındıktan sonra tam `description` board projection'ından kaldırılır;
  `card.get` tam açıklamanın tek kaynağı olarak kalır.
- Önce mevcut sorgunun `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` çıktısı 100/500/2.000/
  10.000 kartta alınır.
- Plan sort veya heap scan maliyeti gösteriyorsa `(board_id, list_id, position) WHERE
archived_at IS NULL` partial index migration'ı staging'de denenir ve sorgu
  `ORDER BY list_id, position` ile ölçülür.
- Index yazma maliyeti, boyutu ve card move/update etkisi de ölçülür. Okuma kazanımı
  küçükse migration tutulmaz.
- Response serialize/transfer/parse byte ve süreleri SQL süresinden ayrı raporlanır.

**Dokunulması beklenen alanlar:** `packages/api/src/routers/board.ts`, board router
testleri, web/mobil board card tipleri, `packages/db/src/schema/cards.ts` ve ancak ölçüm
olumluysa yeni Drizzle migration.

**Geliştirme ipuçları:**

- Alanı tek adımda kaldırmak mobil/web sürüm uyumluluğunu kırabilir; önce additive
  boolean, sonra tüketici geçişi, en son eski alanın kaldırılması uygulanmalıdır.
- Drizzle'da TS kolon adları camelCase kalır; migration DB'de snake_case kullanır.
- `CREATE INDEX CONCURRENTLY` transaction içinde çalışmaz; üretim migration mekanizması
  bu komutu desteklemiyorsa bakım penceresi ve güvenli alternatif ayrıca belirlenmelidir.
- `EXPLAIN ANALYZE` sorguyu gerçekten çalıştırır; yazma sorgularında rollback veya salt
  okunur staging kullanılmalıdır.

**Faz çıkış kriteri:** Response byte/parse süresi düşer; web ve mobil kart yüzleri
pariteyi korur; index yalnız ölçülmüş p95/buffer kazanımı varsa repoda kalır.

#### Faz F — Büyük pano virtualization

> **Uygulama durumu — 2026-09-18:** İlk düşük-riskli basamak uygulanır:
> bir listede 50 veya daha fazla kart olduğunda kart kabuğu `content-visibility:
auto` ve yaklaşık intrinsic boyutla tarayıcının ekran dışındaki kartlar için
> paint/layout işini ertelemesine izin verir. Kartlar DOM'da kalır; böylece
> Pragmatic DnD kaydı, klavye sırası ve drop hedefleri değişmez. Tam dinamik
> ölçümlü virtualization ancak 200/1.000 kart DnD benchmark'ı bu ara basamağın
> yetersiz olduğunu gösterirse uygulanacaktır. İlk 2.009 kart karşılaştırması
> bu basamağın yeterli olmadığını gösterdiği için, 200+ kartta bağımlılıksız
> dikey pencereleme uygulanacaktır: 112 px sabit slot + 8 kart overscan,
> üst/alt spacer ve liste scroll offset'i. Kart gövdesi slot içinde minimum
> yüksekliğe sabitlenir; bu, değişken yükseklik cache'i gelene kadar layout
> zıplamasını engeller. PDD sadece mount edilmiş kartları kaydeder; liste
> alanının uç-drop hedefi korunur ve scroll ile hedef pencereye alınır.
> **Uygulandı:** `ListColumn`, 200 kart eşiğinde viewport + 8 kart overscan
> render eder; 2.009 kart E2E senaryosunda 29 kart mount edilmiştir. Küçük
> listeler doğrudan render yolunu ve tam PDD yüzeyini korur.

**Ne yapılacak?** Çok kartlı listelerde yalnız viewport ve overscan alanındaki kartlar
mount edilecek; küçük panolar mevcut basit render yolunu koruyacak.

**Nasıl yapılacak?**

- Önce `content-visibility: auto` ara deneyi yapılır ve INP/layout kazanımı ölçülür.
- Liste başına kart sayısı belirlenen eşiği (başlangıç deneyi: 50) aşınca dikey
  virtualization açılır; düşük sayıda doğrudan `.map()` yolu korunur.
- Dinamik kart yüksekliği ölçülür ve id bazlı size cache tutulur. Kapak yüklenmesi gibi
  yükseklik değişimlerinde yalnız ilgili satır yeniden ölçülür.
- Overscan, hızlı scroll ve drag auto-scroll sırasında drop hedeflerinin erken mount
  olmasını sağlayacak kadar büyük seçilir; sabit sayı profiler ile ayarlanır.
- Drag event takibi sanal listeden çıkmayan board-level Pragmatic DnD monitor'da tutulur.
  Drag preview ayrı overlay'dir; kaynak DOM unmount olsa bile drop tamamlanır.
- Placeholder yüksekliği ölçüm cache'inden alınır; kartların zıplaması engellenir.
- Screen reader/keyboard kullanıcıları için sanal olmayan anlamlı sıra bilgisi ve kartı
  odakta tutan scroll-to-item yolu test edilir.

**Dokunulması beklenen alanlar:** `list-column.tsx`, `use-board-dnd.ts`, DnD context,
kart ölçüm/virtualization helper'ları ve Playwright büyük-pano fixture'ları.

**Geliştirme ipuçları:**

- Yeni virtualization kütüphanesi eklemeden önce mevcut bağımlılıklarla küçük bir
  prototip ölçülmelidir; paket gerekiyorsa teknoloji kararı önce docs'a yazılmalıdır.
- Yatay liste virtualization'ına ilk turda girilmemeli; önce en büyük DOM kaynağı olan
  dikey kart listeleri çözülmelidir.
- Drag sırasında sanal satır recycle edilip başka kart id'si almamalı; `key` her zaman
  kalıcı kart id'sidir.
- Filtre değişiminde scroll offset ve ölçüm cache'i kontrollü sıfırlanmalıdır.

**Faz çıkış kriteri:** 2.000 kartlı panoda DOM node ve DnD registration sayısı viewport
ile sınırlı kalır; aynı-list/cross-list drag, auto-scroll, keyboard ve screen reader
testleri geçer; küçük pano performansı gerilemez.

#### Faz G — Son test, karşılaştırma ve güvenli teslim

**Ne yapılacak?** Faz A'daki testlerin tamamı değiştirilmeden yeniden çalıştırılacak,
önce/sonra farkı raporlanacak ve regresyon kapıları uygulanacak.

**Nasıl yapılacak?**

- Aynı seed, production build, browser, CPU/network profili ve DB durumu kullanılır.
- “Ölçüm sonuçları” tablosunun `Sonra`, `Fark` ve `Sonuç` sütunları doldurulur.
- Fonksiyonel Vitest/RTL/integration/Playwright testlerinin yanında k6 smoke/full,
  React Profiler ve SQL plan karşılaştırması eklenir.
- Kazanım göstermeyen karmaşık optimizasyon geri alınır veya gerekçesi açıkça yazılır;
  özellikle virtualization ve yeni index sırf uygulanmış olmak için tutulmaz.
- Üretime kontrollü açılış gerekiyorsa yalnız performans davranışı için kısa ömürlü
  feature flag kullanılabilir. İki kalıcı cache/render yolu bırakılmaz; sonuç doğrulanınca
  eski yol temizlenir.
- Deploy sonrası Sentry/RUM INP, hata oranı, API p95 ve realtime latency izlenir;
  laboratuvar kazanımı saha verisinde doğrulanır.

**Geliştirme ipuçları:**

- Önce/sonra yüzde farkın yanında mutlak süre ve varyans mutlaka yazılmalıdır.
- Bir metrik iyileşirken bellek, erişilebilirlik veya doğruluk geriliyorsa iş başarılı
  sayılmaz.
- Sonuçlar commit mesajı ve bu belgedeki ölçüm özetiyle izlenir; ayrı issue/work
  register oluşturulmaz.

**Faz çıkış kriteri:** Karşılaştırma tablosu tamamlanmış, bütün kabul kapıları geçmiş,
kritik metriklerde açıklanmamış %5+ regresyon kalmamış ve saha izleme planı aktif
olmalıdır.

## 22.5 Ölçüm sözleşmesi ve performans bütçeleri

### Veri setleri

| Profil            | Liste | Aktif kart | Kart başına içerik                   | Amaç                                                         |
| ----------------- | ----: | ---------: | ------------------------------------ | ------------------------------------------------------------ |
| Küçük             |     5 |        100 | 2 etiket, 1 üye                      | Günlük hızlı akış                                            |
| Orta              |    12 |        500 | 3 etiket, 2 üye, sayaçlar, %20 kapak | Gerçekçi ağır pano                                           |
| Büyük             |    25 |      2.000 | karışık kapak/etiket/checklist       | Virtualization kapısı                                        |
| Sınır             |    50 |     10.000 | minimal metadata                     | API/DB sözleşmesinin kırılma noktası; normal UX hedefi değil |
| Uzun yaşayan kart |     — |          1 | 2.000 yorum, 20 checklist, 500 madde | Modal pagination/lazy-load doğrulaması                       |

### Kabul bütçeleri

| Metrik                                                      |                                                                                 Hedef |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------: |
| Kullanıcı eylemi → optimistic görsel geri bildirim          |                                                             p75 ≤ 50 ms, p95 ≤ 100 ms |
| Pano etkileşim INP                                          |                                                 p75 ≤ 200 ms (mobil ve masaüstü ayrı) |
| Drag sırasında ana thread frame işi                         |                                                p95 ≤ 16 ms; 50 ms+ long task olmamalı |
| `board.get` API                                             |                   mevcut resmi SLO p95 < 500 ms; sıcak DB stretch hedefi p95 < 250 ms |
| Kart modalı görünür kabuk                                   |                                            cache-warm p75 ≤ 200 ms; cold p75 ≤ 600 ms |
| Tek kart/comment/checklist mutation sonrası zorunlu refetch |                                             normal başarı yolunda 0 tam-board refetch |
| Realtime event → görünür UI                                 |                                                     mevcut hedef p95 < 100 ms korunur |
| 500 kart ilk mount                                          | önceki baseline'a göre ≥ %40 daha düşük React actual duration ve belirgin heap düşüşü |

Bu bütçeler CI'da mutlak olarak kırılgan cihaz sürelerine bağlanmamalı. API/load eşikleri
k6 ile, browser regresyonu sabit Docker/CI donanımında Playwright trace + custom metric
ile, gerçek kullanıcı sonucu ise Sentry browser tracing/RUM ile izlenmelidir. INP bir
sayfanın yaşamı boyunca etkileşimden sonraki paint'e kadar olan gecikmeyi ölçer; yalnız
ilk yükleme metriği değildir: [web.dev — Interaction to Next Paint](https://web.dev/articles/inp).

### Geliştirme öncesi ve sonrası karşılaştırma protokolü

Performans geliştirmesi **baseline alınmadan başlamış sayılmaz** ve aynı test paketi
geliştirme sonunda tekrar çalıştırılmadan **tamamlanmış sayılmaz**. “Hızlandı” kararı
yalnız gözleme veya tek bir başarılı koşuya göre verilmez.

#### 1. Ön test — baseline

Kod değişikliğinden önce aşağıdakiler kaydedilir:

- test edilen Git commit SHA,
- Node/pnpm/browser/PostgreSQL sürümü, CPU ve bellek limiti,
- production build ve aynı environment ayarları,
- kullanılan deterministik seed ile veri seti boyutu,
- cold-cache ve warm-cache sonuçları ayrı,
- browser trace, React Profiler export'u, k6 JSON özeti,
- `board.get` için `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`,
- response byte, query sayısı, tam-board refetch sayısı ve realtime event sayısı,
- fonksiyonel test sonucu: drag, optimistic rollback, realtime echo/gap ve yetki
  davranışları.

Her senaryo en az bir ısınma koşusundan sonra **en az 5 ölçüm koşusu** ile çalıştırılır;
tek en iyi değer değil median, p75 ve p95 raporlanır. Tarayıcı ölçümleri aynı viewport,
CPU throttling ve network profiliyle yapılır.

#### 2. Son test — aynı paketi tekrar çalıştır

Geliştirme tamamlandığında baseline'daki commit dışındaki bütün koşullar aynı tutulur:
aynı fixture/seed, aynı donanım veya CI runner sınıfı, aynı production build modu, aynı
browser ve aynı cold/warm ayrımı. Yeni test eklenebilir; fakat baseline senaryosu
değiştirilerek eski-sonuç karşılaştırması geçersiz hale getirilemez.

#### 3. Sonuçları yan yana raporla

Uygulama çalışmasının kapanışında bu belgenin “Ölçüm sonuçları” alt bölümüne veya aynı
koşuya ait CI artifact özetine aşağıdaki tablo doldurulur. Ham trace/JSON/SQL planı CI
artifact olarak saklanır; tablo yalnız karar vermek için gerekli özeti taşır.

| Senaryo / metrik                            | Önce | Sonra | Fark |                                Hedef | Sonuç    |
| ------------------------------------------- | ---: | ----: | ---: | -----------------------------------: | -------- |
| 500 kart — ilk React mount `actualDuration` |    — |     — |    — |              önceye göre ≥ %40 düşük | Bekliyor |
| 500 kart — heap / DOM node / query observer |    — |     — |    — | anlamlı düşüş, bellek regresyonu yok | Bekliyor |
| Kart ekle — optimistic feedback p75         |    — |     — |    — |                              ≤ 50 ms | Bekliyor |
| Yorum ekle — tam-board refetch              |    — |     — |    — |                                    0 | Bekliyor |
| Checklist toggle — optimistic feedback p75  |    — |     — |    — |                              ≤ 50 ms | Bekliyor |
| Kart modalı — warm/cold görünür kabuk p75   |    — |     — |    — |                       ≤ 200 / 600 ms | Bekliyor |
| Drag — drop-to-paint p95 / long task        |    — |     — |    — |                 ≤ 16 ms / 50 ms+ yok | Bekliyor |
| `board.get` — warm p95 / response byte      |    — |     — |    — |         < 250 ms / önceye göre düşük | Bekliyor |
| Realtime event → UI p95                     |    — |     — |    — |                             < 100 ms | Bekliyor |
| Fonksiyonel/regresyon testleri              |    — |     — |    — |                      tamamı başarılı | Bekliyor |

Fark yüzdesi süre/bellek/byte gibi “düşük iyidir” metriklerinde
`(önce - sonra) / önce × 100` ile hesaplanır. Sonuçlarda hem mutlak değer hem yüzde
verilir; örneğin yalnız “%60 hızlı” yazılmaz.

#### 4. Kabul kapısı

- Fonksiyonel testlerden biri kırılırsa performans kazanımı kabul edilmez.
- Hedeflenen sıcak yol iyileşmeli; kritik komşu metrikte %5'ten büyük regresyon varsa
  neden açıklanıp düzeltilmeden iş kapanmaz.
- Sonuç istatistiksel gürültü içindeyse (koşular arası varyans kazanımdan büyükse) daha
  fazla koşu yapılır; “iyileşti” sonucu yazılmaz.
- Index veya sorgu değişikliği yalnız gerçek `EXPLAIN ANALYZE` planı ve buffer sonucu
  olumluysa tutulur.
- Virtualization/action-host değişikliklerinde keyboard, screen reader, auto-scroll,
  cross-list drop ve rollback testleri önce/sonra birlikte geçmelidir.
- Son raporda başarısız veya nötr sonuçlar da saklanır; yalnız olumlu metrik seçilmez.

### Ölçüm sonuçları

Önceki kodun aynı fixture'da çalıştırılmış tarayıcı baseline'ı yoktur; bu yüzden aşağıdaki
sonuçlar "önce/sonra" farkı olarak yorumlanmaz. Opt-in `pnpm e2e:seed --
--perf-cards=2000` fixture'ı bundan sonraki baseline ve sonrası koşuların aynı veriyle
tekrarlanmasını sağlar. Geliştirme sonrası aynı tablo “Sonra”,
“Fark” ve “Sonuç” sütunlarıyla tamamlanacaktır.

> [!warning] İlk karşılaştırma — 2026-09-18
> Bu ilk koşu aynı makinede, aynı Playwright Chromium sürümünde, aynı 2.009 kartlık
> deterministic fixture ile yapıldı; fakat **geliştirme sunucusu** kullanıldı ve her
> taraf yalnız birer kez ölçüldü. Bu nedenle production p75/p95 kabul sonucu değildir.
> Yine de sonuç nettir: mevcut `content-visibility` ara katmanı tüm `CardItem`
> bileşenlerini mount etmeyi engellemediğinden büyük pano görünür olma süresini
> iyileştirdiği kanıtlanamamıştır. Tam virtualization/action-host refactor'u olmadan
> Faz F/G tamamlanmış kabul edilmez.

| Senaryo / metrik | Önce (HEAD `fb707d3`) | Sonra (çalışma ağacı) | Fark | Sonuç |
| --- | ---: | ---: | ---: | --- |
| 2.009 kart — pano görünür olma | 9.923 ms | 13.889 ms | **-%40,0** | Başarısız; DOM mount baskın |
| `board.get` kaynak süresi | 393,1 ms | 188,9 ms | **%51,9 daha düşük** | Olumlu, tek koşu |
| Mount edilen kart DOM düğümü | 2.009 | 2.009 | %0 | Beklenen virtualization kazanımı yok |

Virtualization sonrası aynı fixture'daki sonraki geliştirme-sunucusu koşusu:

| Senaryo / metrik | Pencereleme öncesi | Pencereleme sonrası | Fark | Sonuç |
| --- | ---: | ---: | ---: | --- |
| 2.009 kart — pano görünür olma | 13.889 ms | 874 ms | **%93,7 daha düşük** | Olumlu; sıcak dev koşusu |
| Mount edilen kart DOM düğümü | 2.009 | 29 | **%98,6 daha düşük** | Kabul edildi |
| `board.get` kaynak süresi | 188,9 ms | 148,2 ms | %21,5 daha düşük | Tek koşu |

Bu ikinci tablo production p75/p95 değildir: ilk çalışma soğuk, ikincisi
ısınmış geliştirme sunucusundaydı. Ancak DOM/mount farkı deterministik kabul
kriterini karşılar. Üretim derlemesinde beş ısınmış tekrar ile süre istatistiği
ayrıca alınmalıdır.

Ham ölçüm `BOARD_PERF_METRIC` olarak Playwright JUnit çıktısına ve test attachment'ına
yazılır. Production build ile en az beş ısınmış koşu, median/p75/p95 ve React Profiler
ölçümü alınmadan bu tablo için ürün kabulü verilmeyecektir.

## 22.6 Gözlemlenebilirlik önerisi

1. `board.get` span alanları: `boardId` yerine PII-safe bucket'lar — `listCount`,
   `cardCountBucket`, `coverCountBucket`, `responseBytes`, her alt sorgu süresi.
2. Web custom measurements: `board_data_ready`, `board_first_cards_committed`,
   `card_modal_shell_visible`, `optimistic_feedback_applied`, `drop_to_paint`.
3. React Profiler yalnız test/profiling build'inde `BoardColumns`, `ListColumn`,
   `CardDetailDialog` sınırlarında.
4. PostgreSQL staging'de `pg_stat_statements`; `board.get` sorgularını fingerprint ile
   p50/p95/p99 ve rows/bytes bazında takip.
5. Sentry transaction tag'leri yüksek-cardinality id içermemeli; sayılar bucket olmalı.
6. `pnpm load:smoke` / `pnpm load:full` dokümanda tanımlı olmasına rağmen repoda yok;
   scriptler eklenmeden performans SLO'su “enforced” kabul edilmemeli.

## 22.7 Regresyon test matrisi

- Aynı listede ve listeler arasında drag: 500 kart + virtualization açık.
- Drag sırasında kaynak kart DOM'dan çıkarsa board-level monitor drop'u tamamlıyor.
- Hızlı ardışık 20 checklist toggle: sıra ve sayaç doğru, tam-board refetch yok.
- Yorum optimistic temp kaydı: success reconcile, ağ hatasında rollback, realtime echo
  duplicate üretmiyor.
- Liste/kart temp entity create: server id ile atomik değişim, focus/composer korunuyor.
- Uzak kullanıcı comment/checklist event'i yalnız ilgili kart/list cache'ini güncelliyor.
- Sequence gap/reconnect: optimize başarı yolu ne olursa olsun tam refetch kurtarması
  çalışıyor.
- 2.000 yorumlu kart: ilk yorum sayfası hızlı, eski sayfalar cursor ile yükleniyor,
  notification deep-link hedef yorum bulunana kadar kontrollü sayfa çekiyor.
- Viewer/member/admin menü ve mutation yetkileri action-host refactor'ında değişmiyor.
- Web ve mobil `board.get` additive projection geçişi sırasında birlikte çalışıyor.

## 22.8 Bilinçli olarak önerilmeyenler

- Her interaction sonrası `router.refresh()` veya tam `board.get` refetch'i.
- Optimistic UI yerine debounce ile kullanıcı geri bildirimini geciktirmek.
- Socket.IO'yu kalıcı kaynak yapmak ya da DB/outbox kurtarmasını kaldırmak.
- Ölçmeden her bileşene `memo`/`useMemo` eklemek.
- Pano verisini tek seferde Redis'e kopyalayıp invalidation problemini büyütmek.
- DnD davranışı, keyboard erişilebilirliği ve realtime uzlaşması çözülmeden kör pagination.
- Integer `order` alanına dönmek veya drag sırasında backend mutation göndermek.

## 22.9 Sonuç

Kullanıcının “çok hızlı” hissetmesini sağlayacak ilk kazanım DB'yi mikro-optimize etmekten
önce eylemin ilk 50–100 ms'sinde doğru local sonucu göstermektir. Pusula'da bu hedefe en
kısa yol:

1. yorum/checklist/list/card create işlemlerini gerçek optimistic hale getirmek,
2. geniş invalidation yerine hedefli cache delta uygulamak,
3. kart başına ağır mutation/menu ağını tek board-level action host'a taşımak,
4. 500+ kartta kolon referanslarını korumak ve kart DOM'unu pencerelemek,
5. ardından ölçülmüş SQL planı ve payload verisiyle `board.get`i inceltmektir.

Bu sıra mevcut tRPC, PostgreSQL, TanStack Query, Socket.IO outbox ve Pragmatic DnD
kararlarını korur; yeni bir state management veya component library gerektirmez.
