---
title: "08 — Web ve Mobil"
description: "Next.js web ve ileri faz Expo mobile teknik kuralları."
aliases:
  - "Web ve Mobil"
  - "Frontend"
tags:
  - "pusula"
  - "architecture/frontend"
  - "mobile"
type: "architecture"
axis: "architecture"
status: "active"
parent: "[[docs/architecture/README|Tasarım / Teknik Mimari]]"
updated: 2026-05-12
---
# 08 — Web ve Mobil

> Eksen: **tasarım / teknik**. Board mekaniği (drag-drop/optimistic/realtime) ayrı: [`05-board-mekanigi.md`](05-board-mekanigi.md).

---

## 8.1 Web (`apps/web` → `@pusula/web`)

Next.js App Router. App `apps/web/src/app`; `@/*` → `apps/web/src/*`.

Sorumluluklar: board ekranı, drag-drop deneyimi, workspace & board yönetimi, notification center,
activity feed, search, settings, auth ekranları.

Kullanım ilkeleri:

- Ana API Next içinde **değil**, `apps/api` içinde. Route Handler'lar yalnızca web-BFF veya özel web endpoint'leri için.
- Server Component'ler initial shell/data için kullanılabilir; board ekranı interaktif olduğundan client component ağırlıklıdır.

Board ekranı teknik ihtiyaçları: stable layout · horizontal scroll · kart virtualization ihtimali ·
keyboard accessibility · drag overlay · multi-list reorder · optimistic cache update · realtime reconciliation.

### UI: yalnızca shadcn/ui

- **Yalnızca shadcn/ui** + Tailwind CSS (v4) + lucide-react. MUI, Chakra UI, Ant Design, Mantine, Headless UI veya başka component library **yok**. Radix primitive'ler yalnızca shadcn/ui bileşenlerinin parçası olarak.
- Ürüne özel bileşenler shadcn/ui üzerine inşa edilir. Paylaşılan web bileşenleri `@pusula/ui`; design token'lar `@pusula/ui/theme.css`; shadcn ekleme: `components.json` `packages/ui`'da konfigüre.
- **i18n & hardcode:** UI bileşenleri hardcode metin **içermez**; entity-bağımsız ve yerelleştirme (i18n) standartlarına uygun. Metinler çeviri katmanından gelir, etiketler/format locale-aware olur.
- Accessibility: keyboard navigation, focus yönetimi, ARIA — özellikle board ekranı ve modal akışları.

### 8.1.1 Auth ekranları & oturum yönetimi (Faz 1)

Better Auth HTTP route'ları `apps/api` (`${API_URL}/api/auth/*`); web tarafı `apps/web/src/lib/auth-client.ts` (`better-auth/react`) ile bunları çağırır. Web ve API farklı origin'de (dev: `:3000` / `:3001`) — session cookie API origin'inde set edilir, tRPC ve auth istekleri `credentials: 'include'` ile gider; bu yüzden **oturum yönetimi client-side**'dır (Next.js RSC, API origin'inin cookie'sine erişemez — server-side session kontrolü bu fazda yok).

- **Public route'lar:** `app/(auth)/sign-in`, `app/(auth)/sign-up`. `(auth)/layout.tsx` zaten oturum açıksa `/`'a yönlendirir. Formlar native `<form>` + `@pusula/domain` zod şemalarıyla client-side validasyon; `authClient.signUp.email(...)` / `signIn.email(...)`; hata mesajı inline; başarıda `?redirect=` (varsa) ya da `/`'a gider.
- **Korumalı kabuk:** `app/(app)/layout.tsx` (client component) `authClient.useSession()` kullanır — `pending` → iskelet/spinner; oturum yok → `router.replace('/sign-in?redirect=…')`; oturum var → app shell (header: kullanıcı adı + çıkış). `app/(app)/page.tsx` = workspace listesi (`trpc.workspace.list`). Çıkış: `authClient.signOut()` → `/sign-in`.
- **Workspace oluşturma:** shadcn `Dialog` + ad input → `trpc.workspace.create` mutation (`clientMutationId` istemcide üretilir, ör. `crypto.randomUUID()`); başarıda `workspace.list` invalidate. Tam optimistic UI Faz 4'te.
- **Workspace daveti (Faz 1.3 web):** workspace kartında — kullanıcı `admin+` ise — "Davet et" → shadcn `Dialog`, e-posta input (rol varsayılan `member`; rol seçimi sonraki iterasyon) → `trpc.workspace.members.invite`; hata inline (`CONFLICT` → "zaten üye/davetli"). Workspace listesinde ayrıca "Bekleyen davetler" bölümü → `trpc.workspace.invitations.mine` (kullanıcının kendi e-postasına gelen `pending` davetler: workspace adı, rol, davet eden, son tarih) + "Kabul et" / "Reddet" → `invitations.accept` / `invitations.decline` (`clientMutationId` ile); kabul başarılı → `workspace.list` (+ `invitations.mine`) invalidate. Gönderilmiş davetleri yönetme (`invitations.list`/`revoke`) workspace üyeler ekranıyla birlikte (sonraki iterasyon). Backend sözleşmesi → [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) (Workspace davet akışı).
- **Form kütüphanesi:** Faz 1 auth formları basit (email/parola) — native form + zod yeterli; ayrı form kütüphanesi (react-hook-form vb.) eklenmez. Karmaşık form ihtiyacı doğarsa ayrı karar.
- **shadcn bileşenleri** (`@pusula/ui`): `Button` mevcut; bu işle eklenenler (`Input`, `Label`, `Card`, `Dialog`, …) — `pnpm dlx shadcn@latest add …` `packages/ui` içinden, sonra `src/index.ts`'den export, `apps/web` zaten `@source` ile `packages/ui/src`'i Tailwind taramasına dâhil ediyor.
- **Test:** Auth formları için React Testing Library (render + validasyon + `authClient` mock'lu submit). Playwright e2e (sign-up → workspace listesi → workspace oluştur → çıkış) ileri faz / Faz 8 sertleştirmeyle birlikte.

---

## 8.2 Mobil (`apps/mobile`)

Expo + Expo Router. **Henüz iskelet kurulmadı** — ileri faz; kullanıcı açıkça istemeden `apps/mobile` **oluşturulmaz**.

İleride desteklenecek: auth session · board listesi · board görüntüleme · card detail · card
create/update · notification center · push notification deep link · cache persistence (faydalı yerlerde).

Mobil teknoloji: Expo, Expo Router, React Native Reanimated, Gesture Handler, Expo Notifications,
tRPC client, TanStack Query.

Mobil drag-drop ilk implementasyonda **öncelikli değildir** — alternatif taşıma modeli daha
sağlıklı: kart üzerinde "liste değiştir" aksiyonu, kart detayında "move to" picker; gerekirse
ileride basit long-press reorder. Dikkat: push token yönetimi, foreground/background notification
davranışı, deep link ile kart açma, offline mutation queue, cache persistence, auth session refresh.
