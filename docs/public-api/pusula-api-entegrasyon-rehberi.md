# Pusula Public API — Entegrasyon Rehberi

Bu belge, bir Pusula panosuna **API key** ile bağlanıp panodaki işleri (liste, kart, checklist, yorum, etiket, dosya eki) programatik olarak yönetmek isteyen dış uygulamalar/botlar içindir. Tek dosyada, bağımsızdır — başka bir projeye olduğu gibi verilebilir.

> **Özet:** Panonun bir yöneticisi sana `psk_...` ile başlayan bir API key verir. Her isteğe bu key'i `Authorization: Bearer` başlığında koyarsın; değiştiren her isteğe bir de `Idempotency-Key` eklersin. Gerisi düz REST + JSON.

---

## 1. Temel bilgiler

| | |
| --- | --- |
| Protokol | HTTPS REST, JSON gövde |
| Base URL | `https://<pusula-api-host>/api/v1` (yerel geliştirme: `http://localhost:3001/api/v1`) |
| Kimlik | `Authorization: Bearer psk_...` (her istekte) |
| Kapsam | Bir key **tek panoya** kilitlidir. Panoyu `GET /me` ile öğrenirsin. |
| Makine-okur şema | `GET /api/v1/openapi.json` (kimlik gerektirmez) — güncel OpenAPI 3.1 |

Key iki rolden birine sahiptir:

- **member** — okur **ve** yazar (bu rehberdeki tüm işlemler).
- **viewer** — yalnızca okur; tüm `POST/PATCH/DELETE` istekleri `403` döner.

---

## 2. Kimlik doğrulama

Her isteğe key'i ekle:

```
Authorization: Bearer psk_88j74XC_...
```

Key geçersiz, iptal edilmiş veya süresi dolmuşsa `401` alırsın. Key'i **gizli tut** — panodaki içeriğe yazma erişimi verir. Log'a, hata izlerine veya istemci tarafı koda koyma.

İlk çağrın her zaman `GET /me` olsun; hangi panoya, hangi rolle bağlı olduğunu döndürür:

```bash
curl https://<host>/api/v1/me -H "Authorization: Bearer psk_..."
```

```json
{
  "bot": { "id": "cda2...", "name": "local-pusula-bot" },
  "boardId": "gR1o4SqiNrSQMEsnBMvQ2",
  "role": "member",
  "expiresAt": null,
  "createdAt": "2026-07-13T16:13:56.538Z"
}
```

---

## 3. Değiştiren isteklerde `Idempotency-Key` zorunludur

Her `POST`, `PATCH`, `DELETE` isteğine bir **UUID** `Idempotency-Key` başlığı ekle:

```
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

Neden: ağ hatasında isteği tekrarlarsan (retry) sunucu **aynı** işlemi ikinci kez yapmaz. Aynı key + aynı gövdeyle tekrar gönderirsen ilk yanıtın kopyası döner (`Idempotency-Replayed: true` başlığıyla) — yani "kart oluştur" iki kez çalışsa bile tek kart oluşur. Aynı key'i **farklı** bir gövdeyle kullanırsan `409` alırsın. Kayıtlar 24 saat tutulur.

Eksik veya UUID olmayan `Idempotency-Key` → `400`.

`GET` isteklerinde bu başlık **gerekmez**.

---

## 4. Endpoint referansı

Tüm yollar `/api/v1` önekiyledir. `*` = zorunlu alan. Yol parametreleri `{...}` ile gösterilir. "member+" satırlar viewer key ile `403` döner.

### Kimlik & pano

| Yöntem + Yol | Ne yapar | Gövde alanları |
| --- | --- | --- |
| `GET /me` | Key + bot meta (ad, boardId, rol, expiry) | — |
| `GET /board` | Pano kabuğu + listeleri + aktif kartları | — |
| `GET /board/activity` | Pano aktivite akışı (cursor sayfalı) | — |
| `GET /board/members` | Pano üyeleri | — |

### Listeler

| Yöntem + Yol | Ne yapar | Gövde alanları |
| --- | --- | --- |
| `POST /lists` | Liste oluştur | `title*`, `beforeListId`, `afterListId` |
| `PATCH /lists/{listId}` | Liste başlığı/renk/ikon güncelle | `title`, `color`, `icon`, `iconColor` |
| `POST /lists/{listId}/move` | Listeyi yeniden sırala | `beforeListId`, `afterListId`, `newPosition` |
| `POST /lists/{listId}/archive` | Arşivle / geri al | `archived` (`false` = geri al) |

### Kartlar

| Yöntem + Yol | Ne yapar | Gövde alanları |
| --- | --- | --- |
| `POST /cards` | Kart oluştur | `listId*`, `title*`, `beforeCardId`, `afterCardId` |
| `GET /cards/archived` | Arşivli kartlar | — |
| `GET /cards/{cardId}` | Tek kart + ilişkiler | — |
| `PATCH /cards/{cardId}` | Başlık/açıklama/bitiş/kapak güncelle | `title`, `description`, `dueAt`, `coverColor`, `coverImageAttachmentId` |
| `POST /cards/{cardId}/move` | Aynı pano içinde taşı/sırala | `fromListId*`, `toListId*`, `beforeCardId`, `afterCardId`, `newPosition` |
| `POST /cards/{cardId}/move-to-list` | Panonun başka listesine taşı | `toListId*`, `beforeCardId`, `afterCardId`, `newPosition` |
| `POST /cards/{cardId}/copy` | Kartı kopyala | `toListId*`, `title`, `beforeCardId`, `afterCardId`, `includeChecklists`, `includeMembers`, `includeLabels` |
| `POST /cards/{cardId}/archive` | Arşivle / geri al | `archived` (`false` = geri al) |
| `POST /cards/{cardId}/complete` | Tamamlandı işaretle | — |
| `POST /cards/{cardId}/uncomplete` | Tamamlanmayı geri al | — |
| `GET /cards/{cardId}/activity` | Kartın aktivitesi | — |

### Kart üyeleri & etiketleri

| Yöntem + Yol | Ne yapar | Gövde alanları |
| --- | --- | --- |
| `GET /cards/{cardId}/members` | Kart üyeleri | — |
| `POST /cards/{cardId}/members` | Karta üye ekle | `userId*`, `role*` (`assignee`/`watcher`) |
| `DELETE /cards/{cardId}/members/{userId}` | Üyeliği kaldır | `role*` (gövdede!) |
| `POST /cards/{cardId}/labels` | Karta etiket tak | `labelId*` |
| `DELETE /cards/{cardId}/labels/{labelId}` | Etiketi çıkar | — |

### Etiketler

| Yöntem + Yol | Ne yapar | Gövde alanları |
| --- | --- | --- |
| `GET /labels` | Pano etiketleri | — |
| `POST /labels` | Etiket oluştur | `color*`, `name` |
| `PATCH /labels/{labelId}` | Renk/ad güncelle | `color`, `name` |
| `DELETE /labels/{labelId}` | Etiket sil | — |

### Checklist & maddeler

| Yöntem + Yol | Ne yapar | Gövde alanları |
| --- | --- | --- |
| `GET /cards/{cardId}/checklists` | Kartın checklist'leri | — |
| `POST /cards/{cardId}/checklists` | Checklist ekle | `title*` |
| `POST /cards/{cardId}/checklists/bulk-import` | Toplu içe aktar | `checklists*` (dizi) |
| `PATCH /cards/{cardId}/checklists/{checklistId}` | Başlık değiştir | `title*` |
| `POST /cards/{cardId}/checklists/{checklistId}/archive` | Arşivle / geri al | `archived*` |
| `DELETE /cards/{cardId}/checklists/{checklistId}` | Sil (maddeler dahil) | — |
| `POST /cards/{cardId}/checklists/{checklistId}/items` | Madde ekle | `content*`, `parentItemId` |
| `PATCH .../items/{itemId}` | Madde içeriği düzenle | `content*` |
| `POST .../items/{itemId}/toggle` | İşaretle / kaldır | `completed*` |
| `POST .../items/{itemId}/reorder` | Maddeyi sırala | `beforeItemId`, `afterItemId` |
| `DELETE .../items/{itemId}` | Maddeyi sil | — |

### Yorumlar

| Yöntem + Yol | Ne yapar | Gövde alanları |
| --- | --- | --- |
| `GET /cards/{cardId}/comments` | Yorum thread'i | — |
| `POST /cards/{cardId}/comments` | Yorum ekle | `body*`, `checklistItemId` |
| `PATCH /cards/{cardId}/comments/{commentId}` | Kendi yorumunu düzenle | `body*` |
| `DELETE /cards/{cardId}/comments/{commentId}` | Kendi yorumunu sil | — |

Not: yalnızca **kendi** oluşturduğun yorumu düzenler/silersin; başkasınınki `403`.

### Dosya ekleri (iki adımlı)

| Yöntem + Yol | Ne yapar | Gövde alanları |
| --- | --- | --- |
| `POST /cards/{cardId}/attachments/initiate` | 1. adım: taslak + presigned PUT URL | `fileName*`, `mimeType*`, `size*`, `description` |
| `POST /cards/{cardId}/attachments/commit` | 2. adım: yüklemeyi kalıcılaştır | `attachmentId*` (gövdede) |
| `GET /cards/{cardId}/attachments` | Ekleri listele | — |
| `PATCH .../attachments/{attachmentId}` | Açıklama düzenle | `description` |
| `DELETE .../attachments/{attachmentId}` | Eki sil | — |
| `GET .../attachments/{attachmentId}/download-url` | Presigned indirme URL'i | — |

---

## 5. İçerik formatı kuralları

Bunlar en sık `400` sebebidir — dikkat et:

- **Zengin metin (kart açıklaması, yorum, checklist maddesi):** düz metin gönderebilirsin; sunucu bunu editör formatına (Tiptap JSON) çevirir. Satır sonu (`\n`) ayrı paragraf olur. Yanıtta okunabilir bir `previewText` döner.
- **Etiket rengi** sabit bir listeden olmalı (hex kod **değil**): `green`, `yellow`, `orange`, `red`, `purple`, `blue`, `sky`, `lime`, `pink`, `black`.
- **Dosya eki türü** izin listesindedir: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`, Word (`.docx`), Excel (`.xlsx`) vb. Düz metin (`text/plain`) kabul edilmez.
- **Arşiv/geri al tek uçtur:** `POST .../archive` gövdesine `{ "archived": false }` verirsen geri alır.
- **Kart taşıma** (`move`) aynı liste içinde sıralama için bile hem `fromListId` hem `toListId` ister (ikisi aynı olabilir).
- **Konumlandırma:** `beforeCardId`/`afterCardId` (veya liste/madde eşdeğerleri) vererek nereye ekleneceğini söylersin; hiçbirini vermezsen sona eklenir. `newPosition`'ı elle hesaplamana gerek yok.

---

## 6. Hatalar

Tüm hatalar şu gövdeyle döner:

```json
{ "error": { "code": "BAD_REQUEST", "message": "...", "issues": [ ... ] } }
```

| Kod | HTTP | Anlamı |
| --- | --- | --- |
| `UNAUTHORIZED` | 401 | Key yok/geçersiz/iptal/süresi dolmuş |
| `FORBIDDEN` | 403 | Yetki yetersiz (viewer yazmaya çalıştı, başka board, başkasının yorumu…) |
| `NOT_FOUND` | 404 | Kaynak yok ya da bu panoya ait değil |
| `BAD_REQUEST` | 400 | Geçersiz gövde — izin verilen değerler `issues` alanında listelenir |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Aynı Idempotency-Key, farklı gövde |
| `TOO_MANY_REQUESTS` | 429 | Hız sınırı — `Retry-After` başlığı kadar bekle |

**İpucu:** `400` aldığında `error.issues` alanı genellikle geçerli seçenekleri (ör. izin verilen renkler/mime türleri) söyler — bunu okuyup düzelt.

## 7. Hız sınırı

Key başına ~**120 istek/dakika**. Aşarsan `429` + `Retry-After` (saniye) alırsın; o kadar bekleyip tekrar dene. Toplu iş yaparken istekleri seri (peş peşe) gönder, paralel patlatma.

---

## 8. Uçtan uca örnek

Aşağıdaki akış: panoyu oku → liste aç → kart oluştur → açıklama + checklist + yorum ekle. Node.js (harici bağımlılık yok):

```js
const BASE = "https://<host>/api/v1";
const KEY = process.env.PUSULA_KEY;

async function api(method, path, body) {
  const headers = { Authorization: `Bearer ${KEY}` };
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers["Idempotency-Key"] = crypto.randomUUID();
  }
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

const me = await api("GET", "/me");
const list = await api("POST", "/lists", { title: "Gelen Kutusu" });
const card = await api("POST", "/cards", { listId: list.list.id, title: "İlk görev" });

await api("PATCH", `/cards/${card.card.id}`, {
  description: "Bu görev otomasyonla oluşturuldu.\nİkinci satır ayrı paragraf olur.",
});

const cl = await api("POST", `/cards/${card.card.id}/checklists`, { title: "Adımlar" });
await api("POST", `/cards/${card.card.id}/checklists/${cl.checklist.id}/items`, {
  content: "İlk adımı tamamla",
});
await api("POST", `/cards/${card.card.id}/comments`, { body: "Hazır 👍" });
```

Aynı akış curl ile bir kart oluşturma:

```bash
curl -X POST https://<host>/api/v1/cards \
  -H "Authorization: Bearer psk_..." \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{ "listId": "soEv...", "title": "İlk görev" }'
```

Dosya eki (iki adım):

```js
// 1) Taslak + presigned URL al
const init = await api("POST", `/cards/${cardId}/attachments/initiate`, {
  fileName: "rapor.pdf", mimeType: "application/pdf", size: bytes.length,
});
// 2) Dosyayı doğrudan depolamaya PUT et (init.upload.headers'ı aynen kullan)
await fetch(init.upload.url, { method: "PUT", headers: init.upload.headers, body: bytes });
// 3) Kalıcılaştır
await api("POST", `/cards/${cardId}/attachments/commit`, { attachmentId: init.attachmentId });
```

---

## 9. Bir AI ajanına bağlarken

Ajanın sistem talimatına şu özeti koyabilirsin:

```
Bir Pusula panosunu REST API ile yönetiyorsun. Base URL: https://<host>/api/v1
Her isteğe "Authorization: Bearer <KEY>" ekle. Her POST/PATCH/DELETE isteğine
ayrıca yeni bir UUID "Idempotency-Key" ekle. Panonu GET /me ile öğren. Tüm
uç noktaları ve gövde alanlarını GET /api/v1/openapi.json ile keşfedebilirsin.
Zengin metin alanlarına (açıklama, yorum, checklist) düz metin gönder — sunucu
biçimlendirir. Etiket rengi sabit listeden olmalı (green/red/purple/blue...).
Bir işlem 400 dönerse yanıttaki error.issues alanı geçerli değerleri söyler;
onu okuyup düzelt. Kart "silmek" için archive kullan (kalıcı silme yoktur).
```

Ajan tüm yüzeyi kendisi keşfedebildiği için (`openapi.json`) yeni uç noktalar eklendiğinde talimatı güncellemene gerek kalmaz.

---

## 10. Key'in yapamadıkları (tasarım sınırları)

Bir member key aşağıdakileri **yapamaz** — bunlar pano yöneticisinde (insan) kalır:

- Pano ayarlarını değiştirme, panoyu silme/arşivleme.
- Üye ekleme/çıkarma, rol değiştirme, davet gönderme.
- **Kalıcı silme:** liste ve kartlar yalnızca **arşivlenebilir** (geri alınabilir), kalıcı silinemez. Checklist, madde, yorum, etiket ve dosya ekleri silinebilir.
- Başka bir panoya erişme: key tek panoya kilitlidir. Kartı başka panoya taşıma/kopyalama `403` döner. Başka pano için ayrı key gerekir.
- Kendini bir karta üye ekleme (`403`).

Ayrıca: bota kendi işlemlerinden bildirim gitmez; bot arayüzden oturum açamaz. Key iptal edilirse (revoke) erişim **anında** kesilir.
