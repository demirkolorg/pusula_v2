---
title: "07 — Auth"
description: "Better Auth, session yönetimi ve authorization ayrımı."
aliases:
  - "Auth"
  - "Kimlik Doğrulama"
tags:
  - "pusula"
  - "architecture/auth"
  - "security"
type: "architecture"
axis: "architecture"
status: "active"
parent: "[[docs/architecture/README|Tasarım / Teknik Mimari]]"
updated: 2026-05-12
---
# 07 — Auth (Kimlik Doğrulama)

> Eksen: **tasarım / teknik** — kimlik doğrulama altyapısı ve permission **enforcement noktası**.
> Yetkilendirme **kuralları** (roller, kim ne yapabilir) iş kuralıdır → [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md).

## Better Auth

- Kimlik doğrulama: **Better Auth**. Self-hosted, TypeScript odaklı; Hono ve Expo gibi farklı istemci katmanlarıyla kullanılabilir.
- Instance: `apps/api/src/auth.ts`. Hono üzerinde `${API_URL}/api/auth/*` route'larını Better Auth sahiplenir.
- Web client: `apps/web/src/lib/auth-client.ts` (`better-auth/react`). Web ↔ API ayrı origin olduğundan oturum yönetimi **client-side** (`useSession`); istekler `credentials: 'include'`. Web auth ekran akışı (sign-up/in/out, korumalı kabuk, route group düzeni) → [`08-web-ve-mobil.md`](08-web-ve-mobil.md) §8.1.1.
- Tabloları (`users`, `sessions`, `accounts`, `verifications`) `@pusula/db` içinde — bkz. [`04-veri-katmani.md`](04-veri-katmani.md).
- Better Auth session, kullanıcı, hesap bağlantıları ve güvenli kimlik doğrulama akışlarını yönetir.
- **Signup bootstrap hook'u:** Better Auth instance'ında `databaseHooks.user.create.after`, yeni kullanıcı için **best-effort** olarak bir default workspace + boş "İlk Pano" bootstrap eder (`apps/api/src/bootstrap.ts`, tek transaction). Hook **best-effort**'tur: hata loglanır, exception yeniden fırlatılmaz — signup'ı patlatmaz. Domain kuralı → [`../domain/01-urun-modeli.md`](../domain/01-urun-modeli.md) (invariant 11); akış + login sonrası yönlendirme → [`08-web-ve-mobil.md`](08-web-ve-mobil.md) §8.1.3.

Değerlendirilen alternatifler: Clerk (managed, hızlı), Auth.js (Next.js merkezli — mobil daha fazla
dikkat ister). Self-hosted + esneklik için Better Auth seçildi.

## Auth ≠ Authorization

Workspace/board/card **yetkilendirmesi auth sistemine gömülmez** — domain permission katmanında
çözülür (`@pusula/domain/permissions`). Enforcement noktası: her tRPC procedure.

```txt
protectedProcedure (Better Auth session check — @pusula/api, non-null session garantiler)
  → workspace access
  → board access
  → card/list permission
  → mutation/query
```

- Permission kontrolü **her** tRPC procedure'de server-side; frontend state'e güvenilmez.
- Realtime room erişimi de server-side board/workspace permission'dan türetilir.
- Bu zincirin somut tRPC implementasyonu katmanlı procedure tipleridir: `workspaceProcedure` / `boardProcedure` / `cardProcedure` — bkz. [`03-backend.md`](03-backend.md) (Scoped procedure middleware'leri).
- Rol literal array'leri + helper'lar `@pusula/domain` içinde; kuralların kendisi → [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md).
- Güvenlik başlıkları (rate limit, CSRF/CORS, invite token expiration, session invalidation, webhook signature) → [`10-platform.md`](10-platform.md).
