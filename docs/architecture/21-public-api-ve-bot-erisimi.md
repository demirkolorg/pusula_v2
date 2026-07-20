---
title: '21 — Public API & Bot Erişimi Mimarisi'
description: 'API key ile kimliklenen bot aktörü için /api/v1 REST yüzeyi, tRPC server-side caller köprüsü, api_keys veri modeli, token güvenliği, rate limit, idempotency ve OpenAPI yaklaşımı.'
aliases:
  - 'Public API Mimarisi'
  - 'Bot Erişimi Mimarisi'
  - 'API Key Architecture'
tags:
  - 'pusula'
  - 'architecture/public-api'
  - 'security'
type: 'architecture'
axis: 'architecture'
status: 'active'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
updated: 2026-07-13
---

# 21 — Public API & Bot Erişimi Mimarisi

> Eksen: **tasarım / teknik** — token üretimi, tablo şeması, `/api/v1` REST yüzeyi, apiKeyAuth middleware, tRPC caller köprüsü, rate limit, hata formatı. İş kuralları (kim key üretebilir, botun rol matrisi, revoke/expiry semantiği, bota bildirim gitmez) → [`../domain/10-bot-ve-api-key-kurallari.md`](../domain/10-bot-ve-api-key-kurallari.md).

## Amaç

Bir panonun sahibi, o panonun içerik işlemlerini (liste/kart CRUD + taşıma, checklist + madde, yorum, etiket, ek, aktivite okuma) programatik olarak bir **AI ajanına / servis hesabına** açmak ister. Pusula bunu, panoya "üye" olan bir **bot aktörü** ile çözer: bot bir API key ile kimliklenir, yaptığı her mutasyon normal kullanıcı mutasyonlarıyla **aynı** activity + notification outbox + realtime zincirinden geçer. Yeni bir yetki modeli veya kart-bazlı ACL açılmaz — bot yalnızca panoya eklenmiş bir kullanıcıdır.

## Yerleştirme

Public API iki katmanda yaşar; [`14-paylasim-linki-mimarisi.md`](14-paylasim-linki-mimarisi.md) paylaşım linki emsalinin birebir izdüşümüdür.

```txt
yönetim (board admin)
  → tRPC: board.apiKeys.create / revoke / list  (boardProcedure üstünde)

bot (makine)
  → Hono public endpoint: /api/v1/*  (Authorization: Bearer psk_…)
  (tRPC dışı; ana API sözleşmesi tRPC'de kalır — bu uçlar "HTTP kabuğu" işidir)
```

Bu ayrım [`03-backend.md`](03-backend.md) "Hono = HTTP kabuğu, tRPC = ana sözleşme" prensibiyle uyumludur. `/api/v1` webhook benzeri bir public yüzeydir; tRPC contract'ı bu yola çekilmez, paralel bir ana API oluşmaz.

## Mimari karar özeti

| Karar noktası | Karar | Gerekçe |
| --- | --- | --- |
| API yüzeyi | `/api/v1/*` altında **ham Hono REST route'ları** (`apps/api`) | Paylaşım linki emsali; ana sözleşme tRPC kalır, paralel ana API oluşmaz. |
| İş mantığı | REST handler'ları **tRPC server-side caller** ile mevcut procedure'leri çağırır | Tek source of truth. Permission, invariant, activity+outbox+realtime üçlüsü ve idempotency mevcut procedure gövdelerinden bedavaya gelir; caller düz JS objesi döndürdüğü için superjson wire-format sorunu da yoktur. |
| Bot kimliği | `users.is_bot` kolonu; her API key **1:1 bir bot kullanıcısına** bağlı; bot hedef panoya `board_members` **ve** panonun workspace'ine `guest` rollü `workspace_members` satırıyla üye | `activity_events.actor_id` FK'sı `users`'a bakar — bot aktörü FK bütünlüğünü bozmadan aktivite/yorum sahibi olur. Board erişim çözümü **önce workspace üyeliğini** kontrol eder; `guest` satırı kapıyı geçirir ama effective board rolü açık board rolünü öncelediği için diğer panolara örtük erişim vermez. |
| API key saklama | Yeni `api_keys` tablosu: `token_hash` (SHA-256) + `token_prefix`; plain key **bir kez** gösterilir | `share_links` token deseniyle birebir aynı disiplin. |
| Bot rolü | Key oluştururken seçilir: **`member`** (varsayılan) veya **`viewer`**; `admin` v1'de **yok** | Kullanıcının istediği tüm içerik işlemleri `member` ile karşılanır; pano yönetimi insan sorumluluğunda kalır, saldırı yüzeyi küçülür. |
| Scope kontrolü | Üç katman: (1) bot yalnız hedef panonun üyesi, (2) REST adapter her istekte `key.boardId === çözülen boardId` doğrular, (3) çapraz board hedefleyen `card.copy`/`card.moveToList`te hedef listenin board'u da key board'una kilitli | Savunma derinliği: key tek panoya kilitli; copy/move uçları başka panoya içerik sızdıramaz. |
| Idempotency | `Idempotency-Key` header'ı (UUID) → `clientMutationId`; **tüm mutasyon uçlarında zorunlu** | AI ajanları ağ hatasında agresif retry yapar; zorunluluk kopya kayıt riskini kapatır. |
| Rate limit | Redis-backed, key başına (varsayılan 120 istek/dk); 429 + `Retry-After` | Mevcut in-memory limiter yalnız `/share` içindir; `ioredis` zaten bağımlılıkta. |
| API dokümantasyonu | Elle bakımlı OpenAPI 3.1 JSON, `GET /api/v1/openapi.json` | Tüketici bir AI botu — makine-okur spec yüksek değerli; yeni bağımlılık gerektirmez. Route sayısı büyürse `@hono/zod-openapi` alternatifi karar kaydında not edildi. |
| Yeni bağımlılık | **Yok** | Token `node:crypto`, rate limit `ioredis`, spec elle. |

## İstek akışı

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

Kritik nokta: REST katmanı yalnız bir **adapter**tir — path/body'yi mevcut tRPC input şemasına map'ler, key scope'unu doğrular, caller'ı çağırır, çıktıyı serialize eder. İş mantığı yazmaz; permission, invariant, activity/outbox/realtime disiplini procedure gövdesinden gelir.

## Veri modeli

Şema → [`04-veri-katmani.md`](04-veri-katmani.md). Drizzle instance `casing: 'snake_case'` (TS'te camelCase kolon anahtarı).

### `users` değişikliği

```txt
is_bot boolean NOT NULL DEFAULT false
```

Bot kullanıcı: `name` = key oluştururken verilen bot adı, `email` = `bot+{apiKeyId}@bots.pusula.internal` (sentetik, unique), `emailVerified` = false, `accounts` satırı **yok** (şifresiz — login imkânsız). Login/reset/davet yollarına ek savunma katmanı [`07-auth.md`](07-auth.md) (Makine kimliği) ve [`../domain/10-bot-ve-api-key-kurallari.md`](../domain/10-bot-ve-api-key-kurallari.md) altında.

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

Yaşam döngüsü:

- **create** — board admin; tek transaction'da bot user + `workspace_members` (`role: 'guest'`) + `board_members` + `api_keys` satırları oluşur; plain key **bir kez** döner.
- **revoke** — `revoked_at` set edilir + botun `board_members` **ve** `workspace_members` satırları silinir (key↔bot 1:1 olduğundan botun başka üyeliği yoktur, koşulsuz silinebilir); bot user satırı aktivite geçmişi atıfları için **kalır**.
- **expiry** — auth middleware reddeder (her istekte DB kontrolü; cache yok); kullanıcı UI'dan yeni key üretir.

> **Bot rozeti (bilinen sınırlama):** Web'de "Bot" rozeti, üye/aktivite render'ında `user.isBot` üyelik-türevli bilgisinden gelir. Key **revoke** edilince botun `board_members` satırı silindiği için, botun **geçmiş yorumları** artık üyelik listesinde bulunmayan bir kullanıcıya işaret eder ve bu üyelik-türevli rozeti kaybedebilir (yorum metni ve aktör adı korunur; yalnızca rozet düşer). v1'de kabul edilen bir sınırlamadır.

## Token güvenliği

`share_links` token disiplinini birebir izler:

- **Üretim:** `crypto.randomBytes(32)` → base64url (43 karakter), `psk_` önekiyle. Görünen değer budur.
- **Saklama:** DB'de yalnız `token_hash` (SHA-256) tutulur; plain token tekrar elde edilemez.
- **Lookup:** gelen token'ın prefix'iyle (`psk_` + ilk 8 char) index'li satır bulunur; **karar hash eşitliğiyle** verilir — `crypto.timingSafeEqual` ile sabit-zamanlı karşılaştırma (worker'ın `x-worker-secret` deseni).
- **Bir kez gösterim:** plain key yalnız `board.apiKeys.create` yanıtında döner; `list`/`get` çağrılarında yalnız `token_prefix` gösterilir. UI bunu kullanıcıya net belirtir ("Anahtarı şimdi kopyalayın, bir daha gösterilmeyecek").
- **Loglama:** log/audit satırlarında yalnız `token_prefix` görünür; plain token asla loglanmaz.

## Rate limit

İki katman:

- **Kimlik-öncesi IP rate limit (240 istek/dk):** `apiKeyAuth`'tan **önce** çalışır; IP başına sayaç. Geçersiz/eksik key ile prefix-tarama ve brute-force denemelerini apiKeyAuth'a ulaşmadan sınırlar (kimliksiz istek de bütçeye tabidir).
- **Key başına rate limit (120 istek/dk):** Redis-backed, **key başına** sayaç (`ratelimit:apikey:<id>`, pencere 60 sn, varsayılan 120 istek/dk); kimlik doğrulandıktan sonra uygulanır.

Ortak davranış:

- Aşımda `429 Too Many Requests` + `Retry-After` header'ı.
- **Fail-open + Sentry uyarısı:** Redis erişilemezse istek geçirilir (bot entegrasyonunu Redis bakımı kırmasın; kötüye kullanım riski key sahibinin kendi panosuyla sınırlıdır).
- Ek koruma: `/api/v1` isteklerinde 1MB body limit + `Cache-Control: no-store`.

## Idempotency-Key zorunluluğu

- Tüm `POST`/`PATCH`/`DELETE` uçları `Idempotency-Key` header'ı (UUID) **ister**; eksik veya geçersizse `400`.
- Adapter bu değeri mevcut `clientMutationId` sözleşmesine (`clientMutationIdSchema`, UUID) map'ler — realtime echo-filtreleme ve duplicate-mutation koruması aynen kullanılır.

### Dedup semantiği (Redis, best-effort replay)

- **24 saat best-effort replay:** Aynı `Idempotency-Key` ile gelen bir mutasyon, ilk isteğin sonucu Redis'te tutulduğu sürece (varsayılan 24 saat pencere) **yeniden çalıştırılmaz** — kaydedilen yanıt aynen döner. Ağ hatasında agresif retry yapan AI ajanları böylece kopya kayıt üretmez.
- **Aynı key + farklı gövde → `409 Conflict`:** Bir `Idempotency-Key` bir kez bir istek gövdesine bağlandıktan sonra, aynı anahtarla **farklı** bir gövde gönderilirse `409` döner (anahtarın yanlış/çakışan kullanımı). Aynı anahtar = aynı mantıksal işlem sözleşmesi.
- **Redis kesintisinde fail-open:** Dedup deposu (Redis) erişilemezse dedup **garantisi düşer** ve istek geçirilir (fail-open) — entegrasyonu bakım kesintisi kırmaz. Bu pencerede tekrar edilen istek çift kayıt üretebilir; procedure gövdesindeki `clientMutationId` disiplini yine de birçok durumda ikinci yazımı emer.
- Best-effort replay katmanı `clientMutationId` tabanlı procedure-içi korumanın **üstüne** eklenir; ikisi birlikte çalışır.

## Hata formatı

TRPCError kodu HTTP status'a map'lenir; gövde makine-okur ve iç detay sızdırmaz:

```txt
UNAUTHORIZED       → 401   (eksik/geçersiz/revoked/expired key)
FORBIDDEN          → 403   (yanlış board scope, yetersiz rol)
NOT_FOUND          → 404   (kaynak yok / erişilemez)
BAD_REQUEST / Zod  → 400   (+ issues: alan detayı)
TOO_MANY_REQUESTS  → 429   (+ Retry-After)
diğer              → 500   (+ Sentry; stack/SQL gövdeye yazılmaz)
```

Gövde şekli:

```txt
{ "error": { "code": "FORBIDDEN", "message": "…", "issues": [ … ]? } }
```

5xx yanıtları Sentry'ye düşer; hata gövdeleri stack trace, SQL veya iç detay taşımaz.

## OpenAPI yaklaşımı

- Elle bakımlı **OpenAPI 3.1 JSON** objesi; `GET /api/v1/openapi.json` üzerinden **auth'suz** servis edilir.
- Tüketici bir AI botu olduğu için makine-okur spec yüksek değerlidir; yeni bağımlılık gerektirmez.
- Spec ↔ route drift'ini yakalamak için bir test route listesini spec path'leriyle karşılaştırır.
- **Alternatif (not):** route sayısı büyürse `@hono/zod-openapi` ile spec'i şemalardan türetmeye geçilebilir (karar kaydında not edildi — [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md)).

## Endpoint haritası

Tüm uçlar `/api/v1` öneklidir; her handler mevcut bir tRPC procedure'e köprüdür. `cardProcedure` tabanlı kaynaklar kart altına iç içe geçer (input şemaları `cardId` ister).

| Yöntem + Path | tRPC procedure | Min rol |
| --- | --- | --- |
| `GET /me` | — (key/bot meta: ad, boardId, rol, expiry) | viewer |
| `GET /board` | `board.get` | viewer |
| `GET /board/activity` | `board.activity.list` | viewer |
| `GET /board/members` | `board.members.list` | viewer |
| `POST /lists` · `PATCH /lists/:listId` | `list.create` / `list.update` | member |
| `POST /lists/:listId/move` | `list.move` | member |
| `POST /lists/:listId/archive` | `list.archive` (restore dahil) | member |
| `POST /cards` · `PATCH /cards/:cardId` | `card.create` / `card.update` | member |
| `GET /cards/archived` · `GET /cards/:cardId` | `card.listArchived` / `card.get` | viewer |
| `POST /cards/:cardId/move` · `/move-to-list` · `/copy` | `card.move` / `card.moveToList` / `card.copy` | member |
| `POST /cards/:cardId/archive` | `card.archive` (restore dahil) | member |
| `POST /cards/:cardId/complete` · `/uncomplete` | `card.complete` / `card.uncomplete` | member |
| `GET /cards/:cardId/activity` · `/members` | `card.activity.list` / `card.members.list` | viewer |
| `POST /cards/:cardId/members` · `DELETE …/:userId` | `card.members.add` / `card.members.remove` | member |
| `POST /cards/:cardId/labels` · `DELETE …/:labelId` | `card.labels.add` / `card.labels.remove` | member |
| `GET /labels` | `label.list` | viewer |
| `POST /labels` · `PATCH /labels/:labelId` · `DELETE …` | `label.create` / `update` / `delete` | member |
| `GET /cards/:cardId/checklists` | `checklist.list` | viewer |
| `POST /cards/:cardId/checklists` · `/bulk-import` | `checklist.create` / `checklist.bulkImport` | member |
| `PATCH …/:checklistId` · `POST …/archive` · `DELETE …` | `checklist.update` / `archive` / `delete` | member |
| `POST …/checklists/:checklistId/items` | `checklist.item.create` | member |
| `PATCH …/items/:itemId` · `/toggle` · `/reorder` · `DELETE …` | `checklist.item.*` | member |
| `GET /cards/:cardId/comments` | `comment.list` | viewer |
| `POST /cards/:cardId/comments` | `comment.create` | member |
| `PATCH …/:commentId` · `DELETE …` | `comment.update` / `delete` (yalnız kendi yorumu) | member |
| `POST /cards/:cardId/attachments/initiate` · `/commit` | `attachment.initiate` / `commit` | member |
| `GET /cards/:cardId/attachments` · `PATCH …` · `DELETE …` | `attachment.list` / `update` / `delete` | member¹ |
| `GET …/attachments/:attachmentId/download-url` | `attachment.getDownloadUrl` | viewer |
| `GET /openapi.json` | — (statik spec) | auth'suz |

> ¹ `attachment.list`/`download-url` viewer'a açıktır; `initiate`/`commit`/`update`/`delete` member ister.

Notlar:

- **Rich text:** kart açıklaması / yorum / checklist içerikleri Tiptap JSON. REST girişleri hem Tiptap JSON hem düz string kabul eder; düz string adapter'da minimal Tiptap dokümanına çevrilir (`plainTextToTiptap`). Çıkışta hem ham JSON hem `previewText` (`richTextPreview`) döner. Yeni format icat edilmez — mevcut plaintext helper üçlüsüyle (web `richTextToPlainText`, api `richTextPreview`, mobil `tiptapToPlainText`) simetri korunur.
- **Rich-text girdi adaptörü idempotent olmalı** (`richTextInputToString`, 2026-07-20): GET ham saklanan string'i döndürdüğü için bot "oku → değiştir → PATCH" yaptığında değer adaptörden ikinci kez geçer. Zaten `type: 'doc'` çözülen string olduğu gibi geçirilir; aksi halde düz metin sanılıp yeni bir doc'un text düğümüne gömülür (çift sarmalama) ve web/mobil kaydı ham JSON gösterir. Tespit kuralı `parseRichTextValue` / `parseTiptapValue` ile aynıdır. (2026-07-20 prod taraması: bu yoldan bozulmuş satır yok — guard koruyucu.)
- **Pozisyon:** `move` uçları mevcut input şemalarını (`beforeCardId`/`afterCardId`/`newPosition`) aynen kullanır; `newPosition` verilmezse adapter komşu id'lerden `@pusula/domain/position.positionBetween` ile hesaplar.
- **Çapraz board kapalı:** `card.copy` ve `card.moveToList` başka board'daki listeyi hedefleyebilir; public API'de hedef listenin board'u `key.boardId` ile doğrulanır — eşleşmiyorsa 403.
- **Archive/restore:** `POST …/archive` gövdesi `{ "archived": false }` ile restore yapar (mevcut `archiveCardInput`/`archiveListInput` semantiği); OpenAPI spec'te açıkça örneklenir.
- **Kalıcı silme yok:** `list.delete` / `card.delete` / `board.update` gibi admin uçları bota açılmaz (endpoint yok → 404).
- **Kart üyesi kaldırma (rol gövdede):** `DELETE /cards/:cardId/members/:userId` rolü **path'te değil gövdede** alır (`{ "role": "assignee" }` veya `"watcher"`); `(cardId, userId, role)` üçlüsü PK olduğundan hangi rolün kaldırılacağı gövdeyle belirtilir.
- **Ek commit (attachmentId gövdede):** `POST /cards/:cardId/attachments/commit` taslak ek id'sini **gövdede** alır (`{ "attachmentId": "…" }`); path'teki `:cardId` yalnız yönlendirme içindir.
- **İndirme URL'i idempotency'siz:** `GET …/attachments/:attachmentId/download-url` bir **query**'dir (presigned GET üretir) — mutasyon değildir, `Idempotency-Key` **istemez**.

## Bot hızlı başlangıç

Bir AI ajanını / servis hesabını panonuza bağlamak için pratik rehber. Aşağıdaki `curl` örneklerinde `$PUSULA_API` panonuzun API taban adresidir (örn. `https://pusulaportal.com/api/v1`) ve `$PUSULA_KEY` üretilen `psk_…` anahtarıdır.

### 1. Key üretme

- Web'de panoyu açın → **pano ayarları → "API Anahtarları" (API) sekmesi**.
- **Yeni anahtar**: ad + rol (`member` varsayılan, `viewer` salt-okuma) + opsiyonel son kullanım tarihi.
- Oluşturulan `psk_…` anahtarı **yalnız bir kez** gösterilir — hemen kopyalayın; kaybolursa iptal edip yeniden üretin.
- Anahtar tek panoya kilitlidir; başka pano için o panoda ayrı anahtar üretin.

### 2. İlk istek — panoyu oku

```bash
curl -s "$PUSULA_API/board" \
  -H "Authorization: Bearer $PUSULA_KEY"
```

Yanıt panonun kabuğunu, listelerini ve aktif kartlarını döner. Board id gövdede gelir; ayrıca `GET /me` botun kimliğini, rolünü ve `boardId`'sini verir.

### 3. Kart oluştur (Idempotency-Key zorunlu)

Tüm mutasyonlar (`POST`/`PATCH`/`DELETE`) bir `Idempotency-Key` (UUID) header'ı **ister**; eksik/geçersizse `400`. Aynı anahtarla tekrarlanan istek çift kayıt üretmez — ağ hatasında güvenle retry edin.

```bash
curl -s "$PUSULA_API/cards" \
  -X POST \
  -H "Authorization: Bearer $PUSULA_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{ "listId": "<liste-id>", "title": "Bot tarafından açıldı" }'
```

### 4. Yorum ekle (düz metin yeter)

Yorum, kart açıklaması ve checklist madde içerikleri rich-text'tir; ama **düz metin gönderin, sunucu Tiptap JSON'a çevirir**. Yeni bir format icat etmeyin. (İsterseniz ham Tiptap JSON objesi de gönderebilirsiniz.)

```bash
curl -s "$PUSULA_API/cards/<kart-id>/comments" \
  -X POST \
  -H "Authorization: Bearer $PUSULA_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{ "body": "Dağıtım tamamlandı, kartı gözden geçirin." }'
```

Yanıtta hem ham `body` hem düz-metin `previewText` döner.

### 5. Arşivle ve geri al

Ayrı bir "restore" ucu yoktur; arşiv ucu gövdesi yönü belirler:

```bash
# Arşivle
curl -s "$PUSULA_API/cards/<kart-id>/archive" -X POST \
  -H "Authorization: Bearer $PUSULA_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{ "archived": true }'

# Geri al
curl -s "$PUSULA_API/cards/<kart-id>/archive" -X POST \
  -H "Authorization: Bearer $PUSULA_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{ "archived": false }'
```

Aynı `{ "archived": false }` sözleşmesi liste ve checklist arşiv uçları için de geçerlidir.

### 6. Hız sınırı ve hatalar

- Hız sınırı **key başına 120 istek/dakika**. Aşımda `429 Too Many Requests` + `Retry-After` (saniye) header'ı; bota bu süre kadar bekletip tekrar deneyin.
- Hatalar tutarlı bir zarfla döner:

```json
{ "error": { "code": "FORBIDDEN", "message": "…", "issues": [] } }
```

- Kodlar: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400; `issues` alan detayı taşır), `TOO_MANY_REQUESTS` (429). `viewer` rollü key tüm mutasyon uçlarında `403` alır.

### 7. Yüzeyi keşfet — OpenAPI

Tüm uçların makine-okur şeması **auth'suz** erişilebilir:

```bash
curl -s "$PUSULA_API/openapi.json"
```

Dönen OpenAPI 3.1 dokümanı her uç için path, method, gövde şeması, zorunlu `Idempotency-Key` header'ı ve ortak hata yanıtlarını tanımlar; bir ajan bu spec'ten kendi araç tanımlarını türetebilir.

### 8. Örnek AI ajanı system-prompt parçası

```text
Pusula panosunu bir REST API üzerinden yönetiyorsun. Taban adres: {PUSULA_API}.
Kimlik: her isteğe `Authorization: Bearer {PUSULA_KEY}` ekle.
Kurallar:
- Değişiklik yapan her istekte (POST/PATCH/DELETE) benzersiz bir
  `Idempotency-Key: <uuid>` header'ı gönder; aynı mantıksal işlemi retry
  ederken AYNI uuid'yi kullan (kopya kayıt oluşmasın).
- Metin alanlarını (yorum, kart açıklaması, checklist maddesi) DÜZ METİN olarak
  gönder; sunucu biçimlendirmeyi kendi yapar.
- Bir kartı arşivden geri almak için ayrı uç arama:
  `POST /cards/{id}/archive` gövdesine `{ "archived": false }` gönder.
- 429 alırsan `Retry-After` saniyesi kadar bekle, sonra tekrar dene.
- Hataları `error.code` alanına göre yorumla; 403 rol/scope, 400 geçersiz gövde.
- Kullanabileceğin uçların tam listesi için `GET /openapi.json` çek.
Yalnız sana verilen tek panonun içinde çalışırsın; başka pano/kaynak hedefleme.
```

## Neden Better Auth apiKey plugin değil

Better Auth'un `apiKey` plugin'i değerlendirildi ve **reddedildi**:

- Plugin key'i **gerçek bir kullanıcıya** bağlar; Pusula'nın ihtiyacı **board-scoped bir bot/servis hesabı**dır (key ↔ bot ↔ tek pano).
- Bot aktörünün `activity_events.actor_id`, `comments.author_id` gibi FK'larda kendi kimliğiyle görünmesi gerekir; ayrı bir `is_bot` kullanıcı bunu FK bütünlüğünü bozmadan sağlar (paylaşım linkindeki `NULL actor` deseninden farklı — bot **gerçek** bir user satırıdır).
- Key rolü (`member`/`viewer`) ve pano kilidi domain'e özgüdür; plugin'in kendi yetki/scope modeli bunu ifade etmez.
- Token üretimi/hash/prefix zaten `share_links` deseninde kanıtlanmış; özel `api_keys` tablosu bu disiplini yeniden kullanır ve yeni bağımlılık getirmez.

Sonuç: kimlik doğrulama (insan session) Better Auth'ta kalır; makine kimliği ayrı, ince bir `api_keys` + `is_bot` katmanıyla çözülür. Ayrım → [`07-auth.md`](07-auth.md) (Makine kimliği).

## Güvenlik kontrol listesi

- Plain key yalnız create yanıtında; DB/log/audit'te yalnız hash + prefix.
- Hash karşılaştırması `crypto.timingSafeEqual`.
- `psk_` 256-bit entropy; prefix lookup index'li ama karar hash eşitliğiyle.
- Per-key rate limit (Redis) + kimlik-öncesi IP rate limit (240 istek/dk) + 1MB body limit + `Cache-Control: no-store`.
- **CORS:** `/api/v1` için ayrı bir CORS açılmaz; app-level global `cors` yalnız `env.APP_URL` origin'ini yansıtır — **asla `Access-Control-Allow-Origin: *` değil** ve rastgele bir tarayıcı origin'ini de yansıtmaz. Key bir **bearer token** olduğundan tarayıcının credential (cookie) mekanizmasıyla otomatik taşınmaz; `/api/v1` server-to-server'dır, tarayıcı kullanımına tasarlanmamıştır.
- Board başına en fazla **20 aktif** (iptal edilmemiş) API key (üyelik tablolarının şişmesini ve saldırı yüzeyini sınırlar; iptal edilen key sınırdan düşer).
- Key rolü `admin` olamaz (şema + procedure çift kontrol).
- Revoke anında etkili (her istekte DB kontrolü; cache yok).
- Bot login/reset/davet yolları kapalı — bkz. [`07-auth.md`](07-auth.md), [`../domain/10-bot-ve-api-key-kurallari.md`](../domain/10-bot-ve-api-key-kurallari.md).
- Scope: `key.boardId` ↔ hedef kaynağın board'u her handler'da doğrulanır; `card.copy`/`card.moveToList` hedef board'u da key board'una kilitli.
- Mutasyon uçlarında `Idempotency-Key` zorunlu (eksik → 400).
- Bot üyeliği yalnız API key yönetiminden (`board.apiKeys.*`) yönetilir: insan üye yönetimi bir botu **rol değiştiremez / kaldıramaz** (`board.members.updateRole`/`remove` ve `workspace.members.updateRole`/`remove` bir bot hedefinde `FORBIDDEN`) ve bot **workspace üye listesinde görünmez**. Ayrıntı → [`../domain/10-bot-ve-api-key-kurallari.md`](../domain/10-bot-ve-api-key-kurallari.md).
- Hata gövdeleri iç detay sızdırmaz (stack, SQL yok); 5xx Sentry'ye.

## Kapsam dışı (V1)

- **Webhook / event push:** botun panodaki değişikliklerden haberdar olması (outbox'a `webhook` kanalı) — ayrı faz; bot v1'de polling (`GET /board`, `GET /board/activity`) yapar.
- **`admin` scope'lu key:** pano ayarı/üye yönetimi/kalıcı silme bota açılmaz.
- **Workspace-scoped key:** key tek panoya kilitli; çoklu pano isteyen kullanıcı pano başına key üretir.
- **Mobil key yönetim UI'ı:** yönetim yalnız web'de.
- **Mobilde bot rozeti:** bot adı görünür ama v1'de ayrı rozet yok (web'de var).
