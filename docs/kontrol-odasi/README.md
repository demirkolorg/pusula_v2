---
title: "Kontrol Odası — Süreç Hakemliği Tab'ı"
description: "Bu konuşmanın/tab'ın görevi: kod yazmadan sürecin canlı projeksiyonu, dokümantasyon işleri ve Linear senkronu; komut seti."
aliases:
  - "Kontrol Odası"
  - "Süreç Hakemi Tab"
  - "Control Room"
tags:
  - "pusula"
  - "process/control-room"
  - "obsidian/vault"
type: "process"
axis: "process"
status: "active"
parent: "[[docs/README|Pusula Belgeleri]]"
related:
  - "[[docs/process/README|Süreç]]"
  - "[[docs/process/05-is-kayit-defteri|İş Kayıt Defteri]]"
  - "[[docs/process/02-mvp-faz-plani|MVP Faz Planı]]"
  - "[[docs/process/04-otomatik-is-akisi-protokolu|Otomatik İş Akışı Protokolü]]"
updated: 2026-05-12
---
# Kontrol Odası — Süreç Hakemliği Tab'ı

> Eksen: **süreç** (operasyonel/meta). Bu dosya, bir Claude Code konuşmasının ("kontrol odası
> tab'ı") rolünü ve komutlarını sabitler. Pusula birden fazla paralel tab ile geliştiriliyor; bu tab **kod
> yazmaz**, sürecin canlı projeksiyonunu tutar, dokümantasyonu ve Linear senkronunu yürütür.
> [`05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md)'nin etkileşimli/canlı hali gibi düşün.

## 1. Bu tab nedir?

- **Kontrol odası / süreç hakemi:** "Nerede kaldık? Ne yapıyoruz? Ne yapacağız?" sorularının tek merkezi.
- **Kod yazılmaz.** Uygulama/paket kodu (`apps/*`, `packages/*`) bu tab'da değiştirilmez — o işler diğer tab'larda.
- Bu tab yalnızca `docs/` + Linear + süreç koordinasyonu ile çalışır.

## 2. Görev — beş başlık

### 2.1 Süreç projeksiyonu (büyük resim)
- Faz planı + iş kayıt defteri + aktif tab'ların durumu burada konsolide tutulur.
- Sorulduğunda anında durum özeti verir; iş bittikçe / durum değiştikçe defteri ve faz planını güncel tutar.

### 2.2 Dokümantasyon işleri (bu tab'a ait)
- `docs/` değişiklikleri burada yapılır: yaklaşan iş için "önce belge" adımları, tarihli ADR satırları
  ([`../architecture/02-teknoloji-kararlari.md`](../architecture/02-teknoloji-kararlari.md) → "Karar kaydı"),
  faz statüsü ([`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md)), iş kayıt defteri satırları.
- Obsidian standardı korunur: frontmatter, `aliases`, `tags`, `parent`/`related`, `updated`, MOC/README bağlantıları
  ([`../process/06-obsidian-dokumantasyon-kurallari.md`](../process/06-obsidian-dokumantasyon-kurallari.md)).
- Gelen istek mevcut belgeyle çelişiyorsa işe başlamadan "belgeyi mi güncelleyelim, koda mı sadık kalalım?" diye sorar.

### 2.3 Linear senkronu
- Linear issue'ları ↔ iş kayıt defteri ↔ koddaki gerçek durum hizalı tutulur (durum geçişleri, yeni issue, kapanış yorumları).
- Protokol: [`../process/04-otomatik-is-akisi-protokolu.md`](../process/04-otomatik-is-akisi-protokolu.md) ve [`../process/01-linear-is-akisi.md`](../process/01-linear-is-akisi.md). Bu, dokümantasyon işinin bir parçasıdır.
- Workflow state katmanları (Demirkol takımı): `Backlog` (uzak) → `Sonraki Faz` (bir sonraki faz / planlı; Unstarted kategorisinde, Backlog ile Todo arası) → `Todo` (mevcut fazın bekleyen işleri) → `In Progress` → `Done` / `Canceled`.

### 2.4 Hakem / kontrol mühendisi duruşu
- Kullanıcı sordukça kendi kontrollerini yapar: `docs/` ↔ kod ↔ Linear arasında tutarsızlık, eksik parça, çelişki var mı?
- Gerekli gördüğü dokümantasyon eksikliklerini/düzeltmelerini önerir; onay alınca uygular (sınır: yalnızca `docs/`).
- "Kontrol mühendisinin açılış raporu" = istendiğinde docs ↔ kod ↔ Linear tutarlılık denetimi + eksik/çelişki listesi (`doc-denetim` komutu).

### 2.5 Ürün boşluğu / fırsat taraması (proaktif)
- Sistemin **Trello / Linear / Notion gibi olgun ürünler** çizgisinde ilerlemesi için: mevcutta olmayan ama olması beklenen/faydalı özellikleri, eksik UX akışlarını ve faz planında hiç yer almayan parçaları bulur (örnek: signup'ta default workspace → [[../process/02-mvp-faz-plani|Faz 1]] DEM-46/DEM-47).
- Mevcut geliştirme **sürerken paralel yapılabilecek** işleri (bağımsız, blocked olmayan, başka tab'larla çakışmayan) tespit eder.
- Çıktı: analiz + öneri listesi (her öğe: ne, neden gerekli [referans ürün], önerilen faz, paralel mi, kaba bağımlılık; zaten planlı olanlar "kapsamda" işaretlenir) → kullanıcıya `AskUserQuestion` ile sunulur → onaylananlar için yeni Linear issue(lar) + `docs/` (faz planı, gerekirse domain/architecture) güncellenir. Kod yazılmaz. (`bosluk-tara` komutu — §4.)

## 3. Sınırlar — bu tab ne yapmaz

- `apps/*` ve `packages/*` altında **kod değişikliği yapmaz** (test dahil).
- Diğer tab'ların **aktif çalıştığı** `docs/` dosyalarına dokunmaz — merge çakışmasını önlemek için (güncel durum §5'teki tab haritasında).
- Ortak çakışma noktası [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md): birden fazla tab satır ekler. Bu tab onu kısa tutar, mümkünse en son yazar, merge'de kendine düşeni temiz bırakır.

## 4. Komutlar

Bu tab'da kullanabileceğin adlandırılmış işlemler. Adını yazınca bu tab çalıştırır; her biri ayrıca
`.claude/commands/<ad>.md` slash komutu olarak da var (`/panorama` gibi — her tab'da görünür ama prompt'unda
"kontrol odası işi" notu taşır). Hiçbiri kod yazmaz; hepsi `docs/` + Linear + analiz kapsamında.

| Komut | Slash | Ne yapar | Argüman |
| --- | --- | --- | --- |
| `panorama` | `/panorama` | Büyük resim / önünü görme: faz durumu, aktif tab'lar, sıradaki işler, açık riskler/kararlar, önerilen adımlar | — |
| `doc-denetim` | `/doc-denetim` | `docs/` ↔ kod ↔ Linear tutarlılık + Obsidian standardı taraması → bulgu listesi → onayla `docs/`-only düzeltme | — |
| `bosluk-tara` | `/bosluk-tara` | Ürün boşluğu / paralel-iş taraması: Trello/Linear çizgisinde eksik/beklenen özellikler + şimdi paralel yapılabilecek işler → analiz + öneri → onayla yeni issue + docs | — |
| `linear-senkron` | `/linear-senkron` | Hızlı: Linear ↔ `05-is-kayit-defteri.md` + `02-mvp-faz-plani.md` hizalama (eksik satır, durum güncelleme) | — |
| `faz-bol` | `/faz-bol` | Faz N epic'ini alt issue'lara böl: öneri → onay → Linear (parent + milestone + `blockedBy`) → faz planına "Faz N alt işleri" | `<N>` |
| `faz-baslat` | `/faz-baslat` | Faz N'in "önce belge" adımı + alt issue'ları `Todo`'ya alma + defter satırları + faz planı `🚧` | `<N>` |
| `devir` | `/devir` | Bu tab'ın devir notu: değişen `docs/`, açık kararlar, bekleyen catch-up, aktif tab durumu | — |
| `celiski` | `/celiski` | Gelen istek mevcut `docs/` ile çelişiyor mu; çelişiyorsa "belgeyi mi güncelleyelim, koda mı sadık kalalım?" netleştir | `<istek>` |

### Komut detayları

**`panorama`** — Okur: [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md), [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md), bu dosyanın §5'i, `git log`/`git status`, Linear (Pusula projesi, tüm state'ler). Üretir: aktif faz + kabaca % tamamlanma; `Sonraki Faz`'da bekleyenler; aktif tab'lar ve gerçek durumları (git/Linear ile karşılaştırmalı, tutarsızlık varsa belirt); açık blocker/risk/bekleyen karar; önerilen sıradaki adımlar. Çıktı kısa ve taranabilir — kod dump'ı yok.

**`doc-denetim`** — Kontrol eder: 3-yönlü tutarlılık (Linear durumları ↔ iş kayıt defteri satırları ↔ faz planı statüleri; Linear'da olup defterde olmayan / defterde olup Linear'da olmayan); "önce belge" ihlali (kodda var, `docs/`'ta yok); karar kaydı eksiği ([`../architecture/02-teknoloji-kararlari.md`](../architecture/02-teknoloji-kararlari.md) "Karar kaydı"); Obsidian standardı (frontmatter / `aliases` / `tags` / `parent`-`related` / `updated` / MOC bağlantısı; yetim not); kök `CLAUDE.md` + `.claude/skills/kontrol/SKILL.md` ↔ `docs/` pointer güncelliği; eksen ihlali (tasarım/domain/süreç içeriği yanlış klasörde). Çıktı: bulgu listesi (severity kritik/orta/düşük + ne, nerede, fix önerisi). Onayla **`docs/`-only** düzeltme + Linear senkronu uygular; kod gerektiren bulguları flagler ve ilgili tab/issue'ya not düşer.

**`bosluk-tara`** — Bağlam: faz planı + iş kayıt defteri + Linear + `docs/domain/*` + `docs/architecture/*` + git log; gerekirse implement edilmiş ekranlar/akışlar (bu tab kod yazmaz ama okuyabilir). Pusula'nın hedefi (Trello alternatifi: web/mobil, akıcı drag-drop, optimistic UI, bildirim) ile Trello/Linear/Notion/Asana tipik akışlarını karşılaştırır → (a) mevcutta olmayan ama beklenen özellik/UX akışı, (b) faz planında hiç yer almayan parça, (c) şimdi paralel yapılabilecek bağımsız iş. Çıktı: öneri listesi (öncelik + ne, neden [referans ürün], önerilen faz, paralel mi, kaba bağımlılık; planlı olanlar "kapsamda" diye işaretli — gürültü yok). Kullanıcıya `AskUserQuestion` ile sunulur → onaylananlar için Linear'da yeni issue(lar) (proje Pusula, uygun milestone, varsa epic altına, `blockedBy`, assignee proje sahibi, state `Todo`/`Sonraki Faz`) + `02-mvp-faz-plani.md` (ilgili faz alt işleri) + gerekirse `docs/domain/*`/`docs/architecture/*` notu; `05-is-kayit-defteri.md` satırı sonraki senkronda. Kod yazma — sadece öneri + issue + docs.

**`linear-senkron`** — `doc-denetim`'in dar/hızlı versiyonu: yalnızca Linear ↔ [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md) ↔ [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md) hizalaması. Eksik iş kayıt defteri satırlarını ekler, durumları/sahipleri günceller, faz statülerini düzeltir, durum lejantını Linear state setiyle hizalı tutar.

**`faz-bol <N>`** — Faz N epic'ini (Linear) okur, kapsamından alt iş önerileri çıkarır, kullanıcıdan onay/granülerlik kararı alır, Linear'da alt issue'ları oluşturur (parent = epic, milestone = `Faz N — ...`, `blockedBy` zinciri, assignee = proje sahibi), [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md)'ye "Faz N alt işleri" bölümü ekler. Henüz başlamayan faz için alt işler `Sonraki Faz` durumunda kalır (örnek: Faz 2 → DEM-25 → DEM-33–37).

**`faz-baslat <N>`** — Faz N geliştirmesi başlarken: ilgili `docs/architecture/*` + `docs/domain/*` dosyalarını faz kapsamına göre günceller ("önce belge"), Linear'da o fazın alt issue'larını `Sonraki Faz` → `Todo`'ya alır, [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md)'ye satırları ekler, faz planı statüsünü `🚧 Devam ediyor`'a çevirir. (Faz 2.0 / DEM-33 işinin genelleştirilmiş hali.)

**`devir`** — Bu tab'ın durum/devir notu: hangi `docs/` değişti (committed/uncommitted), açık kararlar, bekleyen catch-up, aktif tab haritası. Context daralırsa veya başka oturuma geçilirse kullanılır. Format: [`../process/03-faz-0-devir-notu.md`](../process/03-faz-0-devir-notu.md)'ye yakın; istenirse `~/.claude/projects/<proje>/wip-state.md`'ye de yazılır.

**`celiski <istek>`** — Gelen yeni istek/karar mevcut `docs/` (architecture / domain / process + kök `CLAUDE.md` + `.claude/skills/kontrol/SKILL.md`) ile çakışıyor mu kontrol eder. Çakışıyorsa işe başlamadan "belgeyi mi güncelleyelim, koda mı sadık kalalım?" diye netleştirir, alınan kararı kaydeder. (Kök `CLAUDE.md` §5 "Çelişki" kuralının aracı.)

## 5. Paralel tab haritası (anlık — 2026-05-12)

| Tab | İş | Durum / Linear | Dokunduğu yerler |
| --- | --- | --- | --- |
| Faz 1 tab'ları | Auth web UI & session, workspace davet akışı, workspace yönetim UI + `workspace.delete` UI, yeni kullanıcı onboarding + pano şablonu | **Done** — DEM-22/23/24/39/40/46/47 hepsi `Done`; **Faz 1 tamamlandı** ([DEM-55](https://linear.app/demirkol/issue/DEM-55) profil/hesap ekranı `Todo` ek iş olarak açık, düşük öncelik) | `apps/web/**`, `packages/ui/**`, `packages/domain`, `apps/api` (bootstrap), `docs/architecture/07,08,10`, `docs/domain/01,02,05` |
| Faz 2 tab'ları | Board/List/Card CRUD (backend) + temel board ekranı (web, drag-drop'suz) | **Done** — DEM-33 (önce-belge) + DEM-34/35/36 (backend) + DEM-37 (web) hepsi `Done`; **Faz 2 (DEM-25 epic) tamamlandı** | `packages/api`, `packages/domain`, `packages/db` (migration 0004), `apps/web`, `packages/ui`, `docs/architecture/03,04,05,08`, `docs/domain/01,02` |
| Faz 2.5A/B/C backend tab'ları | Faz 2.5.0 docs ([DEM-49](https://linear.app/demirkol/issue/DEM-49)) + comment/checklist ([DEM-50](https://linear.app/demirkol/issue/DEM-50)) + card members/label ([DEM-51](https://linear.app/demirkol/issue/DEM-51)) + board üye/davet ([DEM-52](https://linear.app/demirkol/issue/DEM-52)) backend | **Done** — DEM-49 docs + DEM-50 (`caa880d`) + DEM-51 (`b3fc9a4`) + DEM-52 (`c321154`); QA + verifier PASS; kullanıcı onayladı | `docs/architecture/02,03,04,08`, `docs/domain/01,02,05`, `packages/api`, `packages/domain`, `packages/db` (migration 0005+0006) |
| Faz 2.5D tab'ı ([DEM-53](https://linear.app/demirkol/issue/DEM-53)) | Kart detay görünümü (web) — karta tıklayınca açılan modal (`?card=<id>`): açıklama/due-date/üyeler/etiketler/checklist/yorum + kart activity feed | **In Progress** — kod yazılıyor; `_components/card-detail/` (yeni) + `card-item.tsx`/`page.tsx`/`strings.ts` değişiklikleri + eski `edit-card-dialog` modale taşındı + (gerekirse) `activity.list` procedure'ü **uncommitted**; QA/verifier + onay bekliyor | `apps/web`, `packages/api`, `docs/architecture/08` (gerekirse `03`) |
| **Bu tab (kontrol odası)** | Süreç projeksiyonu + `docs/` + Linear senkronu | sürekli açık; bugün: `bosluk-tara` komutu README §2.5/§4'e + `.claude/commands/bosluk-tara.md`'ye eklendi (uncommitted); `panorama` + `linear-senkron` ×2 (DEM-50/51/52 → `Done`, DEM-53 → `In Progress` iş kayıt defteri & faz planı catch-up; DEM-48 epic → `In Progress` + açıklaması gerçek alt-iş kırılımına çekildi; DEM-52 başlığı board davetlerini kapsayacak şekilde güncellendi; Faz 3 (DEM-26 epic + DEM-41–45) `Backlog` → `Sonraki Faz`); **Faz 2.7 epic'i ([DEM-58](https://linear.app/demirkol/issue/DEM-58)) tasarlandı** — iki-ajan UI analizi (eski Pusula `D:\projects\pusula` UI'ı + mevcut `pusula_v2` web UI envanteri) + 3 ekran görüntüsü + Trello karşılaştırması → 4 karar (referans=karma / tema=yeni palet / rich text=Tiptap / sıra=2.7.0 önce) → Linear milestone + epic ([DEM-58](https://linear.app/demirkol/issue/DEM-58), `Todo`) + faz planı satırı + "Faz 2.7 alt işleri" iskeleti + `02-teknoloji-kararlari.md` Karar kaydı (Faz 2.7 + Tiptap + palet) + `CLAUDE.md` §2 #8 Tiptap notu + defter DOC satırı; ayrıca: DEM-59 deployment runbook docs commit edildi (`b0b8f61`), defter DEM-53/54/55 satırları `Done`'a çekildi, DEM-58 → `Todo` (Faz 3 `Sonraki Faz`'ta kaldı — sıra: 2.7 → 3); **Faz 2.7.0 önce-belge `Done`** — yeni `docs/architecture/13-ui-tasarim-dili.md` yazıldı (09 numarası dolu → 13), kullanıcı seçimi palet=Trello-vari mavi / yoğunluk=compact / font=Inter / Tiptap JSON storage, `02-teknoloji-kararlari.md` 2.7.0 Karar kaydı + `architecture/README.md` indeksi + `08-web-ve-mobil.md` pointer'ı eklendi; **`faz-bol 2.7` yapıldı** — DEM-58 → 5 alt issue (DEM-61 2.7.0 `Done`, DEM-62 2.7A · DEM-63 2.7B · DEM-64 2.7C · DEM-65 2.7D `Todo`, `blockedBy` zinciri), `02-mvp-faz-plani.md` "Faz 2.7 alt işleri" DEM numaralarıyla güncellendi; **3 commit push edildi** (`b0b8f61`/`ee9d7ec`/`a4e4ce2`). Sırada: 2.7A (kod-yazma tab'ında) | `docs/**` (aktif kod tab'larının dosyaları hariç), `docs/process/05-is-kayit-defteri.md` (koordineli), `.claude/commands/`, Linear |

> Bu tabloyu durum değiştikçe güncelle (`panorama` çıktısında tutarsızlık görülürse de). Faz/iş gerçekleri için
> kanonik kaynak yine [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md) ve [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md).

## 6. Kullanıcı bunu nasıl kullanır

- "Nerede kaldık / ne yapıyoruz / sırada ne var?" → `panorama` (veya doğrudan sor; bu tab özetler).
- "Şu çelişiyor mu / eksik mi / senkron kaymış mı?" → `doc-denetim` (geniş) ya da `linear-senkron` (dar/hızlı).
- "Şu fazı alt işlere böl / şu fazı başlat" → `faz-bol <N>` / `faz-baslat <N>`.
- "Şu belgeyi güncelle / şu kararı kaydet" → bu tab yapar (`docs/`-only).
- "Bu yeni istek mevcut planla çelişiyor mu?" → `celiski <istek>`.
- Bu tab unutursa: kullanıcı "kontrol odası dosyandan görevini hatırla" der; bu tab [`docs/kontrol-odasi/README.md`](README.md)'yi tekrar okur.

## 7. Bakım

- Bu dosya bilinçli değiştiğinde `updated` alanını, §4 komut tablosunu ve §5 tab haritasını güncel tut.
- Komut seti değişirse `.claude/commands/<ad>.md` slash dosyalarını da senkronla.
- Bu tab'ın kendi işleri de iş kayıt defterinde `DOC-...` satırı + Linear issue ile izlenir (dokümantasyon işinin parçası).
