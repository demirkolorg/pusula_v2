---
title: '19 — Planlayıcı + Google Takvim entegrasyonu'
description: 'Sol panelde 3. global panel (Trello "Planlayıcı" pattern''ı) + Google Takvim read-only entegrasyonu (Faz 16): Better Auth genericOAuth, primary calendar, polling sync, Pusula-içi read-only event modal.'
aliases:
  - 'Planlayıcı'
  - 'Google Takvim Entegrasyonu'
  - 'Faz 16 Mimari'
tags:
  - 'pusula'
  - 'architecture/calendar'
  - 'integrations'
  - 'oauth'
  - 'planner'
type: 'architecture'
axis: 'architecture'
status: 'planned'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
related:
  - '[[docs/architecture/02-teknoloji-kararlari|02 — Teknoloji Kararları]]'
  - '[[docs/architecture/03-backend|03 — Backend]]'
  - '[[docs/architecture/07-auth|07 — Auth]]'
  - '[[docs/architecture/08-web-ve-mobil|08 — Web ve Mobil]]'
  - '[[docs/architecture/13-ui-tasarim-dili|13 — UI Tasarım Dili]]'
  - '[[docs/process/02-mvp-faz-plani|02 — MVP Faz Planı]]'
updated: 2026-05-31
implementation: 'Faz 16 (DEM-308 epic) — 16.0/16A/16B/16C/16D alt işleri; ~4-6 iş günü; web-only V1; Faz 12 (DEM-159) iptal edildi'
---

# 19 — Planlayıcı + Google Takvim entegrasyonu

> Eksen: **tasarım / teknik**. `apps/web` sol panel altyapısının 3. global paneli (Gezgin + Hızlı Notlar yanına "Planlayıcı") ve onun veri kaynağı olan Google Takvim **read-only** entegrasyonunun mimari kararlarını sabitler. Faz 16 ile gelir. **Faz 12'nin yerini alır** — eski plan ayrı `/calendar` rotasıydı; revize edildi.

İlgili Linear: DEM-308 (epic) → DEM-309 (16.0 önce-belge) → DEM-310 (16A) · DEM-311 (16B) · DEM-312 (16C) · DEM-313 (16D). Karar kaydı: [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) "Karar kaydı" 2026-05-31 satırı.

İptal edilen önceki plan: [DEM-159](https://linear.app/demirkol/issue/DEM-159) (Cancelled, superseded). Eski plan ayrıntısı: [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md) "Faz 12 alt işleri" bölümü (tarihsel referans).

## 1. Genel bakış

Trello'nun planlayıcı bölmesini birebir uyarlar: kullanıcı sol kenardaki rail'den **Planlayıcı** toggle'ına basar, panel kayar; Google takvimindeki o günün etkinliklerini dikey saat şeridi üzerinde renkli bloklar olarak görür. Etkinlik tıklanınca Pusula içinde read-only detay modali açılır.

**Üç global panel pattern'ı (mevcut + yeni):**

```
┌──┬───────────┬─────────────┬─────────┐
│LR│ Gezgin    │ Hızlı Notlar│  Main   │  ← lg+ (≥1024px): rail + 3 yan panel + main
│  │ (panel 1) │ (panel 2)   │  içerik │     (her panel açık/kapalı bağımsız persist;
│  │           │             │         │      hepsi aynı anda açıklasa içerik daralır)
└──┴───────────┴─────────────┴─────────┘
                                          ← <lg (mobil): rail + paneller overlay sheet;
                                            mutex (3'lü) — biri açıkken diğerleri kapanır
```

`LR` (LeftRail) — sol dikey rail (VS Code "Activity Bar"); 3 toggle: Gezgin / Hızlı Notlar / **Planlayıcı** (yeni).

## 2. Kapsam (V1) ve V2/V3 yol haritası

### V1 kapsamı (Faz 16'da teslim)

- ✅ Google Takvim **read-only** — etkinlik liste + detay
- ✅ Better Auth `genericOAuth` plugin ile Google hesap bağlama (login değil, yalnız Calendar scope)
- ✅ Yalnız **primary calendar** (kullanıcının birincil takvimi)
- ✅ Tek-gün dikey timeline (Trello pattern); ay dropdown + ◀ Bugün ▶ ile gün gezinme
- ✅ Polling refresh (TanStack Query staleTime 5dk + window focus + manuel yenile)
- ✅ Etkinlik tıklanınca Pusula-içi read-only modal (başlık, başlangıç-bitiş, açıklama, konum, katılımcılar, "Google'da aç" link)
- ✅ Yalnız **web** (`apps/web`)
- ✅ Ayarlar > **Entegrasyonlar** sekmesinde Bağla / Bağlı / Bağlantıyı Kes UI

### V2 (gelecek faz, kapsam dışı)

- Çok takvim seçimi + renk filtresi (paylaşılan + iş takvimi)
- Hafta görünümü (opsiyonel; gün sınırlı kalır)
- Kart → Event olu (drag, tek yön)
- Mobil panel (`apps/mobile` — Faz 7 yayında, v1.2.0 native gerekir)

### V3 (uzak gelecek)

- İki yönlü tam senkron (event → kart, kart due → event)
- Google Push Notifications webhook (gerçek-zamanlı sync)
- Çoklu Google hesabı
- Hatırlatma / notification

## 3. Mimari kararlar (16.0 — 2026-05-31)

| # | Karar | Reddedilen alternatif | Gerekçe |
|---|---|---|---|
| K1 | **Read-only V1** | "Kart → event (tek yön)" / "İki yönlü tam senkron" | Trello'nun bilinen pattern'i; en hızlı değer teslimi; OAuth scope dar; drag-drop entegrasyonu + event-card link tablosu V2'ye |
| K2 | **Better Auth `genericOAuth` plugin** + ayrı bağlama | "El yapımı OAuth route'ları" / "Login + Calendar birleşik" | Plugin token storage/refresh/encryption ücretsiz; login Google'a bağımlanmaz; mevcut e-mail hesaplarıyla merge sorunu yok; scope revoke bağımsız |
| K3 | **Yalnız primary calendar (V1)** | "Çok takvim seçimli + renk filtresi" | UI karmaşıklığı vs. değer dengesi; çoğu kullanıcının ana ihtiyacı primary; çok takvim V2'ye |
| K4 | **Yalnız web (V1)** | "Web + mobil paralel" | `apps/web` panel pattern'ı (Gezgin/Hızlı Notlar) hazır; mobil OAuth deep-link + native Calendar entegrasyonu kararı ayrı; mobil v1.2.0 native build gerekir |
| K5 | **Polling refresh** (staleTime 5dk + focus + manuel) | "Google Push Notifications webhook + realtime" | Webhook channel renewal (7g), public HTTPS endpoint, channel storage gerekir; V1'in değeri için fazla maliyet; polling kullanıcı algısında "yeterince taze" |
| K6 | **Etkinlik tıklama → Pusula-içi read-only modal** | "Yeni sekmede Google Calendar'a yönlendir" | Kullanıcı uygulama içinde kalır; modal'de "Google'da aç" link yine de var |
| K7 | **İstek anında proxy** (etkinlik DB'ye yazılmaz) | "Postgres cache + worker sync" | V1 kapsamına orantılı; senkron logic yok; cache invalidation karmaşıklığı yok; Google API quota'sı bireysel kullanım için fazlasıyla yeterli (1M req/gün, kullanıcı başına ~250-500 req/gün) |
| K8 | **`fetch` wrapper** (hafif) | "`googleapis` SDK" | SDK ağır (~5MB), tip yükü yüksek; ihtiyacımız `events.list`/`events.get` + `calendarList.list` (3 endpoint); hafif wrapper yeterli |

## 4. OAuth flow (K2 detayı)

### 4.1. Better Auth `genericOAuth` plugin config

`apps/api/src/auth.ts` — Better Auth init:

```ts
import { genericOAuth } from 'better-auth/plugins';

export const auth = betterAuth({
  // ... mevcut config
  plugins: [
    // ... mevcut pluginler
    genericOAuth({
      config: [
        {
          providerId: 'google-calendar',
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
          scopes: [
            'https://www.googleapis.com/auth/calendar.events.readonly',
            'https://www.googleapis.com/auth/calendar.readonly',
            'openid', 'email', 'profile',
          ],
          // Refresh token için kritik:
          accessType: 'offline',
          prompt: 'consent',
        },
      ],
    }),
  ],
});
```

**Önemli:** `accessType: 'offline'` + `prompt: 'consent'` parametreleri Google'a refresh token döndürtür. `prompt: 'consent'` olmazsa kullanıcı ikinci kez bağlandığında Google yalnız access token döner (refresh token boş) — token expire olduğunda yeniden bağlama gerekir.

### 4.2. Callback URL'leri

- Dev: `http://localhost:3001/api/auth/oauth2/callback/google-calendar`
- Prod: `https://pusulaportal.com/api/auth/oauth2/callback/google-calendar`

Google Cloud Console > OAuth 2.0 Client > Authorized redirect URIs listesine eklenir.

### 4.3. Token storage

Better Auth `account` tablosu (mevcut, `genericOAuth` plugin standardı):
- `accountId` (Google'ın user ID'si — `sub`)
- `providerId` (`'google-calendar'`)
- `userId` (Pusula user FK)
- `accessToken` (encrypted at rest — Better Auth secret ile)
- `refreshToken` (encrypted)
- `accessTokenExpiresAt`
- `scope` (verilen scope'lar)

**Yeni tablo yok, migration yok.** Mevcut `account` şeması yeterli.

### 4.4. Token yenileme

Better Auth `getAccessToken({ providerId: 'google-calendar', userId })` — otomatik refresh:
- Access token expire olduysa refresh token ile yeniler
- Refresh token revoke edilmişse `UNAUTHORIZED` hata atar → UI "Yeniden bağlayın" CTA gösterir

`packages/api/src/lib/google-calendar.ts` her isteği wrap eder:

```ts
async function googleFetch(userId: string, url: string, init?: RequestInit) {
  const token = await auth.api.getAccessToken({
    providerId: 'google-calendar',
    userId,
  });
  if (!token) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'GOOGLE_NOT_CONNECTED' });
  const res = await fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    // Refresh path zaten getAccessToken'da; 401 hala dönerse revoke edilmiş demektir
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'GOOGLE_RECONNECT_REQUIRED' });
  }
  if (!res.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Google API ${res.status}` });
  return res.json();
}
```

### 4.5. Bağlantıyı kesme

`integrations.google.disconnect` → Better Auth `auth.api.unlinkAccount({ providerId: 'google-calendar', userId })` → `account` row silinir → bir sonraki `events.list` çağrısı `UNAUTHORIZED` döner → UI boş durum CTA gösterir.

## 5. tRPC API yüzeyi

### 5.1. `integrations.google.*` router

User-scoped (`protectedProcedure`); workspace/board yetkilendirmesine tabi değil.

| Procedure | Input | Output | Açıklama |
|---|---|---|---|
| `integrations.google.status` | — | `{ connected: boolean; email?: string; connectedAt?: Date; scopes?: string[] }` | Mevcut bağlantı durumu (UI bağla/bağlı kartı için) |
| `integrations.google.connect` | — | `{ authUrl: string }` | Better Auth'un OAuth authorization URL'i (kullanıcı browser'da bu URL'e gider, callback Better Auth'ta) |
| `integrations.google.disconnect` | — | `{ success: true }` | Bağlantıyı keser (Better Auth `unlinkAccount`) |

### 5.2. `planner.events.*` router

User-scoped; takvim verisi kişisel.

| Procedure | Input | Output | Açıklama |
|---|---|---|---|
| `planner.events.list` | `{ start: string; end: string; timeZone: string }` (ISO 8601 + IANA TZ) | `PlannerEvent[]` | Primary calendar'dan etkinlik listesi (verilen aralık) |
| `planner.events.get` | `{ eventId: string }` | `PlannerEventDetail` | Tek etkinlik detayı (modal için) |

**Zod şema** (`@pusula/domain/schemas/planner.ts`):

```ts
export const plannerEventSchema = z.object({
  id: z.string(),
  summary: z.string().nullable(),       // başlık (Google'da boş olabilir → "(başlıksız)")
  description: z.string().nullable(),
  location: z.string().nullable(),
  start: z.object({
    dateTime: z.string().datetime().optional(),  // zamanlı etkinlik
    date: z.string().date().optional(),          // tüm gün
    timeZone: z.string().optional(),
  }),
  end: z.object({
    dateTime: z.string().datetime().optional(),
    date: z.string().date().optional(),
    timeZone: z.string().optional(),
  }),
  colorId: z.string().optional(),       // Google color palette (1-11)
  htmlLink: z.string().url(),           // "Google'da aç" linki
  status: z.enum(['confirmed', 'tentative', 'cancelled']),
  attendees: z.array(z.object({
    email: z.string().email(),
    displayName: z.string().optional(),
    responseStatus: z.enum(['needsAction', 'declined', 'tentative', 'accepted']).optional(),
  })).optional(),
});
```

### 5.3. Hata tipleri

- `UNAUTHORIZED` `code: 'GOOGLE_NOT_CONNECTED'` — kullanıcı hiç bağlamamış → UI boş durum CTA
- `UNAUTHORIZED` `code: 'GOOGLE_RECONNECT_REQUIRED'` — token revoke / refresh fail → UI "Yeniden bağlayın" CTA
- `INTERNAL_SERVER_ERROR` — Google API 5xx → UI "Bir sorun oluştu, yeniden deneyin" + manuel yenile

## 6. Web UI

Tam panel anatomisi: [`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md) Planlayıcı anatomi bölümü. Buradaki özet:

### 6.1. LeftRail 3. toggle

`apps/web/src/app/(app)/_components/left-rail.tsx`:
- Toggle ikonu: lucide `Calendar` (Gezgin = `Compass`, Hızlı Notlar = `StickyNote` mevcut)
- Etiket: `strings.planner.toggleLabel` = "Planlayıcı"
- Aktif state: panel açık iken `data-active="true"` + `bg-accent`

### 6.2. PlannerPanel

`apps/web/src/app/(app)/_components/planner-panel.tsx` **YENİ**.

Anatomi (Trello birebir):
- **Header** (~52px):
  - Sol: Ay dropdown (`May` ▾) — ay seçici; tıklayınca mini-takvim ay grid'i
  - Sol: ◀ Bugün ▶ — gün gezinme (Bugün butonu bugüne döndürür)
  - Sağ: ⋯ menü (yenile, ayarlar)
- **All-day banner** (varsa, ~28px) — tüm gün etkinlikleri yatay strip
- **Timeline** (kalan boşluk, scroll):
  - Sol: saat etiketleri 9am-9pm (dikey)
  - İçerik: saat çizgileri (yatay grey) + etkinlik blokları (renkli kart, üst=başlık + saat, alt=konum if any)
- **Footer boş durum** (bağlı değilse): büyük CTA "Google Takvim'i bağla" → `/account/integrations`

Hesap bağlı değilken header gizlenmez (gün gezinme görünür kalır, ama boş timeline + CTA).

### 6.3. Etkinlik modal

`apps/web/src/app/(app)/_components/planner-event-modal.tsx` **YENİ** — shadcn `Dialog`:
- Başlık (büyük)
- Tarih + saat aralığı
- Konum (varsa, harita ikonu)
- Açıklama (varsa, multiline; HTML değil — Google plain text döndürür)
- Katılımcılar listesi (varsa, avatar + isim + RSVP status)
- Alt: "Google'da aç" link (`event.htmlLink`, yeni sekme)
- Read-only — düzenle/sil yok

### 6.4. AppShell entegrasyon

`apps/web/src/app/(app)/_components/app-shell.tsx`:
- `pusula:planner-panel-open` localStorage key (Gezgin/Hızlı Notlar pattern'ı birebir)
- 3. `AnimatePresence` panel + backdrop bloğu
- Mobil mutex: 3 panel arası (`setPlannerOpen` açarken diğer ikiyi kapat; var olan iki helper güncellenir)
- Desktop'ta üç panel yan yana açılabilir; toplam genişlik > viewport olursa içerik shrink'lenir (mevcut row flexbox davranışı)

### 6.5. Ayarlar > Entegrasyonlar

Mevcut `/account` ekranına yeni sekme veya `/account/integrations` route:
- Kart: "Google Takvim"
  - Bağlı değil: "Bağla" butonu → `integrations.google.connect` → `authUrl`'e redirect
  - Bağlı: "Bağlı (`user@gmail.com`, 2026-05-31'de bağlandı)" + "Bağlantıyı kes" butonu

### 6.6. i18n / strings

`apps/web/src/lib/strings.ts`:

```ts
planner: {
  toggleLabel: 'Planlayıcı',
  open: 'Planlayıcıyı aç',
  close: 'Planlayıcıyı kapat',
  title: 'Planlayıcı',
  today: 'Bugün',
  refresh: 'Yenile',
  loading: 'Etkinlikler yükleniyor…',
  empty: 'Bu gün için etkinlik yok.',
  notConnected: {
    title: 'Planlayıcı',
    body: 'Planlayıcıyı ve yapılacak işlerinizi yan yana görüntülemek için takvimlerinizi bağlayın.',
    cta: 'Hesap bağlayın',
    hint: 'Planlayıcınızı yalnızca siz görebilirsiniz.',
  },
  reconnect: 'Yeniden bağlayın',
  event: {
    location: 'Konum',
    description: 'Açıklama',
    attendees: 'Katılımcılar',
    openInGoogle: "Google'da aç",
    allDay: 'Tüm gün',
    rsvp: {
      accepted: 'Katılıyor',
      declined: 'Katılmıyor',
      tentative: 'Belki',
      needsAction: 'Yanıt bekleniyor',
    },
  },
},
integrations: {
  title: 'Entegrasyonlar',
  google: {
    title: 'Google Takvim',
    description: 'Takvim etkinliklerinizi Pusula Planlayıcı panelinde görün (salt-okunur).',
    connect: 'Bağla',
    disconnect: 'Bağlantıyı kes',
    connected: 'Bağlı',
    connectedAs: '{email} hesabıyla bağlı',
    connectedAt: '{date} tarihinde bağlandı',
    disconnectConfirm: 'Google Takvim bağlantısı kesilsin mi? Planlayıcı paneli boş kalır; istediğin zaman yeniden bağlayabilirsin.',
  },
},
```

## 7. Sync stratejisi (K5 detayı)

### 7.1. Polling konfigürasyonu

`PlannerPanel` içinde TanStack Query:

```ts
const eventsQuery = useQuery({
  ...trpc.planner.events.list.queryOptions({
    start: startOfDay(viewDate).toISOString(),
    end: endOfDay(viewDate).toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }),
  enabled: connectionQuery.data?.connected === true,
  staleTime: 5 * 60_000,                // 5dk taze
  refetchOnWindowFocus: true,           // tab'a dön → otomatik yenile
  refetchOnReconnect: true,
});
```

### 7.2. Manuel yenile

Header'da yenile butonu → `eventsQuery.refetch()`. Toast: "Etkinlikler güncellendi" (1.5s).

### 7.3. Sayfa-içi gün değişimi

Gün ileri/geri tıklanınca query key (`viewDate`) değişir → otomatik fetch (TanStack Query default). Manuel cache invalidation yok.

### 7.4. Webhook neden yok (V1)

Google Calendar Push Notifications:
- Channel `expiration: 7 gün max` — her hafta yenileme worker'ı gerekir
- Public HTTPS endpoint zorunlu (dev: ngrok gerekli)
- Channel storage tablosu (channel_id, resource_id, expiration, userId) gerekir
- Domain verification (Google'a domain sahipliği kanıtlama)
- Polling 5dk kullanıcı algısında "yeterince taze" — değer/maliyet uyuşmuyor

V3'te realtime senkron istenirse webhook eklenebilir; o zaman channel renewal worker + Faz 5 outbox simetri pattern'ı kullanılır.

## 8. Google API client

`packages/api/src/lib/google-calendar.ts` **YENİ**:

### 8.1. Endpoint'ler (V1)

- `GET https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=&timeMax=&singleEvents=true&orderBy=startTime&maxResults=250` — etkinlik listesi
- `GET https://www.googleapis.com/calendar/v3/calendars/primary/events/{eventId}` — etkinlik detay

### 8.2. Implementation iskeleti

```ts
import type { PlannerEvent } from '@pusula/domain';
import { TRPCError } from '@trpc/server';

const GOOGLE_API = 'https://www.googleapis.com/calendar/v3';

async function googleFetch<T>(userId: string, path: string): Promise<T> {
  // §4.4 — token + 401 handling
}

export async function listPrimaryEvents(
  userId: string,
  start: string,
  end: string,
  timeZone: string,
): Promise<PlannerEvent[]> {
  const url = `${GOOGLE_API}/calendars/primary/events?` +
    new URLSearchParams({
      timeMin: start,
      timeMax: end,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      timeZone,
    });
  const data = await googleFetch<{ items: unknown[] }>(userId, url);
  return data.items.map(mapGoogleEventToPlannerEvent);
}

export async function getEvent(userId: string, eventId: string): Promise<PlannerEvent> {
  const url = `${GOOGLE_API}/calendars/primary/events/${encodeURIComponent(eventId)}`;
  const raw = await googleFetch<unknown>(userId, url);
  return mapGoogleEventToPlannerEvent(raw);
}

function mapGoogleEventToPlannerEvent(raw: any): PlannerEvent {
  return plannerEventSchema.parse({
    id: raw.id,
    summary: raw.summary ?? null,
    description: raw.description ?? null,
    location: raw.location ?? null,
    start: raw.start,
    end: raw.end,
    colorId: raw.colorId,
    htmlLink: raw.htmlLink,
    status: raw.status,
    attendees: raw.attendees,
  });
}
```

### 8.3. Rate limit

Google Calendar API quota'sı (varsayılan, ücretsiz):
- 1.000.000 sorgu/gün/proje
- 600 sorgu/dakika/kullanıcı

Pusula tahmini:
- Aktif kullanıcı başına ~50-100 sorgu/gün (panel ~10 açılış × ~5-10 fetch)
- 10.000 aktif kullanıcı = ~500K-1M sorgu/gün → quota sınırına yakın
- Şu anki kullanıcı sayısı: ≤100 → tamamen güvenli

Quota artırma başvurusu V3'te (kullanıcı 10K+ olunca) yapılır.

## 9. Env & Google Cloud kurulumu

### 9.1. Environment variables

`apps/api/src/env.ts` Zod şema:

```ts
GOOGLE_CLIENT_ID: z.string().min(1).optional(),
GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
```

Faz 16'da `optional` — env yoksa `integrations.google.connect` 503 "Integration not configured" döner; panel CTA "Henüz hazır değil" gösterir. Production yayını için zorunlu.

`.env.example`:

```bash
# Google Takvim entegrasyonu (Faz 16)
# Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
```

### 9.2. Google Cloud Console kurulumu (runbook adımı)

1. **Project oluştur** (veya mevcut Pusula projesini kullan)
2. **APIs & Services > Library** > "Google Calendar API" enable
3. **OAuth consent screen**:
   - User type: External (production için Google doğrulama gerekir)
   - App name: "Pusula"
   - User support email: `demirkol.abdullah93@gmail.com`
   - App logo: Pusula brand mark
   - Authorized domains: `pusulaportal.com`
   - Scopes: `calendar.events.readonly` + `calendar.readonly` (sensitive)
   - Test users (geliştirme sırasında): geliştirme yapacak Google hesapları
4. **Credentials > Create credentials > OAuth client ID**:
   - Application type: Web application
   - Name: "Pusula Web (prod)" / "Pusula Web (dev)"
   - Authorized redirect URIs:
     - `https://pusulaportal.com/api/auth/oauth2/callback/google-calendar` (prod)
     - `http://localhost:3001/api/auth/oauth2/callback/google-calendar` (dev)
5. **Client ID + Secret** Dokploy env'e (prod) ve `.env.local`'e (dev) yazılır.
6. **Production yayını için Google doğrulama**: `calendar.events.readonly` sensitive scope → Google "OAuth verification" başvurusu (homepage URL, privacy policy URL, demo video gerekir, 4-6 hafta sürebilir).

Geçici çözüm: consent screen "Testing" modunda kalır; yalnız "Test users" listesindeki hesaplar bağlanabilir; refresh token 7 günde dolar. Beta kullanıcılar için yeterli; public yayın öncesi doğrulama tamamlanmalı.

## 10. Yetki ve gizlilik

- Bağlantı **kullanıcı-özel** — bir kullanıcının takvimi başka kullanıcıya görünmez
- Takvim verisi DB'ye yazılmaz (K7); istek anında proxy → "GDPR right to be forgotten" basit (`disconnect` → tüm token silinir, hiç veri kalmaz)
- `disconnect` mantığı tek tek temizleme yapar (account row → Better Auth bunu yapar)
- Ekibe veya workspace üyelerine takvim erişimi YOK — kişisel; workspace/board permission helper'larına bağlanmaz

## 11. Test stratejisi (Faz 16D)

### 11.1. Vitest

- `@pusula/domain` Zod şemalar: `plannerEventSchema` parse senaryoları (tüm gün / zamanlı / kısmi alanlar)
- `packages/api` router (`integrations.google.*` + `planner.events.*`): Google API fetch mock (msw veya `vi.fn`) — happy path + 401 reconnect + 503 + boş response

### 11.2. RTL

- `planner-panel.tsx`: boş durum CTA görünür (bağlı değil), bağlıyken loading skeleton, etkinlik render, etkinlik tıklama → modal açılır, gün gezinme query key değiştirir
- `left-rail.tsx`: 3 toggle render, aktif state, mutex (mobil viewport simülasyonu)
- `planner-event-modal.tsx`: alanlar render, "Google'da aç" link, kapatma

### 11.3. Playwright

- Bağlama flow: Better Auth `genericOAuth` mock provider (test ortamında stub OAuth server) → bağla butonu → callback → bağlı durumuna geç
- Bağlı kullanıcıda panel açılış → etkinlik fetch (mock) → render
- Window focus refetch tetikleme
- LeftRail 3 toggle mutex (`<lg` viewport)
- A11y: panel keyboard nav (Tab) + ESC kapatma

## 12. Risk noktaları (16.0'da doğrulanır)

- **Better Auth `genericOAuth` plugin desteği:** `accessType: 'offline'` + `prompt: 'consent'` parametre geçirme — plugin docs ile doğrula (alternatif `additionalParams` field)
- **Google "Testing mode" refresh token 7g expire:** Beta dönem için kabul; production öncesi doğrulama
- **Browser TZ ↔ Google event TZ uyumu:** TZ'siz event olmaz; tüm gün event'lerinde `start.date` (zaman yok) kullan, timezone-agnostic
- **Çok-günlü etkinlik render:** Gün kolonunun üst banner'ında "Sürüyor: 2 günden 3 güne" göster; saat şeridine yayma
- **Bilgisayar saati yanlış:** Token expiry kontrol başarısız olabilir → Better Auth otomatik yeniliyor; ekstra koruma yok
- **OAuth consent screen public approval süresi:** 4-6 hafta — V2 mobil planı bu süreyi bekler mi? Beta kullanıcılar test users ile yeterli

## 13. V2/V3 yol haritası (özet)

- **V2 (Faz ?):** Hafta görünümü + mobil panel + çok takvim seçimi + kart → event drag (tek yön)
- **V3 (Faz ?):** İki yönlü senkron + Google Push Notifications webhook + çoklu Google hesabı + hatırlatma/notification

V2 mobil için: `apps/mobile` aynı pattern (`PlannerPanel` reuse mümkün değil — React Native, web değil); Expo Calendar API native takvim entegrasyonu opsiyonu da değerlendirilir. v1.2.0 native build.

## 14. Bağımlılık & çakışma

- **Faz 15 (iPad, `apps/mobile`):** çakışmaz — Faz 16 yalnız `apps/web` + `apps/api` + `packages/api` + `packages/domain` + `@pusula/domain` Zod şemalar.
- **Faz 8 (Sertleştirme, `apps/web`):** çakışmaz — yeni dosyalar; mevcut Gezgin/Hızlı Notlar paneller pattern'ı reuse.
- **Better Auth:** sürümün `genericOAuth` plugin desteği gerekir (16.0'da doğrula); mevcut Better Auth versiyonu güncelse mevcut session/account akışlarına dokunulmaz.
- **Faz 12 (DEM-159, Cancelled):** bu belge Faz 12'nin yerini alır.

## 15. İlgili belgeler

- [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) — Karar kaydı 2026-05-31 satırı
- [`03-backend.md`](03-backend.md) — `integrations.google.*` + `planner.events.*` procedure listesi + OAuth notları
- [`07-auth.md`](07-auth.md) — Better Auth `genericOAuth` plugin notu (login != bağlama)
- [`08-web-ve-mobil.md`](08-web-ve-mobil.md) — 3. global panel pattern'ı (LeftRail + AppShell)
- [`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md) — Planlayıcı panel anatomi + tek-gün timeline
- [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md) — "Faz 16 alt işleri" bölümü
- [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) — kişisel veri, workspace/board scope dışı kural notu (16.0 sırasında ek satır)
