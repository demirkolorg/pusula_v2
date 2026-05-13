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
updated: 2026-05-13
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

| Komut            | Slash             | Ne yapar                                                                                                                                                               | Argüman   |
| ---------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `panorama`       | `/panorama`       | Büyük resim / önünü görme: faz durumu, aktif tab'lar, sıradaki işler, açık riskler/kararlar, önerilen adımlar                                                          | —         |
| `doc-denetim`    | `/doc-denetim`    | `docs/` ↔ kod ↔ Linear tutarlılık + Obsidian standardı taraması → bulgu listesi → onayla `docs/`-only düzeltme                                                         | —         |
| `bosluk-tara`    | `/bosluk-tara`    | Ürün boşluğu / paralel-iş taraması: Trello/Linear çizgisinde eksik/beklenen özellikler + şimdi paralel yapılabilecek işler → analiz + öneri → onayla yeni issue + docs | —         |
| `linear-senkron` | `/linear-senkron` | Hızlı: Linear ↔ `05-is-kayit-defteri.md` + `02-mvp-faz-plani.md` hizalama (eksik satır, durum güncelleme)                                                              | —         |
| `faz-bol`        | `/faz-bol`        | Faz N epic'ini alt issue'lara böl: öneri → onay → Linear (parent + milestone + `blockedBy`) → faz planına "Faz N alt işleri"                                           | `<N>`     |
| `faz-baslat`     | `/faz-baslat`     | Faz N'in "önce belge" adımı + alt issue'ları `Todo`'ya alma + defter satırları + faz planı `🚧`                                                                        | `<N>`     |
| `devir`          | `/devir`          | Bu tab'ın devir notu: değişen `docs/`, açık kararlar, bekleyen catch-up, aktif tab durumu                                                                              | —         |
| `celiski`        | `/celiski`        | Gelen istek mevcut `docs/` ile çelişiyor mu; çelişiyorsa "belgeyi mi güncelleyelim, koda mı sadık kalalım?" netleştir                                                  | `<istek>` |

### Komut detayları

**`panorama`** — Okur: [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md), [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md), bu dosyanın §5'i, `git log`/`git status`, Linear (Pusula projesi, tüm state'ler). Üretir: aktif faz + kabaca % tamamlanma; `Sonraki Faz`'da bekleyenler; aktif tab'lar ve gerçek durumları (git/Linear ile karşılaştırmalı, tutarsızlık varsa belirt); açık blocker/risk/bekleyen karar; önerilen sıradaki adımlar. Çıktı kısa ve taranabilir — kod dump'ı yok.

**`doc-denetim`** — Kontrol eder: 3-yönlü tutarlılık (Linear durumları ↔ iş kayıt defteri satırları ↔ faz planı statüleri; Linear'da olup defterde olmayan / defterde olup Linear'da olmayan); "önce belge" ihlali (kodda var, `docs/`'ta yok); karar kaydı eksiği ([`../architecture/02-teknoloji-kararlari.md`](../architecture/02-teknoloji-kararlari.md) "Karar kaydı"); Obsidian standardı (frontmatter / `aliases` / `tags` / `parent`-`related` / `updated` / MOC bağlantısı; yetim not); kök `CLAUDE.md` + `.claude/skills/kontrol/SKILL.md` ↔ `docs/` pointer güncelliği; eksen ihlali (tasarım/domain/süreç içeriği yanlış klasörde). Çıktı: bulgu listesi (severity kritik/orta/düşük + ne, nerede, fix önerisi). Onayla **`docs/`-only** düzeltme + Linear senkronu uygular; kod gerektiren bulguları flagler ve ilgili tab/issue'ya not düşer.

**`bosluk-tara`** — Bağlam: faz planı + iş kayıt defteri + Linear + `docs/domain/*` + `docs/architecture/*` + git log; gerekirse implement edilmiş ekranlar/akışlar (bu tab kod yazmaz ama okuyabilir). Pusula'nın hedefi (Trello alternatifi: web/mobil, akıcı drag-drop, optimistic UI, bildirim) ile Trello/Linear/Notion/Asana tipik akışlarını karşılaştırır → (a) mevcutta olmayan ama beklenen özellik/UX akışı, (b) faz planında hiç yer almayan parça, (c) şimdi paralel yapılabilecek bağımsız iş. Çıktı: öneri listesi (öncelik + ne, neden [referans ürün], önerilen faz, paralel mi, kaba bağımlılık; planlı olanlar "kapsamda" diye işaretli — gürültü yok). Kullanıcıya `AskUserQuestion` ile sunulur → onaylananlar için Linear'da yeni issue(lar) (proje Pusula, uygun milestone, varsa epic altına, `blockedBy`, assignee proje sahibi, state `Todo`/`Sonraki Faz`) + `02-mvp-faz-plani.md` (ilgili faz alt işleri) + gerekirse `docs/domain/*`/`docs/architecture/*` notu; `05-is-kayit-defteri.md` satırı sonraki senkronda. Kod yazma — sadece öneri + issue + docs.

**`linear-senkron`** — `doc-denetim`'in dar/hızlı versiyonu: yalnızca Linear ↔ [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md) ↔ [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md) hizalaması. Eksik iş kayıt defteri satırlarını ekler, durumları/sahipleri günceller, faz statülerini düzeltir, durum lejantını Linear state setiyle hizalı tutar.

**`faz-bol <N>`** — Faz N epic'ini (Linear) okur, kapsamından alt iş önerileri çıkarır, kullanıcıdan onay/granülerlik kararı alır, Linear'da alt issue'ları oluşturur (parent = epic, milestone = `Faz N — ...`, `blockedBy` zinciri, assignee = proje sahibi), [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md)'ye "Faz N alt işleri" bölümü ekler. Henüz başlamayan faz için alt işler `Sonraki Faz` durumunda kalır (örnek: Faz 2 → DEM-25 → DEM-33–37).

**`faz-baslat <N>`** — Faz N geliştirmesi başlarken: ilgili `docs/architecture/*` + `docs/domain/*` dosyalarını faz kapsamına göre günceller ("önce belge"), Linear'da o fazın alt issue'larını `Sonraki Faz` → `Todo`'ya alır, [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md)'ye satırları ekler, faz planı statüsünü `🚧 Devam ediyor`'a çevirir. (Faz 2.0 / DEM-33 işinin genelleştirilmiş hali.)

**`devir`** — Bu tab'ın durum/devir notu: hangi `docs/` değişti (committed/uncommitted), açık kararlar, bekleyen catch-up, aktif tab haritası. Context daralırsa veya başka oturuma geçilirse kullanılır. Format: [`../process/03-faz-0-devir-notu.md`](../process/03-faz-0-devir-notu.md)'ye yakın; istenirse `~/.claude/projects/<proje>/wip-state.md`'ye de yazılır.

**`celiski <istek>`** — Gelen yeni istek/karar mevcut `docs/` (architecture / domain / process + kök `CLAUDE.md` + `.claude/skills/kontrol/SKILL.md`) ile çakışıyor mu kontrol eder. Çakışıyorsa işe başlamadan "belgeyi mi güncelleyelim, koda mı sadık kalalım?" diye netleştirir, alınan kararı kaydeder. (Kök `CLAUDE.md` §5 "Çelişki" kuralının aracı.)

## 5. Paralel tab haritası (anlık — 2026-05-13)

| Tab | İş | Durum / Linear | Dokunduğu yerler |
| --- | --- | --- | --- |
| Faz 1 tab'ları | Auth web UI & session, workspace davet/yönetim UI + `workspace.delete`, yeni kullanıcı onboarding + pano şablonu, profil/hesap ekranı, şifre sıfırlama akışı | **Done** — DEM-22/23/24/39/40/46/47/55/68 hepsi `Done`; **Faz 1 (ana + ek işler) tamamlandı** | `apps/web/**`, `packages/ui/**`, `packages/domain`, `apps/api` (bootstrap, Better Auth `sendResetPassword` → Resend), `docs/architecture/02,07,08,10`, `docs/domain/01,02,05` |
| Faz 2 tab'ları | Board/List/Card CRUD (backend) + temel board ekranı (web, drag-drop'suz) | **Done** — DEM-33 (önce-belge) + DEM-34/35/36 (backend) + DEM-37 (web) hepsi `Done`; **Faz 2 (DEM-25 epic) tamamlandı** | `packages/api`, `packages/domain`, `packages/db` (migration 0004), `apps/web`, `packages/ui`, `docs/architecture/03,04,05,08`, `docs/domain/01,02` |
| Faz 2.5 tab'ları (A/B/C/D) | Faz 2.5.0 docs ([DEM-49](https://linear.app/demirkol/issue/DEM-49)) + comment/checklist ([DEM-50](https://linear.app/demirkol/issue/DEM-50)) + card members/label ([DEM-51](https://linear.app/demirkol/issue/DEM-51)) + board üye/davet ([DEM-52](https://linear.app/demirkol/issue/DEM-52)) backend + kart detay görünümü web modalı ([DEM-53](https://linear.app/demirkol/issue/DEM-53)) + board activity feed UI ([DEM-54](https://linear.app/demirkol/issue/DEM-54)) | **Done** — DEM-49–54 hepsi `Done`; **Faz 2.5 (DEM-48 epic) tamamlandı** | `docs/architecture/02,03,04,05,08`, `docs/domain/01,02,05`, `packages/api`, `packages/domain`, `packages/db` (migration 0005+0006), `apps/web`, `packages/ui` |
| Faz 2.7 tab'ları (2.7A/B/C/D + 66/67) | Tema+token+`packages/ui` ([DEM-62](https://linear.app/demirkol/issue/DEM-62)) ∥ board ekranı + `board.get` additive ([DEM-63](https://linear.app/demirkol/issue/DEM-63)) ∥ kart detay modalı + Tiptap ([DEM-64](https://linear.app/demirkol/issue/DEM-64)) → workspace/app-shell + a11y ([DEM-65](https://linear.app/demirkol/issue/DEM-65)); kart tamamlama/kapak rengi backend ([DEM-66](https://linear.app/demirkol/issue/DEM-66)/[DEM-67](https://linear.app/demirkol/issue/DEM-67)) | **Done** — DEM-62 (`0e28564`) + DEM-63 (`389ee00`) + DEM-64 (`96c4bd6`) + DEM-65 + DEM-66/67 (`d6dc102`) hepsi `Done`; DEM-58 epic teslimleri tamam (`Done`) — kapanış-sonrası polish DEM-74 (`e9849d2`) da `Done` (aşağıdaki tab) | `packages/ui/**` (theme.css + token + Avatar/SectionHeader/Progress/EmptyState/MetaChip/LabelChip/CardCompleteToggle + shadcn Tooltip/DropdownMenu/Checkbox/Tabs + RichTextEditor/Tiptap), `apps/web` (board ekranı + kart detay modalı + app-shell), `packages/api`/`packages/domain`/`packages/db` (migration 0007 — `cards.completed*`/`coverColor` + `card.complete`/`uncomplete` + `card.update({coverColor})` + `board.get`/`card.get` projection), `docs/architecture/02,03,08,13` |
| Faz 2.7C-2 tab'ı ([DEM-74](https://linear.app/demirkol/issue/DEM-74)) | Kart detay modalını `13-ui-tasarim-dili.md` §13.3'e çekme (modal genişlik/iki-kolon, kapak-renkli başlık çubuğu, "İşlemler"→"Aktivite" sekmesi, section-header taşması, sol kolon yatay overflow) + DEM-66/67 backend'ini UI'ye wire (`CardCompleteToggle` → `card.complete`/`uncomplete`; kapak rengi picker → `card.update({coverColor})`) — fonksiyon değişmez, salt görsel/yapısal | **Done** — 2026-05-13; @frontend-dev implement → code-reviewer APPROVE WITH NITS (nit-fix) + verifier PASS (440 test, build yeşil) → kullanıcı onayladı (tarayıcı doğrulaması dahil) → commit `feat: DEM-74 …` (`e9849d2`) + push (main); Linear DEM-74 → `Done` + kapanış yorumu; **DEM-58 (Faz 2.7) epic tamamen kapalı — modal tamamen §13.3'te** | `apps/web` (`.../boards/[boardId]/_components/card-detail/*` + `card-detail-cover-color.tsx` + `card-item.tsx`/`strings.ts`), `packages/ui` (`rich-text-editor.tsx` `<pre>` overflow + `card-complete-toggle.tsx` `aria-disabled`); docs: `02-mvp-faz-plani.md` + `05-is-kayit-defteri.md` + `08-web-ve-mobil.md` §8.1.5 + `13-ui-tasarim-dili.md` §13.2 l.165 (wired notu) |
| Faz 3 tab'ları (3A/3B/3C/3D/3E) | `list.move`/`card.move` backend ([DEM-42](https://linear.app/demirkol/issue/DEM-42)) → drag-drop UI web ([DEM-43](https://linear.app/demirkol/issue/DEM-43)) ∥ position compaction worker ([DEM-44](https://linear.app/demirkol/issue/DEM-44)) → Playwright drag-drop testleri ([DEM-45](https://linear.app/demirkol/issue/DEM-45)); `card.moveToList` (cross-board) + `card.copy` ([DEM-69](https://linear.app/demirkol/issue/DEM-69) — Faz 3E, 3A sonrası) | **`Done` (2026-05-13)** — Faz 3 tüm alt işleriyle (3.0/3A/3B/3C/3D/3E) kapandı (epic DEM-26 `Done`; ayrıntı [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md)). Tarihçe: **Geliştirme 2026-05-13 başladı (`faz-baslat 3`)** — epic [DEM-26](https://linear.app/demirkol/issue/DEM-26) `In Progress` (Linear `Sonraki Faz` → `In Progress` senkron düzeltmesi); 3.0 önce-belge ([DEM-41](https://linear.app/demirkol/issue/DEM-41) / `DOC-2026-05-13-001`) `Review` (**bu kontrol odası tab'ında** — `05-board-mekanigi §5.1` + `03-siralama-kurallari` + `08-web §8.1.8` "Board ekranı drag-drop" + `@pusula/domain` move-input şekilleri tamam; önce-belge bitti, kullanıcı onayı bekliyor → onayda `Done`); DEM-74 (Faz 2.7C-2) `Done` (`e9849d2`) — bloklayıcı değil; 3A ([DEM-42](https://linear.app/demirkol/issue/DEM-42)) `Todo` (**başlatmaya hazır** — kod tab'ı); 3B ([DEM-43](https://linear.app/demirkol/issue/DEM-43)) `Todo` — yalnız 3A'ya bağımlı; 3C ([DEM-44](https://linear.app/demirkol/issue/DEM-44)) `Todo` — 3A bekler; 3D ([DEM-45](https://linear.app/demirkol/issue/DEM-45)) `Todo` — 3B bekler; 3E ([DEM-69](https://linear.app/demirkol/issue/DEM-69)) `Todo` — 3A bekler | `packages/api`, `packages/domain`, `packages/db` (3A — gerekirse migration), `apps/worker` (3C), `apps/web` (3B/3D — board kolon bileşenleri/`card-item.tsx`/drag handler'ları/Playwright), `docs/architecture/03,05,06,08` (kod tab'larının kendi turlarında), `docs/domain/01,02,03` |
| **Bu tab (kontrol odası)** | Süreç projeksiyonu + `docs/` + Linear senkronu | sürekli açık; **son turlar (2026-05-13):** `bosluk-tara` 2. tur → 8 yeni issue (DEM-66–73); `linear-senkron` — DEM-74 (2.7C-2) `In Progress` → `Done`; `faz-baslat 3` + Faz 3 kapanışı (3.0/3A/3B/3C/3D/3E hepsi `Done`). **`faz-bol 4` (2026-05-13):** Faz 4 epic (DEM-27) 5 alt işe bölündü — DEM-77 (4.0 önce-belge) / DEM-78 (4A backend `clientMutationId`) / DEM-79 (4B web cache modeli) / DEM-80 (4C optimistic mutation'lar) / DEM-81 (4D Vitest failure testleri) hepsi `Sonraki Faz`; parent=DEM-27, milestone=`Faz 4 — Optimistic UI`, `blockedBy` zinciri (4.0 → 4A ∥ 4B → 4C → 4D); faz planı (Faz 4 satırı `⏳ Alt işler hazır` + footer + yeni "Faz 4 alt işleri" 1–5) güncellendi. **`faz-baslat 4` (2026-05-13):** Faz 4 geliştirmesi başlatıldı — `05-board-mekanigi §5.2` Faz 4 için **kapsamlı yeniden yazıldı** (board cache şekli `board → list[] → card[]` + query key konvansiyonu + cache update primitives `apps/web/src/lib/board-cache/` + mutation lifecycle [`onMutate` snapshot + apply, `onError` rollback, `onSettled` invalidate] + `clientMutationId` UUID v4 semantiği [idempotency + Faz 5 echo ayıklama altyapısı] + `CONFLICT` refetch + scope) + `08-web §8.1.9` "Optimistic UI (Faz 4)" **eklendi** (`apps/web/src/lib/board-cache/` modül konvansiyonu `keys.ts`/`types.ts`/`primitives.ts`/`mutations.ts` + `useOptimisticBoardMutation` higher-order hook + ekran-bazlı optimistic kapsam [§8.1.4 board / §8.1.5 modal / §8.1.8 drag-drop / workspace board listesi] + UX davranışı [Sonner toast, otomatik retry yok] + i18n strings `strings.board.optimistic.*` / `strings.board.conflict.*`) + `02-teknoloji-kararlari` Karar kaydı 2026-05-13 satırı (`clientMutationId` UUID v4 + scope = board/list/card collaborative + Faz 4'te yalnız idempotency log iskeleti, short-window dedupe Faz 5'e + cache modeli ortak modülde) + faz planı (Faz 4 satırı `🚧 Devam ediyor` + footer + "Faz 4 alt işleri" giriş paragrafı — DEM-77 → `In Progress`, epic DEM-27 → `In Progress`) + iş kayıt defteri (DEM-77 `DOC-2026-05-13-002` `In Progress` + DEM-78 `API-2026-05-13-005` / DEM-79 `FE-2026-05-13-004` / DEM-80 `FE-2026-05-13-005` / DEM-81 `TEST-2026-05-13-001` `Todo` + faz durumu özeti) + bu README §5 (Faz 3 satırı `Done` prefix + yeni Faz 4 tab'ları satırı) güncellendi; Linear DEM-27 → `In Progress`, DEM-77 → `In Progress`, DEM-78/79/80/81 → `Todo`. **Kullanıcı onayladı 2026-05-13** — DEM-77 → `Done` + Linear kapanış yorumu; faz planı + iş kayıt defteri + bu README §5 senkronlandı (DEM-77 `In Progress` → `Done`). **Sırada:** 4A (DEM-78 backend `clientMutationId`) + 4B (DEM-79 web cache modeli) **paralel** kod tab'larında başlatılacak (prompt'lar verildi). Kod yazılmadı | `docs/**` (aktif kod tab'larının dosyaları hariç), `docs/process/05-is-kayit-defteri.md` (koordineli), `.claude/commands/`, Linear |
| Faz 4 tab'ları (4A/4B/4C/4D) | `clientMutationId` input alanı + idempotency log iskeleti (`@pusula/domain` + `packages/api`) ([DEM-78](https://linear.app/demirkol/issue/DEM-78)) ∥ web TanStack Query cache modeli + query key konvansiyonu (`apps/web/src/lib/board-cache/`) ([DEM-79](https://linear.app/demirkol/issue/DEM-79)) → optimistic mutation'lar + rollback + `clientMutationId` üretimi (`useOptimisticBoardMutation`) ([DEM-80](https://linear.app/demirkol/issue/DEM-80)) → Vitest mutation failure testleri (network + `CONFLICT` + race + rollback) ([DEM-81](https://linear.app/demirkol/issue/DEM-81)) | **Geliştirme 2026-05-13 başladı (`faz-baslat 4`)** — epic [DEM-27](https://linear.app/demirkol/issue/DEM-27) `In Progress`; 4.0 önce-belge ([DEM-77](https://linear.app/demirkol/issue/DEM-77) / `DOC-2026-05-13-002`) `Done` (kullanıcı onayladı 2026-05-13 — `05-board-mekanigi §5.2` Faz 4 için yeniden yazıldı + `08-web §8.1.9` "Optimistic UI" eklendi + `02-teknoloji-kararlari` Karar kaydı 2026-05-13 `clientMutationId` UUID v4 + scope tamam; Linear kapanış yorumu); 4A ([DEM-78](https://linear.app/demirkol/issue/DEM-78)) `Todo` — **başlatmaya hazır** (kod tab'ı `packages/domain` + `packages/api`); 4B ([DEM-79](https://linear.app/demirkol/issue/DEM-79)) `Todo` — **başlatmaya hazır** (kod tab'ı `apps/web`); 4A ∥ 4B paralel; 4C ([DEM-80](https://linear.app/demirkol/issue/DEM-80)) `Todo` — 4A + 4B bekler; 4D ([DEM-81](https://linear.app/demirkol/issue/DEM-81)) `Todo` — 4C bekler. Sıra: 4.0 → 4A ∥ 4B → 4C → 4D. Scope: board/list/card collaborative (comment/checklist/label/member Faz 5/6'ya) | `packages/api`, `packages/domain` (4A — şema + prosedür `clientMutationId` parse), `apps/web` (4B — yeni `src/lib/board-cache/` modülü `keys.ts`/`types.ts`/`primitives.ts`/`mutations.ts`; 4C — `useOptimisticBoardMutation` üzerinden mutation'lar + drag-drop ortak hook'a göç; 4D — Vitest failure testleri), `docs/architecture/05,08,02` (kod tab'larının kendi turlarında wired notu — 4.0'da temel yazıldı) |

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
