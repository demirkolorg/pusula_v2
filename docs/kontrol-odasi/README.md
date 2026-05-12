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

## 2. Görev — dört başlık

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
| `linear-senkron` | `/linear-senkron` | Hızlı: Linear ↔ `05-is-kayit-defteri.md` + `02-mvp-faz-plani.md` hizalama (eksik satır, durum güncelleme) | — |
| `faz-bol` | `/faz-bol` | Faz N epic'ini alt issue'lara böl: öneri → onay → Linear (parent + milestone + `blockedBy`) → faz planına "Faz N alt işleri" | `<N>` |
| `faz-baslat` | `/faz-baslat` | Faz N'in "önce belge" adımı + alt issue'ları `Todo`'ya alma + defter satırları + faz planı `🚧` | `<N>` |
| `devir` | `/devir` | Bu tab'ın devir notu: değişen `docs/`, açık kararlar, bekleyen catch-up, aktif tab durumu | — |
| `celiski` | `/celiski` | Gelen istek mevcut `docs/` ile çelişiyor mu; çelişiyorsa "belgeyi mi güncelleyelim, koda mı sadık kalalım?" netleştir | `<istek>` |

### Komut detayları

**`panorama`** — Okur: [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md), [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md), bu dosyanın §5'i, `git log`/`git status`, Linear (Pusula projesi, tüm state'ler). Üretir: aktif faz + kabaca % tamamlanma; `Sonraki Faz`'da bekleyenler; aktif tab'lar ve gerçek durumları (git/Linear ile karşılaştırmalı, tutarsızlık varsa belirt); açık blocker/risk/bekleyen karar; önerilen sıradaki adımlar. Çıktı kısa ve taranabilir — kod dump'ı yok.

**`doc-denetim`** — Kontrol eder: 3-yönlü tutarlılık (Linear durumları ↔ iş kayıt defteri satırları ↔ faz planı statüleri; Linear'da olup defterde olmayan / defterde olup Linear'da olmayan); "önce belge" ihlali (kodda var, `docs/`'ta yok); karar kaydı eksiği ([`../architecture/02-teknoloji-kararlari.md`](../architecture/02-teknoloji-kararlari.md) "Karar kaydı"); Obsidian standardı (frontmatter / `aliases` / `tags` / `parent`-`related` / `updated` / MOC bağlantısı; yetim not); kök `CLAUDE.md` + `.claude/skills/kontrol/SKILL.md` ↔ `docs/` pointer güncelliği; eksen ihlali (tasarım/domain/süreç içeriği yanlış klasörde). Çıktı: bulgu listesi (severity kritik/orta/düşük + ne, nerede, fix önerisi). Onayla **`docs/`-only** düzeltme + Linear senkronu uygular; kod gerektiren bulguları flagler ve ilgili tab/issue'ya not düşer.

**`linear-senkron`** — `doc-denetim`'in dar/hızlı versiyonu: yalnızca Linear ↔ [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md) ↔ [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md) hizalaması. Eksik iş kayıt defteri satırlarını ekler, durumları/sahipleri günceller, faz statülerini düzeltir, durum lejantını Linear state setiyle hizalı tutar.

**`faz-bol <N>`** — Faz N epic'ini (Linear) okur, kapsamından alt iş önerileri çıkarır, kullanıcıdan onay/granülerlik kararı alır, Linear'da alt issue'ları oluşturur (parent = epic, milestone = `Faz N — ...`, `blockedBy` zinciri, assignee = proje sahibi), [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md)'ye "Faz N alt işleri" bölümü ekler. Henüz başlamayan faz için alt işler `Sonraki Faz` durumunda kalır (örnek: Faz 2 → DEM-25 → DEM-33–37).

**`faz-baslat <N>`** — Faz N geliştirmesi başlarken: ilgili `docs/architecture/*` + `docs/domain/*` dosyalarını faz kapsamına göre günceller ("önce belge"), Linear'da o fazın alt issue'larını `Sonraki Faz` → `Todo`'ya alır, [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md)'ye satırları ekler, faz planı statüsünü `🚧 Devam ediyor`'a çevirir. (Faz 2.0 / DEM-33 işinin genelleştirilmiş hali.)

**`devir`** — Bu tab'ın durum/devir notu: hangi `docs/` değişti (committed/uncommitted), açık kararlar, bekleyen catch-up, aktif tab haritası. Context daralırsa veya başka oturuma geçilirse kullanılır. Format: [`../process/03-faz-0-devir-notu.md`](../process/03-faz-0-devir-notu.md)'ye yakın; istenirse `~/.claude/projects/<proje>/wip-state.md`'ye de yazılır.

**`celiski <istek>`** — Gelen yeni istek/karar mevcut `docs/` (architecture / domain / process + kök `CLAUDE.md` + `.claude/skills/kontrol/SKILL.md`) ile çakışıyor mu kontrol eder. Çakışıyorsa işe başlamadan "belgeyi mi güncelleyelim, koda mı sadık kalalım?" diye netleştirir, alınan kararı kaydeder. (Kök `CLAUDE.md` §5 "Çelişki" kuralının aracı.)

## 5. Paralel tab haritası (anlık — 2026-05-12)

| Tab | İş | Durum / Linear | Dokunduğu yerler |
| --- | --- | --- | --- |
| Faz 1B tab'ı | Auth web UI & session (sign-up/in/out, korumalı kabuk, workspace list/create) | **Done** — [DEM-22](https://linear.app/demirkol/issue/DEM-22), commit `cefd148`, kullanıcı onayladı | `apps/web/**`, `packages/ui/**`, `packages/domain/schemas/auth.ts`, `docs/architecture/07,08` |
| Davet akışı tab'ı | Faz 1 / 3. alt iş — workspace davet akışı (backend + web UI) | **Done** — [DEM-23](https://linear.app/demirkol/issue/DEM-23); backend (db + domain + api, migration `0002`+`0003`) + web davet UI tamam, 46 test + RTL, QA+verifier PASS, commit `bca834a` + web turu, kullanıcı onayladı | `packages/db`, `packages/api`, `packages/domain`, `packages/ui`, `apps/web`, `docs/architecture/04,08,10`, `docs/domain/01,02,05` |
| Workspace yönetim UI ([DEM-39](https://linear.app/demirkol/issue/DEM-39)) | Faz 1 ek iş — rename/archive + üye listesi/rol/çıkar (UI) | `Todo` — `doc-denetim` F6 ile açıldı; backend hazır (DEM-20), UI yok | `apps/web`, `packages/ui`, `docs/architecture/08` |
| **Bu tab (kontrol odası)** | Süreç projeksiyonu + `docs/` + Linear senkronu | sürekli açık; bugün: bu doküman + komut seti ([DEM-38](https://linear.app/demirkol/issue/DEM-38)) + Faz 2 epic ([DEM-25](https://linear.app/demirkol/issue/DEM-25)) → 5 alt iş ([DEM-33](https://linear.app/demirkol/issue/DEM-33)–[DEM-37](https://linear.app/demirkol/issue/DEM-37), `Sonraki Faz`) + `doc-denetim` (iş kayıt defteri catch-up, lejant hizalama, DEM-22/23 Linear durumları, DEM-39 açıldı) | `docs/**` (07/08/10 hariç), `docs/process/05-is-kayit-defteri.md` (koordineli), Linear |

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
