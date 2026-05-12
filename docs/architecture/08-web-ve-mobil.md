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
