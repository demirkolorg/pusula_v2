---
title: '15 — Bildirim Ayar Ekranı'
description: 'Account sayfasında bildirim tercihleri UI mimarisi (Faz 10).'
aliases:
  - 'Bildirim Ayar Ekranı'
  - 'Notification Settings UI'
tags:
  - 'pusula'
  - 'architecture/ui'
  - 'architecture/notifications'
type: 'architecture'
axis: 'architecture'
status: 'active'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
related:
  - '[[docs/architecture/06-bildirim-altyapisi|06 — Bildirim Altyapısı]]'
  - '[[docs/domain/04-bildirim-kurallari|04 — Bildirim Kuralları]]'
  - '[[docs/architecture/13-ui-tasarim-dili|13 — UI Tasarım Dili]]'
  - '[[docs/architecture/08-web-ve-mobil|08 — Web ve Mobil]]'
updated: 2026-06-01
---

# 15 — Bildirim Ayar Ekranı (Faz 10)

> Eksen: **tasarım / teknik** — `/account` sayfasında bildirim tercih UI'sının _mekanizması_ (Tabs, section anatomisi, primitive ihtiyaçları, deep-link). Hangi olay hangi bildirimi üretir / mute-bypass tablosu = **iş kuralı** → [`../domain/04-bildirim-kurallari.md`](../domain/04-bildirim-kurallari.md). Outbox / worker / fan-out altyapısı → [`06-bildirim-altyapisi.md`](06-bildirim-altyapisi.md). Tasarım dili token'ları (radius/shadow/spacing) → [`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md).

## 15.1 İlke

`/account` sayfası mevcut tek scrollable Card stack'i (Profil + Güvenlik + Hesap Silme) **Tabs ile genişler**. Alt-route (`/account/notifications`) **eklenmez** — Card stack convention'ı bozulur ve `UserNavMenu` tek "Hesap ayarları" girişi korunmak istenir.

```
/account
├─ Tab: Profil       → mevcut ProfileForm
├─ Tab: Güvenlik     → ChangePassword + DeleteAccount (+ Faz 10I: bilinen cihazlar)
└─ Tab: Bildirimler  → 4 section + gelişmiş özellikler (Faz 10F/G/H)
```

**Deep-link:** `/account?tab=notifications` query param. Tab değişince `router.replace('?tab=...', { scroll: false })`. Mevcut sayfada `searchParams.tab` defaultValue belirler. Daha derin link (scope override modal'ı veya cihaz listesi) için hash kullanılabilir: `?tab=notifications#scope-{workspaceId}`.

> **Wired (2026-05-15 — Faz 10C / [DEM-137](https://linear.app/demirkol/issue/DEM-137); 10D / [DEM-138](https://linear.app/demirkol/issue/DEM-138) + 10E / [DEM-139](https://linear.app/demirkol/issue/DEM-139) ile dolduruldu):** `AccountTabs` client component'i [`apps/web/src/app/(app)/account/_components/account-tabs.tsx`](../../apps/web/src/app/(app)/account/_components/account-tabs.tsx) içinde devrede; `?tab=` deep-link + `router.replace` (`{ scroll: false }`) bağlı, geçersiz query değeri varsayılan `profile` sekmesine düşer. Bildirimler sekmesi **4 section devrede** (kanallar + matris + scope ağacı + cihazlar) — [`apps/web/src/app/(app)/account/page.tsx`](../../apps/web/src/app/(app)/account/page.tsx). i18n `strings.account.tabs.*` + `strings.account.notifications.*` (devices namespace 10E ile tamamlandı, geçici `placeholder*` anahtarları silindi).

## 15.2 shadcn primitive ihtiyaçları

`packages/ui` mevcut export: `Alert / Avatar / Badge / Button / Card / Checkbox / Dialog / DropdownMenu / Input / Label / Popover / Select / Separator / Tabs / Textarea / Tooltip / Progress`. Faz 10 için **eklenecek**:

| Primitive | Kullanım | Radix paketi | Dosya |
|-----------|----------|--------------|-------|
| `Switch` | Email/Push toggle, kanal başına on/off, tip×kanal matrisi | `@radix-ui/react-switch` | `packages/ui/src/components/switch.tsx` |
| `RadioGroup` + `RadioGroupItem` | Mute level seçimi (3 option), email digest sıklık (4 option) | `@radix-ui/react-radio-group` | `packages/ui/src/components/radio-group.tsx` |

`@pusula/ui` index'inden export edilir. shadcn registry pattern'i: forwardRef + class-variance-authority varyantları + `data-state` attribute, theme.css token'larıyla uyum.

> **Wired (2026-05-15 — Faz 10C / [DEM-137](https://linear.app/demirkol/issue/DEM-137)):** Her iki primitive [`packages/ui/src/components/switch.tsx`](../../packages/ui/src/components/switch.tsx) ve [`packages/ui/src/components/radio-group.tsx`](../../packages/ui/src/components/radio-group.tsx) içinde devrede; `@pusula/ui` index'inden `Switch`, `RadioGroup`, `RadioGroupItem` export edildi. `@radix-ui/react-switch` + `@radix-ui/react-radio-group` deps `packages/ui/package.json`'a eklendi. Theme token uyumu (`--primary`, `--input`, `--ring`, `--background`, `--destructive`) + dark/light mode pass. Vitest + RTL testleri [`apps/web/src/components/ui/switch.test.tsx`](../../apps/web/src/components/ui/switch.test.tsx) ve [`apps/web/src/components/ui/radio-group.test.tsx`](../../apps/web/src/components/ui/radio-group.test.tsx).

**Eklenmesi düşünülüp ertelenenler:**
- `Accordion` — Section 3 scope override ağacında her workspace/board collapse olabilirdi; ancak hiyerarşik liste shadcn `Collapsible` veya basit tree render ile çözülür → Faz 10D'de değerlendirilir.
- `TimePicker` (zaman seçici) — Faz 10F quiet hours için. shadcn'in resmi TimePicker'ı yok; native `<input type="time">` + label yeterli → ayrı primitive **eklenmez**.

## 15.3 "Bildirimler" sekmesi anatomisi

Aşağıdaki 4 ana section sırayla render edilir. Faz 10D üç section'ı (1+2+3) inşa eder, 10E dördüncüyü (cihazlar) ekler. Faz 10F/G/H gelişmiş özellikler section'ları olarak iliştirilir.

### Section 1 — Genel kanallar

```
┌────────────────────────────────────────────────┐
│ Genel kanallar                                 │
│ (workspace/board/kart bazlı override yapmadığın│
│  her bildirim için varsayılan)                 │
├────────────────────────────────────────────────┤
│ 📱 Uygulama içi bildirim   [her zaman açık ✓]  │
│ ✉️  E-posta                  [Switch ON/OFF]   │
│ 🔔 Push (mobil)             [Switch ON/OFF]    │
│                                                │
│ Susturma seviyesi:                             │
│ ◯ Tüm bildirimleri al                          │
│ ◯ Sadece sözedildiğimde                        │
│ ◯ Tamamen sustur (mention/davet hâlâ geçer)    │
└────────────────────────────────────────────────┘
```

**Veri:** `notifications.preferences.get({})` — global default satır (`workspace_id = NULL, board_id = NULL, card_id = NULL`). Yok ise rule engine default'u (`muteLevel='none'`, `mentionOnly=false`, `pushEnabled=true`, `emailEnabled=true`) gösterilir.

**Mutation:** `notifications.preferences.upsert({})` — optimistic TanStack Query pattern (`onMutate` snapshot + apply, `onError` rollback, `onSettled` invalidate `notifications.preferences.*` query'leri).

**UI primitives:** 2× `Switch`, 1× `RadioGroup` (3 option), 1× `Label`, info `Tooltip` ("Bu sustur seviyesinde mention ve doğrudan davet her zaman geçer").

> **Wired (2026-05-15 — Faz 10D / [DEM-138](https://linear.app/demirkol/issue/DEM-138)):** Section 1 [`apps/web/src/app/(app)/account/_components/notifications-channels-form.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-channels-form.tsx) içinde devrede; `notifications.preferences.get({})` ile global default satırı okur, `upsert` mutation'u optimistic `setQueryData` + rollback + `invalidate` (hem `get` hem `list`) lifecycle'ı taşır. `clientMutationId` her mutation'da `crypto.randomUUID()` ile enjekte edilir. In-app Switch disabled + tooltip ("her zaman açık"); push/email Switch'leri `pushEnabled`/`emailEnabled` flag'lerine bağlı; mute-level RadioGroup 3 option (`none`/`mentions_only`/`all`). i18n `strings.account.notifications.{channels,mute}.*`. Vitest + RTL testleri [`notifications-channels-form.test.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-channels-form.test.tsx) (5 test).

### Section 2 — Bildirim tipi × Kanal matrisi

```
┌──────────────────────────────────────────────────────────┐
│ Bildirim tipleri                                         │
│ [Hepsini aç] [Hepsini kapat] [Sadece e-postayı kapat]   │
├──────────────────────────────────────────────────────────┤
│ Atama & sözedilme                                        │
│   Bana atanma          ✓ in-app   [Switch]   [Switch]   │
│   Sözedilme (@)        ✓ in-app   [Switch]   [Switch]   │
│                                                          │
│ Yorum                                                    │
│   Takipteki kartta yorum [Switch]    —      [Switch]    │
│                                                          │
│ Bitiş tarihi                                             │
│   Yaklaşan bitiş        [Switch]    —       [Switch]    │
│   Geciken kart          [Switch]  [Switch]  [Switch]    │
│                                                          │
│ Kart yaşam döngüsü                                       │
│   Takipteki kart hareketi [Switch]   —        —         │
│   Checklist maddesi       [Switch]   —        —         │
│   tamamlandı                                             │
│                                                          │
│ Davet                                                    │
│   Pano daveti          ✓ in-app  ✓ e-posta     —        │
│   Çalışma alanı daveti ✓ in-app  ✓ e-posta     —        │
└──────────────────────────────────────────────────────────┘
```

**Davranış:**
- `✓ sabit` → mute-bypass tipleri (mention + board_invitation + workspace_invitation) için `Switch` disabled + info `Tooltip` ("Bu bildirim her zaman gönderilir — mute-bypass").
- `—` → o tip × kanal kombinasyonu rule engine'de yok (örn. `comment_reply` için email kanal gönderilmiyor — bkz. `notification-rules.ts:381-405`). UI sütununda boş hücre.
- **2026-06-01 push expansion sonrası:** Push sütununda `—` (em-dash) yalnız teorik fallback — `pickChannels` artık tüm tipler için `pushEnabled` gate'ine bağlar (`pushByType = true`), yani matristeki her push hücresi `'on'` olur (toggle açık, kullanıcı global `push_enabled=false` ile veya scope override ile opt-out edebilir). Push'ta mute-bypass yok: mention/davet push'u da `push_enabled` ile kapatılabilir. Detay → [`../domain/04-bildirim-kurallari.md`](../domain/04-bildirim-kurallari.md) "Push kanalı kapsamı".
- Genel Email/Push (Section 1) OFF iken matrix'teki ilgili sütunlar disabled + tooltip "Önce genel {kanal}'ı aç".
- Toplu işlem butonları üstte: "Hepsini aç" / "Hepsini kapat" / "Sadece e-postayı kapat". Tek tıkla tüm Switch'leri set eder + tek bir `upsert` mutation gönderir.

**Veri sorusu (Faz 10D karar noktası):** Mevcut `notification_preferences` şeması **kanal başına global** (`push_enabled`, `email_enabled`) flag'ler tutar; tip-bazlı kanal kombinasyonu (örn. "atama maili evet ama yorum maili hayır") kaydetmez. İki seçenek:

- **Seçenek A — Faz 10D'de UI gösterir, backend kaydetmez** (önerilen): Matrix UI'sı bilgilendirme amaçlı çalışır; her satır Switch'i global `email_enabled` veya `push_enabled` flag'ine bağlanır. Tip-bazlı toggle Faz 11'e ertelenir (`notification_preferences` üstüne `type_channels jsonb` kolonu + rule engine güncellemesi).
- **Seçenek B — Faz 10D'de DB şemasını genişlet**: `notification_preferences.type_channels jsonb DEFAULT '{}'` (örn. `{ "card_assigned": ["in_app","email","push"], "comment_reply": ["in_app"] }`) + rule engine `pickChannels`'da bu kolonu okumaya öncelik ver.

10.0 önce-belge karar: **Seçenek A** — Faz 10D scope'unu küçük tutar, kullanıcı net görünür değişiklik (Section 1 + Section 3) alır, tip-bazlı granülerlik gerçek talep gelirse Faz 11'de eklenir. Matrix Switch'leri info tooltip ile durumu açıklar.

> **Wired (2026-05-15 — Faz 10D / [DEM-138](https://linear.app/demirkol/issue/DEM-138)):** Section 2 [`apps/web/src/app/(app)/account/_components/notifications-type-matrix.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-type-matrix.tsx) içinde devrede; 11 bildirim tipi 5 grupta (Atama & sözedilme, Yorum, Bitiş tarihi, Kart yaşam döngüsü, Üyelik, Davet) render edilir. Tip × kanal değer matrisi [`notifications-shared.ts`](../../apps/web/src/app/(app)/account/_components/notifications-shared.ts) `MATRIX_ROWS` sabitinde tutulur ve `notification-rules.ts:pickChannels` mantığını birebir yansıtır — [`notifications-shared.test.ts`](../../apps/web/src/app/(app)/account/_components/notifications-shared.test.ts) testleri iki tarafın senkron kalmasını garanti eder. Mute-bypass tipler (mention, board_invitation, workspace_invitation) `mute_bypass` sabitinde ✓ disabled gösterilir + tooltip; `unavailable` hücreleri em-dash + tooltip ("Bu kanal bu bildirim tipi için mevcut değil"). Genel kanal (Section 1) kapalı iken ilgili sütundaki Switch'ler `disabled` + tooltip ("Önce genel ...'ı aç") — kapsam kararı (Seçenek A) gereği global flag'e bağlı tip-toggle'ı her satırda info tooltip ("Şu an global kanal toggle'ı geçerli; tip-bazlı ayar yakında") ile bildirir. Toplu işlem butonları (Hepsini aç / Hepsini kapat / Sadece e-postayı kapat) tek `upsert` mutation gönderir. i18n `strings.account.notifications.matrix.*`. Vitest + RTL testleri [`notifications-type-matrix.test.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-type-matrix.test.tsx) (6 test) + matrix sabit testi [`notifications-shared.test.ts`](../../apps/web/src/app/(app)/account/_components/notifications-shared.test.ts) (5 test).

### Section 3 — Workspace / Board / Card scope override ağacı

```
┌────────────────────────────────────────────────┐
│ Özelleştirilmiş kapsamlar                      │
│ ℹ️ Daha dar kapsam daha geniş olanı ezer       │
├────────────────────────────────────────────────┤
│ 🏢 Acme Workspace          🔇 Sustur          │
│                           [Kaldır]             │
│   ↳ 📋 "Q2 Roadmap" panosu  📣 Sadece mention │
│                           [Kaldır]             │
│      ↳ 🎴 "API tasarımı"   🔕 Tamamen sustur │
│                           [Kaldır]             │
│                                                │
│ [+ Yeni kapsam ekle]                           │
└────────────────────────────────────────────────┘
```

**Veri:** `notifications.preferences.list()` — kullanıcının tüm scope satırlarını döner; backend `scopeLabel` (workspace adı / board adı / kart başlığı) JOIN ile ekler. Sıralama: workspace → board → card (`COALESCE(workspace_id, ''), COALESCE(board_id, ''), COALESCE(card_id, '')` ile artan).

**Render:** Hiyerarşik tree (parent → children) — workspace satırı altında o workspace'in board override'ları, her board altında o board'un card override'ları nested görünür. Global default satır (üçü null) Section 1'de zaten render edildiği için **burada gösterilmez**.

**Inline edit:** Her satırda `Select` (mute-level — 3 option) + `[Kaldır]` butonu. `Select` değişimi → `upsert` mutation, `[Kaldır]` → `delete` mutation (override silinir, üst seviyeye düşer).

**"+ Yeni kapsam ekle" modal:**
```
1. Workspace seçici (Combobox: kullanıcının erişebildiği workspaces)
2. (opsiyonel) Board seçici (workspace seçilince enable; o workspace'in board'ları)
3. (opsiyonel) Kart seçici (board seçilince enable; o board'un kartları)
4. Tercih formu (mute-level RadioGroup + push/email Switch'ler)
5. [Kaydet] → upsert
```

Kart seçici çok büyük olabilir (binlerce kart) → arayüz `Command` / typeahead + son 10 kart shortcut listesi.

> **Wired (2026-05-15 — Faz 10D / [DEM-138](https://linear.app/demirkol/issue/DEM-138)):** Section 3 ağaç [`apps/web/src/app/(app)/account/_components/notifications-scope-tree.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-scope-tree.tsx) ve "Yeni kapsam ekle" diyalogu [`notifications-scope-add-dialog.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-scope-add-dialog.tsx) içinde devrede. `notifications.preferences.list()` tüm scope satırlarını döner; client global default satırı (üçü null) ağaçtan eler (Section 1 yönetir). Her satırda Badge (Çalışma alanı / Pano / Kart) + scope etiketi + inline mute-level Select (3 option) + email/push Switch + "Kaldır" Button (`delete` mutation, optimistic remove + rollback). Inline `upsert` mutation `setQueryData` ile satırı patch'ler, `onError` snapshot rollback, `onSettled` `list` + `get` invalidate. **Kapsam dışı (Faz 10D karar):** Add dialog SADECE workspace + board scope override ekler — kart override Faz 10H (snooze) ile kart detay menüsünden eklenir; kart satırları ağaçta listelenmeye + "Kaldır" ile silinmeye devam eder, tasarım dosyası §15.3 Section 3 hâlâ kart seçici adımını planlar fakat 10D scope'u küçültmek için ertelendi (info: `strings.account.notifications.scopes.cardOverrideNote`). Toast disiplini §15.5 ile uyumlu — başarıda toast yok, sadece hatada `errors.{saveFailed, deleteFailed}`. Vitest + RTL testleri [`notifications-scope-tree.test.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-scope-tree.test.tsx) (5 test) + [`notifications-scope-add-dialog.test.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-scope-add-dialog.test.tsx) (5 test).

### Section 4 — Push token cihaz listesi (Faz 10E)

```
┌────────────────────────────────────────────────┐
│ Push bildirim cihazları                        │
├────────────────────────────────────────────────┤
│ 📱 iPhone 15 Pro · iOS · 2 gün önce  [Çıkar]   │
│ 📱 Samsung S23 · Android · 1 hafta   [Çıkar]   │
│                                                │
│ Empty state:                                   │
│ 📭 Henüz kayıtlı cihaz yok.                    │
│    Mobil uygulamada giriş yaptığında otomatik  │
│    eklenir.                                    │
└────────────────────────────────────────────────┘
```

**Veri:** `push.tokens.list()` — `revoked_at IS NULL` satırlar, `lastUsedAt` DESC sırada.

**Mutation:** `push.tokens.revokeById({ id })` — optimistic remove + rollback. Mobil client (Faz 7) hâlâ `push.tokens.revoke({ token })` kullanır (logout akışında elinde token vardır); bildirim ayar ekranı (web) ise privacy gereği `tokens.list` token string'i döndürmediğinden satır id'sini ezbere bilir → `revokeById` üzerinden iptal eder. İki procedure aynı tablo üstünde `revoked_at = NOW()` damgalar, farklı endpoint adı sadece çağıran tarafın elindeki anahtarı yansıtır.

**Empty state:** Faz 7 mobile aktivasyonu olmadan token=[] beklenen davranış; web kullanıcısına "mobil uygulamada giriş yapınca eklenir" bildirilir. `BellIcon` rozeti + ipucu metni (`NotificationCenter` empty pattern'iyle simetrik — bkz. §13.9).

**Cihaz adı:** `device_name` kolonu opsiyonel; `null` ise platform adı ("iOS cihazı", "Android cihazı", "Web tarayıcı") fallback gösterilir.

> **Wired (2026-05-15 — Faz 10E / [DEM-139](https://linear.app/demirkol/issue/DEM-139)):** UI [`apps/web/src/app/(app)/account/_components/notifications-devices-list.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-devices-list.tsx) — `push.tokens.list` query + `push.tokens.revokeById` mutation; optimistic remove + `onError` rollback + toast.error; loading skeleton (3 satır), empty state (BellIcon + ipucu metni), platform-bazlı ikon (SmartphoneIcon/TabletIcon/MonitorIcon), `formatRelativeTime` ile "Son: X" etiket. Backend yeni procedure [`packages/api/src/routers/push.ts`](../../packages/api/src/routers/push.ts) `tokens.revokeById({ id })` — privacy gereği `tokens.list` token string'i dönmediği için satır id'siyle iptal eden web varyantı; mobil client (Faz 7) hâlâ `revoke({ token })` kullanır. Schema [`packages/domain/src/schemas/push-token.ts`](../../packages/domain/src/schemas/push-token.ts) `revokePushTokenByIdInput`. Vitest+RTL [`apps/web/src/app/(app)/account/_components/notifications-devices-list.test.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-devices-list.test.tsx) (8 test, hepsi PASS) + backend [`packages/api/src/routers/push.test.ts`](../../packages/api/src/routers/push.test.ts) (revokeById için 6 yeni test). i18n `strings.account.notifications.devices.*` + `errors.revokeFailed`. AccountTabs Bildirimler sekmesi **4 section devrede** ([`apps/web/src/app/(app)/account/page.tsx`](../../apps/web/src/app/(app)/account/page.tsx)).

## 15.4 Gelişmiş özellikler — Faz 10F/G/H/I

Bu section'lar Faz 10D bittikten sonra eklenir; her biri kendi alt issue'sunda ayrı section olarak Bildirimler sekmesine iliştirilir.

### Section 5 — Sessiz saatler (Faz 10F)

```
┌────────────────────────────────────────────────┐
│ Sessiz saatler                                 │
│ Belirtilen aralıkta push/email gönderilmez.    │
│ Uygulama içi bildirim etkilenmez.              │
├────────────────────────────────────────────────┤
│ [Switch ON/OFF] Sessiz saatleri aç             │
│                                                │
│ ON ise:                                        │
│ Başlangıç:    [23:00 ▾]                        │
│ Bitiş:        [07:00 ▾]                        │
│ Zaman dilimi: [Europe/Istanbul ▾]              │
│                                                │
│ ℹ️ Bildirimler 23:00–07:00 (Türkiye) arasında │
│    push/email göndermez. Mention ve davet      │
│    her zaman geçer.                            │
└────────────────────────────────────────────────┘
```

**DB:** `notification_preferences` üstüne `quiet_from time`, `quiet_to time`, `quiet_timezone text` (Faz 10F migration). Üçü birden NULL veya üçü birden dolu (CHECK constraint).

**Worker filter:** `notification-email.ts` / `notification-push.ts` recipient'ın preference satırını yükler, `quiet_timezone`'da `now` `quiet_from`–`quiet_to` aralığındaysa kanal **iptal** (kuyrukta birikme önlemek için). In-app etkilenmez. Mention/davet zaten mute-bypass.

**Scope:** Sadece **global** preference satırına bağlı — workspace/board/card override'larında quiet hours kolonları kullanılmaz (sade tutmak için).

**UI primitives:** 1× `Switch`, 2× `<input type="time">`, 1× `Select` (IANA timezone listesi).

> **Wired (2026-05-15 — Faz 10F / [DEM-140](https://linear.app/demirkol/issue/DEM-140)):** Section 5 [`apps/web/src/app/(app)/account/_components/notifications-quiet-hours-form.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-quiet-hours-form.tsx) içinde devrede. Toggle OFF → triplet `null`; toggle ON → `<input type="time">` × 2 + IANA timezone `Select` görünür ve önizleme metni "Bildirimler {from}–{to} ({tz}) arasında push/e-posta göndermez" satırını + mute-bypass notunu çizer. Tarayıcı timezone'u `Intl.DateTimeFormat().resolvedOptions().timeZone` ile algılanır; fallback `Europe/Istanbul`. Backend `notifications.preferences.upsert` quiet alanlarını yazar (Zod `validateQuietHoursTriplet` üçü-birlikte + scope=global zorunluluğunu enforce eder). Worker filter (`apps/worker/src/jobs/notification-email.ts` + `notification-push.ts`) pencerede non-bypass tipleri `status='dead'` + `last_error='quiet_hours_window'` damgalar; in-app processor etkilenmez. ChannelsForm + TypeMatrix + ScopeTree + QuietHoursForm aynı `preferences.get` cache'ini paylaşır; her form mutation'da kendisinin sahip olmadığı alanları `effective.*`'tan taşıyarak diğer section'ları ezmez. i18n `strings.account.notifications.quiet.*`. Vitest+RTL [`notifications-quiet-hours-form.test.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-quiet-hours-form.test.tsx) 7 test PASS.

### Section 6 — E-posta sıklığı / digest (Faz 10G)

```
┌────────────────────────────────────────────────┐
│ E-posta sıklığı                                │
├────────────────────────────────────────────────┤
│ ◯ Anlık (her bildirim için ayrı mail)          │
│ ◯ Saatlik özet                                 │
│ ◯ Günlük özet (sabah 08:00)                    │
│ ◯ Hiç gönderme                                 │
│                                                │
│ ℹ️ Sözedilme (@) ve davetler her zaman anlık. │
└────────────────────────────────────────────────┘
```

**DB:** `notification_preferences.email_mode text NOT NULL DEFAULT 'instant' CHECK (email_mode IN ('instant','hourly_digest','daily_digest','off'))`.

**Worker:** Yeni `apps/worker/src/jobs/notification-email-digest.ts` — BullMQ repeatable cron (`hourly: '0 * * * *'`, `daily: '0 8 * * *'`). Outbox satırları `status='digest_queued'` damgalanır → digest worker tipe göre gruplar → tek özet maili gönderir → her satırı `status='delivered'` damgalar.

**Mute-bypass tipler digest moduna girmez** — anlık gider (mention, board_invitation, workspace_invitation).

**Scope:** Sadece **global** preference satırına bağlı.

**UI primitives:** 1× `RadioGroup` (4 option).

> **Wired (2026-05-15 — Faz 10G / [DEM-141](https://linear.app/demirkol/issue/DEM-141)):** Section 6 [`apps/web/src/app/(app)/account/_components/notifications-digest-form.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-digest-form.tsx) içinde devrede; `notifications.preferences.get({})` ile global default satırı okur, `upsert` mutation'ı optimistic `setQueryData` + rollback + `invalidateQueries` lifecycle'ı taşır (hem `get` hem `list`). 4-option `RadioGroup` (`instant`/`hourly_digest`/`daily_digest`/`off`); `isEmailDigestMode` narrowing'i ile DB text column güvenli daraltma. Mute-bypass tipler `bypassNote` ile açıklanır. Backend: migration `0026_dem141_email_digest` (`email_mode` kolonu + `outbox_status='digest_queued'` enum değeri + partial index). `notification-outbox.ts:insertNotificationOutbox` recipient `email_mode`'a göre status damgalar; `'off'` → INSERT etmez, digest mod'larda `'digest_queued'` damgalar, mute-bypass tipler her zaman `'pending'` kalır. Worker [`apps/worker/src/jobs/notification-email-digest.ts`](../../apps/worker/src/jobs/notification-email-digest.ts) BullMQ `pusula-notifications-email-digest` kuyruğunda iki repeatable cron (hourly `0 * * * *` + daily `0 8 * * *`); `FOR UPDATE SKIP LOCKED` + recipient bazlı gruplama + güncel `email_mode` yeniden okuma (kullanıcı arada `instant`'a geçtiyse sessiz skip) + `renderDigestEmail` (tip bazlı gruplama, max 5 satır per grup + "ve X daha", footer prefs linki). AccountTabs Bildirimler sekmesi sıralaması: Channels → Matrix → QuietHours → **Digest** → ScopeTree → Snooze → Devices. i18n `strings.account.notifications.digest.{title,description,instant,hourly,daily,off,bypassNote}`. Vitest 25+ yeni test (outbox 4 + publish 2 + email-digest 9 + templates 8 + digest-form UI 5) PASS.

### Section 7 — Snooze (Faz 10H)

Bu section **listeleme amaçlı** Bildirimler sekmesinde görünür ama asıl snooze aksiyonu **kart detay modalında** alınır:

```
┌────────────────────────────────────────────────┐
│ Aktif snooze'lar                               │
├────────────────────────────────────────────────┤
│ 🔕 "API tasarımı" kartı · 4s 12dk kaldı       │
│                                    [Kaldır]    │
│ 🔕 "Q2 roadmap planlama" · 2g kaldı           │
│                                    [Kaldır]    │
│                                                │
│ Empty state:                                   │
│ Aktif snooze yok. Kart detayından              │
│ "Bildirimleri sustur" dropdown'ı ile kart      │
│ bazında geçici sustur.                         │
└────────────────────────────────────────────────┘
```

**Veri:** `notifications.preferences.list()` sonuçlarından `mute_until IS NOT NULL AND mute_until > now()` satırlar filtrelenip ayrı liste.

**Kart detayı dropdown** (asıl aksiyon yeri):
```
🔔 Bildirimleri sustur ▾
  1 saatlik
  4 saatlik
  1 günlük
  1 haftalık
  Belirli tarihe kadar… (date picker)
  ─────
  Susturmayı kaldır (mute_until dolu ise)
```

**DB:** `notification_preferences.mute_until timestamptz` + partial index `WHERE mute_until IS NOT NULL`. Rule engine `pickChannels`: `mute_until > now()` → `mute_level='all'` davranışı (otomatik süresi dolunca devre dışı).

**tRPC:** `notifications.preferences.snooze({ cardId, duration, untilDate? })` + `unsnooze({ cardId })`.

> **Wired (2026-05-15 — Faz 10H / [DEM-142](https://linear.app/demirkol/issue/DEM-142)):** Section 7 + kart detay dropdown'ı canlı. Kart detay header'ında [`apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-snooze.tsx`](../../apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-snooze.tsx) `BellIcon`/`BellOffIcon` toggle + DropdownMenu (5 duration: 1 saatlik / 4 saatlik / 1 günlük / 1 haftalık / Belirli tarihe kadar…) + native `<input type="datetime-local">` Dialog (until_date için inline geçerli-tarih kontrolü ile). Snooze aktif iken icon `BellOffIcon`'a döner ve `data-snooze-active="true"` + tooltip "Kalan: …" gösterir. AccountTabs Section 7 [`apps/web/src/app/(app)/account/_components/notifications-snooze-list.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-snooze-list.tsx) `notifications.preferences.list()` üzerinden `cardId IS NOT NULL AND mute_until > now` filtreler; süresi dolmuş satırlar UI'da gösterilmez (backend'te audit için silinmez). Sayfa yerleşimi: Channels → Matrix → QuietHours → Digest → ScopeTree → **SnoozeList** → Devices ([`apps/web/src/app/(app)/account/page.tsx`](../../apps/web/src/app/(app)/account/page.tsx)). Backend procedure'leri ve rule engine değişikliği için [`06-bildirim-altyapisi.md`](06-bildirim-altyapisi.md) "Snooze (Faz 10H)" Wired notuna bak; Zod şemaları ve domain kuralları için [`../domain/04-bildirim-kurallari.md`](../domain/04-bildirim-kurallari.md). Optimistic UI: `setQueryData` snapshot + rollback + invalidate (hem `preferences.get({ cardId })` hem `preferences.list`); başarıda toast yok, hatada `strings.account.notifications.snooze.{snoozeError, unsnoozeError}` (toast disiplini §15.5). i18n `strings.account.notifications.snooze.*` (Türkçe diakritikli — `durations.{1h,4h,1d,1w,untilDate}` + `unsnooze` + `untilDate*` dialog metinleri). Vitest+RTL 13 test (CardDetailSnooze 7 + NotificationsSnoozeList 6) + backend 12 test = 25 yeni; tüm paketler `pnpm typecheck + test + lint` temiz.

### Section 8 — Bilinen cihazlar / Güvenlik tab'ı (Faz 10I)

Faz 10I aslında **Güvenlik tab'ına** yerleşir (Bildirimler değil) — sebep: "yeni cihazda oturum açıldı" bir bildirim değil, hesap güvenliği bilgisidir; notification outbox'a yazılmaz, doğrudan Resend ile gönderilir.

```
Güvenlik tab → Bilinen cihazlar section
┌────────────────────────────────────────────────┐
│ Bilinen cihazlar                               │
│ Bu cihazlardan oturum açtınız. Tanımadığınız  │
│ bir cihaz varsa hesabınızı koruyun.            │
├────────────────────────────────────────────────┤
│ 💻 Chrome · Windows · İstanbul · az önce      │
│                                  [Çıkış yap]   │
│ 📱 Safari · iOS · İstanbul · 3 gün önce       │
│                                  [Çıkış yap]   │
└────────────────────────────────────────────────┘
```

**Veri:** Yeni `auth_known_devices` tablosu (Faz 10I migration). tRPC `auth.devices.list` (sadece kendi cihazları) + `auth.devices.revoke({ deviceId })` (Better Auth `revokeSession` ile bağlanır).

> **Wired (2026-05-15 — Faz 10I / [DEM-143](https://linear.app/demirkol/issue/DEM-143)):** Migration [`packages/db/drizzle/0023_dem143_known_devices.sql`](../../packages/db/drizzle/0023_dem143_known_devices.sql) + Drizzle [`packages/db/src/schema/auth.ts`](../../packages/db/src/schema/auth.ts) `authKnownDevices`. Login hook [`apps/api/src/auth.ts`](../../apps/api/src/auth.ts) (`databaseHooks.session.create.after`) → [`apps/api/src/known-devices.ts:recordSessionDevice`](../../apps/api/src/known-devices.ts) (best-effort, hash + subnet idempotent upsert) → yeni cihazsa [`apps/api/src/auth-emails.ts:sendNewDeviceLoginEmail`](../../apps/api/src/auth-emails.ts) (Resend, transactional). tRPC [`packages/api/src/routers/devices.ts`](../../packages/api/src/routers/devices.ts) `auth.devices.list` + `auth.devices.revoke` (Better Auth `sessions` rows match by hash+subnet). UI [`apps/web/src/app/(app)/account/_components/security-activity-section.tsx`](../../apps/web/src/app/(app)/account/_components/security-activity-section.tsx) → Güvenlik tab'ında listelenir, `isCurrent` flag'i ile aktif oturum "Çıkış yap" butonu disabled. i18n `strings.account.security.devices.*`. Detay → [`07-auth.md`](07-auth.md) "Yeni cihazda oturum maili (Faz 10I)".

## 15.5 Optimistic UI & error handling

Faz 4 cache pattern'i (`apps/web/src/lib/board-cache/`) bildirim tercihleri için **gereksiz** — board state hiyerarşisi yok, tek seviye liste. TanStack Query default mutation pattern'i yeter:

```ts
const upsert = trpc.notifications.preferences.upsert.useMutation({
  onMutate: async (input) => {
    await utils.notifications.preferences.list.cancel();
    const previous = utils.notifications.preferences.list.getData();
    utils.notifications.preferences.list.setData(undefined, (old) =>
      applyOptimisticUpsert(old, input)
    );
    return { previous };
  },
  onError: (err, _input, ctx) => {
    if (ctx?.previous) utils.notifications.preferences.list.setData(undefined, ctx.previous);
    toast.error(strings.account.notifications.errors.saveFailed);
  },
  onSettled: () => utils.notifications.preferences.list.invalidate(),
});
```

**Toast disiplini:** Başarılı kayıtta `toast.success("Tercihler güncellendi")` **göstermez** — switch zaten görsel feedback verir. Sadece **hata** olduğunda toast gösterilir (Sonner pattern, §13.1).

## 15.6 i18n — `strings.account.notifications.*`

Tüm metinler `apps/web/src/lib/strings.ts` (veya merkezi i18n entry) altında `strings.account.notifications.*` namespace'inde toplanır. Hardcode metin **yasak** (CLAUDE.md §2/8 kuralı).

Hap liste:
- `tabs.{profile, security, notifications}` — Tabs label'ları
- `channels.{title, description, inApp, email, push, alwaysOn}` — Section 1
- `mute.{title, none, mentionsOnly, all, bypassNote}` — Section 1 RadioGroup
- `matrix.{title, bulkAll, bulkNone, bulkNoEmail, muteBypassTooltip, disabledTooltip(channel), groups.{mentions, comment, dueDate, lifecycle, invitations}, types.{cardAssigned, mention, commentReply, dueApproaching, dueOverdue, watchedActivity, checklistItemCompleted, boardInvitation, workspaceInvitation}}` — Section 2
- `scopes.{title, narrowestWins, addNew, removeOverride, scopeLabels.{workspace, board, card}}` — Section 3
- `devices.{title, description, loading, loadFailed, emptyTitle, emptyBody, remove, removing, removeAriaLabel(device), unnamedDevice.{ios, android, web}, platform.{ios, android, web}, lastUsed(time), registeredAt(time), revokeError}` — Section 4 (Faz 10E — DEM-139)
- `quiet.{title, description, toggleLabel, from, to, timezone, preview(from, to, tz), bypassNote}` — Section 5 (Faz 10F)
- `digest.{title, instant, hourly, daily, off, bypassNote}` — Section 6 (Faz 10G)
- `snooze.{title, empty, durations.{1h, 4h, 1d, 1w, untilDate}, remove, remaining(relativeTime)}` — Section 7 (Faz 10H)
- `security.devices.{title, description, signOut, location, lastUsed(relativeTime)}` — Section 8 (Faz 10I)
- `errors.{saveFailed, loadFailed, permissionDenied}` — toast metinleri

Türkçe metin disiplini diakritik korunarak, kullanıcı dilinden ayrıştırma yok — Faz 10 tek dil (TR); ileride EN katmanı eklenirse namespace bozulmaz.

## 15.7 Erişilebilirlik (a11y)

- Tabs `role="tablist"` + `aria-controls` + klavye Left/Right/Home/End — Radix Tabs varsayılan davranışı.
- Switch `role="switch"` + `aria-checked` — Radix Switch varsayılan.
- RadioGroup `role="radiogroup"` + her item `aria-checked` — Radix RadioGroup varsayılan.
- Tüm interactive element'lerin `Label` ile bağlanması (`htmlFor` veya wrapping).
- Mute-bypass disabled Switch'ler `aria-disabled="true"` + ekran okuyucu için açıklama.
- Form field gruplarına `aria-describedby` ile yardımcı metin bağlama.
- Renk-bağımsız iletişim: ON/OFF state sadece renkle değil ikonla da gösterilir (Switch içinde dot + ikon).

## 15.8 Tasarım dili uyumu

`13-ui-tasarim-dili.md` token sistemi (`oklch` renk + radius `0.5rem` + Inter font + Trello-vari mavi primary + 12-renk palet) Bildirim ayarları sekmesinde tutarlı uygulanır:

- Section başlıkları `text-base font-semibold` + alt `text-sm text-muted-foreground` description.
- Card stack içinde her section ayrı `Card` (`packages/ui Card` primitive, §13.x).
- Toggle/RadioGroup hizalama: `flex items-center justify-between gap-3` (Section 1 pattern); matrix grid `grid grid-cols-[1fr_auto_auto_auto]`.
- Dark/light tema (Faz 2.7 follow-up #2) tüm primitive'ler için pass'lı — `--background`/`--card`/`--muted` token'ları üzerinden.
- Empty state pattern §13.4 `EmptyState` bileşeni — push token cihazlar listesinde, scope override ağacında, snooze listesinde aynı görsel dil.

## 15.9 Faz/dosya yerleştirmesi

Bu belge yalnızca **UI tasarım** anatomisini netleştirir. Backend procedure imzaları → [`06-bildirim-altyapisi.md`](06-bildirim-altyapisi.md) "Notification preferences API" (Faz 10B'de yazılır). Domain kuralları (mute-bypass tipler, scope hiyerarşisi) → [`../domain/04-bildirim-kurallari.md`](../domain/04-bildirim-kurallari.md). Faz alt iş listesi → [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md) "Faz 10 alt işleri".
