# Public API + Bot Erişimi (API Key) Implementation Plan

> **Claude için:** Bu planı uygularken görev sırasını koru. Her görevde önce failing test, sonra minimal implementasyon (TDD). Görev bitiminde `@code-reviewer` + `@verifier` döngüsünden geçir. "Önce belge" kuralı gereği Task 0 (docs güncellemeleri) kod görevlerinden önce tamamlanmalı.

**Goal:** Kullanıcının sahibi olduğu bir panonun tüm içerik işlemlerini (liste CRUD, kart CRUD + taşıma, checklist + madde CRUD, yorum CRUD, etiket CRUD, ek yükleme, aktivite okuma) API key ile kimliklenen bir **bot aktörüne** açmak. Bot, panoya "üye" olan bir servis hesabı gibi davranır; yaptığı her mutasyon normal kullanıcı mutasyonlarıyla **aynı** activity + notification outbox + realtime zincirinden geçer.

---

## Mimari karar özeti

| Karar noktası | Karar | Gerekçe |
| --- | --- | --- |
| API yüzeyi | `/api/v1/*` altında **ham Hono REST route'ları** (apps/api) | `docs/architecture/14-paylasim-linki-mimarisi.md` emsali: "Public endpoint'ler webhook benzeri kabul edilir; tRPC contract'ı bu yola çekilmez." Ana sözleşme tRPC kalır, paralel ana API oluşmaz. |
| İş mantığı | REST handler'ları **tRPC server-side caller** (`createCallerFactory`, `packages/api/src/trpc.ts:21`) üzerinden mevcut procedure'leri çağırır | Tek source of truth. Permission, invariant, activity+outbox+realtime üçlüsü, idempotency — hepsi mevcut procedure gövdelerinden bedavaya gelir. superjson wire-format sorunu da yok (caller düz JS objesi döner). |
| Bot kimliği | `users` tablosuna `is_bot boolean` kolonu; her API key **1:1 bir bot kullanıcısına** bağlı; bot, hedef panoya `board_members` satırı **ve** panonun workspace'ine **`guest` rollü `workspace_members`** satırı ile üye | `activity_events.actor_id` FK'sı `users`'a — bot aktörü FK bütünlüğünü bozmadan aktivite/yorum sahibi olur. `resolveBoardAccess` (`packages/api/src/middleware/board-access.ts:67`) **önce workspace üyeliğini** kontrol eder — bu satır olmadan bot her istekte FORBIDDEN alır. `guest` rolü kapıyı geçirir ama `effectiveBoardRole` açık board rolünü öncelediğinden aynı workspace'teki diğer panolara örtük erişim vermez. UI'da "Bot" rozetiyle görünür. |
| API key saklama | Yeni `api_keys` tablosu: `token_hash` (SHA-256) + `token_prefix`; plain key **bir kez** gösterilir | `share_links` token deseniyle birebir aynı (`crypto.randomBytes(32)` → base64url 43 char). Better Auth `apiKey` plugin'i değerlendirildi ama key'i gerçek kullanıcıya bağlar; board-scoped bot modeli özel tablo ister. |
| Bot rolü | Key oluştururken seçilir: **`member`** (varsayılan) veya **`viewer`**. `admin` v1'de **yok** | Kullanıcının istediği tüm içerik işlemleri (liste/kart/checklist/yorum/ek/etiket CRUD) `member` rolüyle karşılanıyor (`docs/domain/02-yetkilendirme-kurallari.md` yetki matrisi). Pano yönetimi (ayar, üye, silme) insan sorumluluğunda kalır; saldırı yüzeyi küçülür. |
| Scope kontrolü | Üç katman: (1) bot yalnız hedef panonun üyesi, (2) REST adapter her istekte `key.boardId === çözülen boardId` doğrular, (3) çapraz board hedefleyebilen `card.copy` / `card.moveToList`te **hedef listenin board'u da** `key.boardId` ile eşleşmek zorunda (v1: yalnız aynı board içi hedef, aksi 403) | Üyelik tek başına yeterli ama savunma derinliği: key tek panoya kilitli kalır; copy/move-to-list uçları başka panoya içerik sızdıramaz. |
| Idempotency | `Idempotency-Key` header'ı (UUID) → `clientMutationId`; **tüm mutasyon uçlarında zorunlu** (eksik/geçersizse 400) | AI ajanları ağ hatasında agresif retry yapar; zorunluluk kopya kayıt riskini kapatır. Mevcut `clientMutationIdSchema` (UUID) ve realtime echo-filtreleme aynen kullanılır. |
| Rate limit | Redis-backed, key başına (varsayılan 120 istek/dk); 429 + `Retry-After` | Mevcut in-memory limiter (`apps/api/src/middleware/rate-limit.ts`) yalnız `/share` için; ioredis zaten bağımlılıkta. |
| API dokümantasyonu | Elle bakımlı OpenAPI 3.1 JSON, `GET /api/v1/openapi.json` üzerinden servis edilir | Tüketici bir AI botu — makine-okur spec yüksek değerli. Yeni bağımlılık gerektirmez; route sayısı büyürse `@hono/zod-openapi` alternatifi karar kaydına yazıldı. |
| Yeni bağımlılık | **Yok** (zorunlu olan) | Token üretimi `node:crypto`, rate limit `ioredis`, spec elle. |

### İstek akışı

```txt
Bot (AI ajanı)
  → Authorization: Bearer psk_<43-char>  +  Idempotency-Key: <uuid>
  → Hono /api/v1/* middleware zinciri:
      request id → body limit (1MB) → apiKeyAuth:
        prefix lookup → SHA-256 timingSafeEqual → revoked/expired kontrolü
        → bot user + board scope yükle → per-key rate limit (Redis)
        → last_used_at güncelle (dakikada en çok 1 yazım)
  → REST handler:
      key scope doğrula (boardId eşleşmesi)
      → tRPC caller (SessionInfo = bot user) → mevcut procedure
        → boardProcedure/cardProcedure erişim çözümü (bot = board member)
        → Drizzle tx: domain mutasyonu + activity_events + realtime_events + notification_outbox
      → çıktıyı JSON'a map'le (Date → ISO string)
  → 2xx JSON  |  hata: { error: { code, message } } (TRPCError → HTTP status map)
```

**Tech Stack:** Mevcut stack (Hono 4.12, tRPC 11.17, Drizzle 0.45, zod 4, ioredis, Better Auth 1.6.10). Yeni paket yok.

---

## Kapsam

### V1'de var

- `api_keys` tablosu + bot kullanıcı modeli + migration
- `/api/v1` REST yüzeyi: board okuma, liste CRUD + move, kart CRUD + move/copy/complete/archive, kart üyesi ve etiket atama, etiket CRUD, checklist + madde CRUD (toggle/reorder/bulk-import dahil), yorum CRUD, ek (attachment) presigned akışı, aktivite okuma, `GET /me`
- Key yönetimi tRPC router'ı (`board.apiKeys.*`) + board ayarlarında "API Anahtarları" bölümü (web)
- Bot guard'ları: bota bildirim gönderilmez, bot login olamaz
- Per-key rate limit, audit log, OpenAPI spec + kullanım rehberi

### V1'de yok (bilinçli erteleme)

- **Webhook / event push:** botun panodaki değişikliklerden haberdar olması (outbox'a `webhook` kanalı) — ayrı faz; bot v1'de polling (`GET /board`, `GET /activity`) yapar.
- **`admin` scope'lu key:** pano ayarı/üye yönetimi/kalıcı silme (`list.delete`, `card.delete`, `board.update`) bota açılmaz.
- **Workspace-scoped key:** key tek panoya kilitli; çoklu pano isteyen kullanıcı pano başına key üretir.
- **Mobil key yönetim UI'ı:** yönetim yalnız web'de.
- Kalıcı silme uçları (admin gerektirdiği için otomatik kapsam dışı).

---

## Endpoint haritası (REST → tRPC procedure → minimum rol)

Tüm uçlar `/api/v1` öneklidir. `cardProcedure` tabanlı kaynaklar kart altına iç içe geçirilir (input şemaları `cardId` istiyor).

| Yöntem + Path | tRPC procedure | Min rol |
| --- | --- | --- |
| `GET /me` | — (key/bot meta: bot adı, boardId, rol, expiry) | viewer |
| `GET /board` | `board.get` | viewer |
| `GET /board/activity` | `board.activity.list` | viewer |
| `GET /board/members` | `board.members.list` | viewer |
| `POST /lists` | `list.create` | member |
| `PATCH /lists/:listId` | `list.update` | member |
| `POST /lists/:listId/move` | `list.move` | member |
| `POST /lists/:listId/archive` | `list.archive` (restore dahil) | member |
| `POST /cards` | `card.create` | member |
| `GET /cards/archived` | `card.listArchived` | viewer |
| `GET /cards/:cardId` | `card.get` | viewer |
| `PATCH /cards/:cardId` | `card.update` | member |
| `POST /cards/:cardId/move` | `card.move` | member |
| `POST /cards/:cardId/move-to-list` | `card.moveToList` | member |
| `POST /cards/:cardId/copy` | `card.copy` | member |
| `POST /cards/:cardId/archive` | `card.archive` (restore dahil) | member |
| `POST /cards/:cardId/complete` · `/uncomplete` | `card.complete` / `card.uncomplete` | member |
| `GET /cards/:cardId/activity` | `card.activity.list` | viewer |
| `GET /cards/:cardId/members` | `card.members.list` | viewer |
| `POST /cards/:cardId/members` | `card.members.add` | member |
| `DELETE /cards/:cardId/members/:userId` | `card.members.remove` | member |
| `POST /cards/:cardId/labels` | `card.labels.add` | member |
| `DELETE /cards/:cardId/labels/:labelId` | `card.labels.remove` | member |
| `GET /labels` | `label.list` | viewer |
| `POST /labels` | `label.create` | member |
| `PATCH /labels/:labelId` | `label.update` | member |
| `DELETE /labels/:labelId` | `label.delete` | member |
| `GET /cards/:cardId/checklists` | `checklist.list` | viewer |
| `POST /cards/:cardId/checklists` | `checklist.create` | member |
| `POST /cards/:cardId/checklists/bulk-import` | `checklist.bulkImport` | member |
| `PATCH /cards/:cardId/checklists/:checklistId` | `checklist.update` | member |
| `POST /cards/:cardId/checklists/:checklistId/archive` | `checklist.archive` | member |
| `DELETE /cards/:cardId/checklists/:checklistId` | `checklist.delete` | member |
| `POST …/checklists/:checklistId/items` | `checklist.item.create` | member |
| `PATCH …/items/:itemId` | `checklist.item.update` | member |
| `POST …/items/:itemId/toggle` | `checklist.item.toggle` | member |
| `POST …/items/:itemId/reorder` | `checklist.item.reorder` | member |
| `DELETE …/items/:itemId` | `checklist.item.delete` | member |
| `GET /cards/:cardId/comments` | `comment.list` | viewer |
| `POST /cards/:cardId/comments` | `comment.create` | member |
| `PATCH /cards/:cardId/comments/:commentId` | `comment.update` (yalnız kendi yorumu) | member |
| `DELETE /cards/:cardId/comments/:commentId` | `comment.delete` (yalnız kendi yorumu) | member |
| `POST /cards/:cardId/attachments/initiate` | `attachment.initiate` (presigned URL) | member |
| `POST /cards/:cardId/attachments/commit` | `attachment.commit` | member |
| `GET /cards/:cardId/attachments` | `attachment.list` | viewer |
| `PATCH /cards/:cardId/attachments/:attachmentId` | `attachment.update` | member |
| `DELETE /cards/:cardId/attachments/:attachmentId` | `attachment.delete` | member |
| `GET /cards/:cardId/attachments/:attachmentId/download-url` | `attachment.getDownloadUrl` | viewer |
| `GET /openapi.json` | — (statik spec) | auth'suz |

Notlar:

- **Rich text:** kart açıklaması / yorum / checklist içerikleri Tiptap JSON. REST girişleri hem Tiptap JSON hem düz string kabul eder; düz string adapter'da minimal Tiptap dokümanına çevrilir (`plainTextToTiptap` helper'ı, Task 3). Çıkışta hem ham JSON hem `previewText` (mevcut `richTextPreview` helper'ı) döner.
- **Pozisyon:** `move` uçları mevcut input şemalarını aynen kullanır (`beforeCardId`/`afterCardId`/`newPosition`). Bot kolaylığı için adapter `newPosition` verilmezse komşu id'lerden `@pusula/domain/position.positionBetween` ile hesaplar.
- **Self-add yasağı (DEM-298)** ve diğer domain invariant'ları procedure gövdelerinde zaten enforce edildiği için REST'te ek iş yok; bot kendini karta ekleyemez.
- **Çapraz board kapalı:** `card.copy` ve `card.moveToList` procedure'leri başka board'daki listeyi hedefleyebilir; public API'de hedef listenin board'u handler'da `key.boardId` ile doğrulanır — eşleşmiyorsa 403.
- **Archive/restore sözleşmesi:** `POST …/archive` gövdesi `{ "archived": false }` ile restore yapar (mevcut `archiveCardInput`/`archiveListInput` semantiği). Bot ayrı bir restore ucu aramasın diye OpenAPI spec'te açıkça örneklenir (Task 10).
- **Idempotency:** tüm `POST`/`PATCH`/`DELETE` uçları `Idempotency-Key` header'ı (UUID) ister; eksikse 400.

---

## Veri modeli

### `users` değişikliği

```txt
is_bot boolean NOT NULL DEFAULT false
```

Bot kullanıcı: `name` = key oluştururken verilen bot adı, `email` = `bot+{apiKeyId}@bots.pusula.internal` (sentetik, unique), `emailVerified` = false, `accounts` satırı yok (şifresiz — login imkânsız; Task 9'da savunma katmanı eklenir).

### Yeni tablo: `api_keys`

```txt
id             text PK
name           text NOT NULL                 -- kullanıcıya görünen ad = bot görünen adı
token_hash     text NOT NULL UNIQUE          -- SHA-256(plain token)
token_prefix   text NOT NULL                 -- "psk_" + ilk 8 char (UI + lookup index)
bot_user_id    text NOT NULL FK→users        -- 1:1 bot kullanıcısı
board_id       text NOT NULL FK→boards ON DELETE CASCADE
role           board_role NOT NULL DEFAULT 'member'  -- 'admin' uygulama katmanında reddedilir
created_by     text NOT NULL FK→users        -- key'i üreten insan (board admin)
expires_at     timestamptz NULL              -- null = süresiz
last_used_at   timestamptz NULL
revoked_at     timestamptz NULL
created_at     timestamptz NOT NULL DEFAULT now()
```

İndeksler: `token_prefix`, `board_id`. Key formatı: `psk_` + base64url(`crypto.randomBytes(32)`) — 256-bit entropy, `share_links` ile aynı disiplin.

Yaşam döngüsü: **create** (board admin; tek transaction'da bot user + `workspace_members` (`role: 'guest'`) + `board_members` + `api_keys` satırları oluşur, plain key bir kez döner) → **revoke** (revoked_at set edilir + bot'un `board_members` **ve** `workspace_members` satırları silinir — key↔bot 1:1 olduğundan botun başka üyeliği yoktur, koşulsuz silinebilir; bot user satırı aktivite geçmişi atıfları için kalır) → **expiry** (auth middleware reddeder; kullanıcı UI'dan yeni key üretir).

---

## Görevler

### Task 0: Belgeler — "önce belge"

**Files:**

- Create: `docs/architecture/21-public-api-ve-bot-erisimi.md` (bu planın mimari kararlarının kalıcı hali; `14-paylasim-linki-mimarisi.md` şablon)
- Create: `docs/domain/10-bot-ve-api-key-kurallari.md` (kim key üretir, bot rol matrisi, revoke/expiry semantiği, bota bildirim gitmez kuralı, invariant: bot admin olamaz / son admin olamaz)
- Modify: `docs/architecture/02-teknoloji-kararlari.md` — Karar kaydına `- **2026-07-13** — …` satırı (REST-over-caller, custom api_keys, rol kısıtı, OpenAPI yaklaşımı; `@hono/zod-openapi` alternatif olarak not) + `updated:`
- Modify: `docs/architecture/03-backend.md` — Hono kabuğu sorumluluklarına `/api/v1` public API + apiKeyAuth middleware
- Modify: `docs/architecture/07-auth.md` — "Makine kimliği: API key + bot kullanıcı" bölümü (Better Auth session modelinden ayrımı)
- Modify: `docs/domain/02-yetkilendirme-kurallari.md` — bot aktörü satırları (yetki matrisine "bot(member)/bot(viewer)" kolonu değil, ayrı kısa bölüm)
- Modify: `docs/architecture/README.md`, `docs/domain/README.md` — indeks tablolarına yeni dosyalar

**Steps:**

- [ ] **Step 1:** İki yeni doc'u Obsidian standardıyla (frontmatter: `title/description/aliases/tags/type/axis/status/parent/updated`) oluştur, README indekslerine ekle
- [ ] **Step 2:** Karar kaydı satırını ve 03/07/02-domain güncellemelerini yaz
- [ ] **Step 3:** Kök `CLAUDE.md` + `.claude/skills/kontrol/SKILL.md`'ye tek satır özet + pointer ekle (ince tut)

### Task 1: DB şeması + migration

**Files:**

- Modify: `packages/db/src/schema/auth.ts` (`users.isBot`)
- Create: `packages/db/src/schema/api-keys.ts` (+ `schema/index.ts` barrel export)
- Create: migration (drizzle-kit generate → `packages/db/drizzle/0056_*.sql` civarı; script adını `packages/db/package.json`'dan doğrula)

**Steps:**

- [ ] **Step 1:** Şema testi yaz (tablo/kolon varlığı, unique/FK kısıtları) — fail görsün: `pnpm --filter @pusula/db test`
- [ ] **Step 2:** Şemayı yaz (`casing: 'snake_case'` — TS'te camelCase anahtar), migration üret, lokalde uygula: `pnpm db:migrate`
- [ ] **Step 3:** Test yeşil + `board_id` cascade ve `token_prefix` index'ini migration SQL'inde gözle doğrula

### Task 2: Token yardımcıları + domain sabitleri

> Not (2026-07-13 revizyonu): token üretimi `node:crypto` gerektirir; `@pusula/domain` barrel'ı web/mobil client bundle'ına da girdiği için token helper'ları domain'e **konmaz** — mevcut `packages/api/src/lib/share-token.ts` emsali izlenir.

**Files:**

- Create: `packages/api/src/lib/api-key-token.ts` — `generateApiKeyToken()` (psk_ format; token + hash + prefix döner), `hashApiKeyToken()` (SHA-256 hex), `apiKeyTokenPrefix()` (`share-token.ts` deseni)
- Create: `packages/domain/src/schemas/api-key.ts` — `apiKeyRoleSchema` (`z.enum(['member','viewer'])`) + tip export'u (saf, I/O yok)
- Create: `packages/domain/src/rich-text/plain-text-to-tiptap.ts` (veya mevcut rich-text modülünün yanına) — düz string → minimal Tiptap doc
- Modify: `packages/domain/src/index.ts` barrel

**Steps:**

- [ ] **Step 1:** Vitest: token formatı (`psk_` + 43 char base64url), hash determinizmi, prefix uzunluğu, role şeması `admin`'i reddediyor; `plainTextToTiptap` boş/çok satırlı/whitespace girdiler — fail: `pnpm --filter @pusula/domain test` + `pnpm --filter @pusula/api test`
- [ ] **Step 2:** Implementasyon (domain tarafı framework-bağımsız — DB/HTTP/node:crypto importu yok)
- [ ] **Step 3:** Testler yeşil

### Task 3: apps/api — apiKeyAuth middleware + caller köprüsü

**Files:**

- Create: `apps/api/src/middleware/api-key-auth.ts` — Bearer parse → prefix lookup → `timingSafeEqual` hash karşılaştırma → revoked/expired kontrol → `{ apiKey, botUser }` context'e koy → Redis rate limit (`ioredis`; anahtar: `ratelimit:apikey:<id>`, pencere 60 sn, limit 120; 429 + `Retry-After`) → `last_used_at` throttle'lı güncelle
- Create: `apps/api/src/public-api/caller.ts` — `createCallerFactory(appRouter)` + bot `SessionInfo` ile `createContext`; `Idempotency-Key` → `clientMutationId`
- Create: `apps/api/src/public-api/errors.ts` — TRPCError code → HTTP status map (`UNAUTHORIZED`→401, `FORBIDDEN`→403, `NOT_FOUND`→404, `BAD_REQUEST`/Zod→400 + alan detayı, `TOO_MANY_REQUESTS`→429, diğer→500 + Sentry) ve `{ error: { code, message, issues? } }` gövdesi
- Create: `apps/api/src/public-api/serialize.ts` — Date→ISO, undefined temizliği

**Steps:**

- [ ] **Step 1:** Integration test (Vitest, test DB): geçersiz/eksik/revoked/expired key → 401; yanlış board'a istek → 403; rate limit aşımı → 429 — fail: `pnpm --filter @pusula/api-server test`. Fixture notu: `board.apiKeys.create` router'ı (Task 7) henüz yok — testler `users`/`workspace_members`/`board_members`/`api_keys` satırlarını doğrudan Drizzle ile seed eder
- [ ] **Step 2:** Middleware + caller köprüsünü yaz; worker'ın `x-worker-secret` `timingSafeEqual` desenini izle (`apps/api/src/trpc.ts`)
- [ ] **Step 3:** Testler yeşil; log satırlarında yalnız `token_prefix` görünüyor (plain token asla loglanmaz)

### Task 4: REST çekirdek — board + lists + cards

**Files:**

- Create: `apps/api/src/routes/public-api/index.ts` (Hono sub-app; requestId + 1MB body limit + apiKeyAuth), `board.ts`, `lists.ts`, `cards.ts`
- Modify: `apps/api/src/app.ts` — `app.route('/api/v1', publicApiRoute)`

**Steps:**

- [ ] **Step 1:** Integration testler — fail: `GET /board` viewer key ile 200; `POST /lists` viewer → 403, member → 201; `POST /cards` + `PATCH /cards/:id` + `POST /cards/:id/move` (aynı liste + çapraz liste, `newPosition`'sız komşu-id hesaplama); aynı `Idempotency-Key` ile çift `POST /cards` → tek kart; `Idempotency-Key`'siz mutasyon → 400; `card.moveToList`/`card.copy` ile başka board'daki listeyi hedefleme → 403
- [ ] **Step 2:** Handler'ları yaz — her handler: path/body'yi mevcut tRPC input şemasına map'le → key scope doğrula → caller → serialize. İş mantığı yazma; sadece adapter
- [ ] **Step 3:** Mutasyon sonrası `activity_events` + `realtime_events` + `notification_outbox` satırlarının oluştuğunu ve `actor_id` = bot user olduğunu assert eden test ekle — yeşil

### Task 5: REST içerik — checklist + item + comment + label + kart üyesi/etiketi

**Files:**

- Create: `apps/api/src/routes/public-api/checklists.ts`, `comments.ts`, `labels.ts`, `card-members.ts`

**Steps:**

- [ ] **Step 1:** Integration testler — fail: checklist create/bulk-import/item toggle/reorder; comment create (düz string → Tiptap dönüşümü) / update (kendi yorumu) / update (başkasının yorumu → 403); label CRUD; `card.members.add` self-add → 403 (DEM-298 botu da bağlar)
- [ ] **Step 2:** Handler'lar (adapter deseni, Task 4 ile aynı)
- [ ] **Step 3:** Yeşil + `comment.create` yanıtında `previewText` alanı doğrulanır

### Task 6: REST attachment akışı

**Files:**

- Create: `apps/api/src/routes/public-api/attachments.ts`

**Steps:**

- [ ] **Step 1:** Integration test — fail: `initiate` presigned URL üretir (MinIO test container/mocked `objectStorage`), `commit` metadata kaydeder, `list`/`download-url` çalışır, viewer key `initiate` → 403
- [ ] **Step 2:** Handler'lar; `attachment.commit` `protectedProcedure` ve `uploaderId === session.user.id` invariant'ını uygular — `initiate` + `commit` aynı bot session'ıyla çağrıldığı için tutarlı; farklı key'lerin initiate/commit karıştırması bu invariant'a takılır (test et)
- [ ] **Step 3:** Yeşil

### Task 7: Key yönetimi — tRPC `board.apiKeys.*` + audit

**Files:**

- Create: `packages/api/src/routers/board-api-keys.ts` — `list` (boardProcedure query; prefix/rol/lastUsed/expiry, hash asla dönmez), `create` (mutation, `canManageBoard` şart; tek tx: bot user + `workspace_members` (`guest`) + `board_members` + `api_keys`; plain key yalnız bu yanıtta), `revoke` (mutation; revoked_at + `board_members` ve `workspace_members` satırlarının silinmesi)
- Modify: `packages/api/src/routers/board.ts` — `apiKeys: boardApiKeysRouter` mount
- Modify: audit kayıtları — mevcut audit altyapısına `api_key.created` / `api_key.revoked` (after: `{ tokenPrefix, role, expiresAt }`; `share.create` emsalindeki gibi plain token audit'e yazılmaz)

**Steps:**

- [ ] **Step 1:** Integration test — fail: member rolü `create` → FORBIDDEN; create yanıtı `psk_` ile başlar; ikinci `list` çağrısında plain key yok; revoke sonrası REST isteği 401, bot `board.members.list`'ten düşmüş ve `workspace_members` satırı silinmiş; audit satırları
- [ ] **Step 2:** Router implementasyonu (activity event: `ACTIVITY_EVENT_TYPES`'a append-only `board.api_key_created`/`board.api_key_revoked` eklemeyi domain doc'taki taksonomiyle hizala — gerekmiyorsa yalnız audit yeter, karar Task 0 domain doc'unda)
- [ ] **Step 3:** Yeşil

### Task 8: Web UI — board ayarlarında "API Anahtarları" + bot rozetleri

**Files:**

- Create: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/board-api-keys-section.tsx` (+ create dialog: ad, rol, opsiyonel expiry; oluşturunca tek seferlik key gösterimi + kopyala butonu + "bu key bir daha gösterilmeyecek" uyarısı; liste: prefix, rol, son kullanım, revoke)
- Modify: `board-settings-dropdown.tsx` — bölümü mount et (yalnız `canManageBoard`)
- Modify: üye listesi + aktivite + yorum render'ları — `user.isBot` için "Bot" rozeti (lucide `Bot` ikonu; metinler `strings.ts`/i18n üzerinden, hardcode yok)

**Steps:**

- [ ] **Step 1:** RTL testleri — fail: bölüm yalnız admin'e görünür; create akışı key'i bir kez gösterir; revoke onay diyaloğu
- [ ] **Step 2:** Bileşenler (shadcn/ui + mevcut `board-members-section.tsx` deseni; optimistic gerekmiyor — düşük frekanslı yönetim UI'ı, düz invalidate yeter)
- [ ] **Step 3:** Yeşil + `pnpm --filter @pusula/web typecheck`

### Task 9: Bot guard'ları

**Files:**

- Modify: `packages/api/src/lib/notification-outbox.ts` (`dispatchNotificationsForActivity`) — alıcı `is_bot` ise outbox satırı üretme
- Modify: `apps/api/src/auth.ts` — savunma katmanı: bot user'a session açılmasını engelle (databaseHook `session.create.before` reddi); bot e-postasına şifre sıfırlama gönderilmez
- Modify: davet/erişim akışları — bot kullanıcı davet edilemez / erişim isteyemez (ilgili procedure'lerde `is_bot` reddi)

**Steps:**

- [ ] **Step 1:** Testler — fail: bot'un kart üyesi yapıldığı senaryoda bota outbox satırı yok ama insanlara var; bot email'iyle login/reset denemesi reddediliyor
- [ ] **Step 2:** Guard'lar
- [ ] **Step 3:** Yeşil

### Task 10: OpenAPI + kullanım rehberi

**Files:**

- Create: `apps/api/src/routes/public-api/openapi.ts` — elle bakımlı OpenAPI 3.1 objesi; `GET /api/v1/openapi.json`
- Create: `docs/architecture/21` içinde veya yanında "Bot hızlı başlangıç" bölümü: key üretme, curl örnekleri, Idempotency-Key, rate limit davranışı, Tiptap/düz metin kuralı, örnek AI ajanı system-prompt parçası

**Steps:**

- [ ] **Step 1:** Test — fail: `GET /api/v1/openapi.json` auth'suz 200 + şema `openapi: "3.1"`; endpoint sayısı haritayla tutarlı (drift testi: route listesi ile spec path'leri karşılaştırılır)
- [ ] **Step 2:** Spec + rehber (archive/restore `{ "archived": false }` sözleşmesi ve zorunlu `Idempotency-Key` örnekleriyle)
- [ ] **Step 3:** Yeşil

### Task 11: Uçtan uca doğrulama

**Steps:**

- [ ] **Step 1:** Senaryo testi: admin UI'dan key üretir → bot REST ile liste + kart + checklist + yorum + ek oluşturur → web'de board'u açık tutan ikinci kullanıcı realtime güncellemeleri görür (realtime_events assert) → kart üyesi insana bildirim düşer → key revoke → bot 401
- [ ] **Step 2:** Yetki matrisi testi: viewer key tüm mutasyon uçlarında 403, tüm okuma uçlarında 200; member key `board.update`/`list.delete`/`card.delete` benzeri admin uçlarına hiç erişemiyor (endpoint yok → 404)
- [ ] **Step 3:** `pnpm build` + tüm workspace testleri + `@verifier` son geçiş

---

## Güvenlik kontrol listesi

- [ ] Plain key yalnız create yanıtında; DB/log/audit'te yalnız hash + prefix
- [ ] Hash karşılaştırması `crypto.timingSafeEqual`
- [ ] `psk_` 256-bit entropy; prefix lookup index'li ama karar hash eşitliğiyle
- [ ] Per-key rate limit (Redis) + 1MB body limit + `Cache-Control: no-store`
- [ ] `/api/v1` CORS'a **açılmaz** (server-to-server; tarayıcıdan key kullanımı istenmiyor)
- [ ] Key rolü `admin` olamaz (şema + procedure çift kontrol)
- [ ] Revoke anında etkili (her istekte DB kontrolü; cache yok)
- [ ] Bot login/reset/davet yolları kapalı (Task 9)
- [ ] Scope: key.boardId ↔ hedef kaynak board'u her handler'da doğrulanır
- [ ] `card.copy`/`card.moveToList` hedef board'u da key board'una kilitli (çapraz board sızıntısı yok)
- [ ] Mutasyon uçlarında `Idempotency-Key` zorunlu (eksik → 400)
- [ ] Hata gövdeleri iç detay sızdırmaz (stack, SQL yok); 5xx Sentry'ye

## Riskler ve dikkat noktaları

- **Caller-context uyumu:** `createContext`'e enjekte edilen best-effort bağımlılıklar (`enqueueRealtimePublish`, `objectStorage` vb.) REST yolunda da verilmeli; verilmezse worker sweeper'ları toplar ama gecikme olur. Task 3'te `buildTrpcContext` ile aynı bağımlılık setini paylaşan ortak bir builder çıkarılmalı.
- **`activity` payload'ları:** bot aktörü normal `actor_id` kullanır; web/mobil aktivite render'ı kullanıcı adını gösterir — bot adı da user.name'den gelir, kırılma yok. Yine de mobilde bot rozeti v1'de yok (yalnız isim görünür) — bilinçli.
- **Rich text tutarlılığı:** düz string kabul edip Tiptap'a çevirirken mevcut plaintext helper üçlüsüyle (web `richTextToPlainText`, api `richTextPreview`, mobil `tiptapToPlainText`) simetri korunmalı; yeni format icat edilmez.
- **Rate limit deposu:** Redis düşerse fail-open mi fail-closed mu? Karar: **fail-open + Sentry uyarısı** (bot entegrasyonunu Redis bakımı kırmasın; kötüye kullanım riski key sahibinin kendi panosuyla sınırlı).
- **`checklist.item.reorder` / `bulkImport`** gibi görece yeni uçların input şemaları değişken olabilir — adapter yazarken şemayı koddan oku, plandaki tabloyu birebir kopyalama.
- **Workspace üyeliği ön koşulu:** `resolveBoardAccess` board üyeliğinden **önce** `workspace_members` kontrolü yapar; bot'un `guest` workspace üyeliği unutulursa tüm REST yüzeyi FORBIDDEN döner. Task 3 fixture'ları ve Task 7 create/revoke bu satırı kapsamalı. Ayrıca `card.members.add` benzeri procedure'ler hedef kullanıcının workspace üyeliğini ayrıca şart koşar (invariant 12) — bot'a görev atama senaryosu bu sayede çalışır.

## Açık sorular (kullanıcı onayı gereken)

1. **Expiry zorunlu mu?** Plan: opsiyonel (null = süresiz). Güvenlik tarafında zorunlu 90 gün istenirse Task 1/7'de default eklenir.
2. **Bot yorumlarının görünümü:** yalnız "Bot" rozeti yeterli mi, yoksa ayırt edici avatar/renk de istenir mi? (Task 8 kapsamını etkiler.)
3. **Webhook fazı** ne zaman: bot'un olay dinlemesi istenirse outbox'a `webhook` kanalı ayrı plan olarak açılır.
4. **Rate limit varsayılanı** 120 istek/dk uygun mu? (AI ajanları burst yapabilir; key başına override kolonu ileride eklenebilir.)

