---
title: '07 — Auth'
description: 'Better Auth, session yönetimi ve authorization ayrımı.'
aliases:
  - 'Auth'
  - 'Kimlik Doğrulama'
tags:
  - 'pusula'
  - 'architecture/auth'
  - 'security'
type: 'architecture'
axis: 'architecture'
status: 'active'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
updated: 2026-05-22
---

# 07 — Auth (Kimlik Doğrulama)

> Eksen: **tasarım / teknik** — kimlik doğrulama altyapısı ve permission **enforcement noktası**.
> Yetkilendirme **kuralları** (roller, kim ne yapabilir) iş kuralıdır → [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md).

## Better Auth

- Kimlik doğrulama: **Better Auth**. Self-hosted, TypeScript odaklı; Hono ve Expo gibi farklı istemci katmanlarıyla kullanılabilir.
- Instance: `apps/api/src/auth.ts`. Hono üzerinde `${API_URL}/api/auth/*` route'larını Better Auth sahiplenir.
- Web client: `apps/web/src/lib/auth-client.ts` (`better-auth/react`). Web ↔ API ayrı origin olduğundan oturum yönetimi **client-side** (`useSession`); istekler `credentials: 'include'`. Web auth ekran akışı (sign-up/in/out, korumalı kabuk, route group düzeni) → [`08-web-ve-mobil.md`](08-web-ve-mobil.md) §8.1.1.
- Mobil oturum (**Faz 7B** — [DEM-178](https://linear.app/demirkol/issue/DEM-178), ✅ wired): `apps/mobile` Better Auth Expo client'ı kullanır (`createAuthClient` + `@better-auth/expo` `expoClient` plugin). Mobilde tarayıcı cookie'si yok — `expoClient` oturum cookie'sini `expo-secure-store` ile saklar; `authClient.getCookie()` mobil tRPC istemcisinin `httpBatchLink`'ine `Cookie` başlığı olarak verilir, böylece tüm tRPC çağrıları oturumlu gider. Session refresh Better Auth client tarafında yönetilir (`useSession`). **Server tarafı:** Better Auth instance'ına `@better-auth/expo` `expo()` plugin eklenir ve `trustedOrigins`'e mobil scheme (`pusula://`) eklenir — Expo entegrasyonu bunu zorunlu kılar (yalnız mobil client yetmez). sign-in/up/out + şifre sıfırlama akışı web ile aynı Better Auth uçlarına gider; signup bootstrap sunucu tarafında ortaktır (`databaseHooks.user.create.after`) — mobil signup ayrı bootstrap kodu gerektirmez. **Şifre sıfırlama:** mobil `forgot-password` ekranı `requestPasswordReset({ email, redirectTo })` çağırır; `redirectTo` `expo-linking` `createURL('reset-password')` ile üretilen derin bağlantıdır — sıfırlama e-postasındaki link mobil uygulamanın `reset-password` ekranını `?token=` ile açar. **Bilinen sınır (7B):** sıfırlama token'ı custom scheme (`pusula://`) derin bağlantısıyla taşınır; custom scheme'ler işletim sistemince benzersiz garanti edilmez (Android scheme hijacking) — bu yüzden App Links / Universal Links sertleştirmesi **Faz 7M**'e bırakıldı. Token tek kullanımlık + ~1 saat TTL olduğu için pencere dardır. Mobil auth ekranları → [`08-web-ve-mobil.md`](08-web-ve-mobil.md) §8.2.
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

## Profil & hesap yönetimi (Faz 1)

Kullanıcının **kendi** hesabını yönetmesi (ad, avatar, parola, hesap silme) için ayrı bir tRPC katmanı **yoktur** — bunlar doğrudan Better Auth'un kendi uçlarına gider (`apps/web/src/lib/auth-client.ts` → `${API_URL}/api/auth/*`); yeni bir `user.*` router'ı eklenmez. Web ekranı → [`08-web-ve-mobil.md`](08-web-ve-mobil.md) §8.1.7. Şemalar `@pusula/domain` (`updateProfileInput` / `changePasswordInput` / `deleteAccountInput`).

- **Ad & avatar:** `authClient.updateUser({ name, image })` → `users.name` / `users.image`. Avatar şimdilik **basit bir URL**'dir — yükleme yok; MinIO attachment altyapısı Faz 8'de gelir, ileride buna bağlanabilir (karar kaydı 2026-05-12). Boş `image` → `null` (avatar kaldırılır).
- **Parola değiştir:** `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })` — Better Auth `currentPassword`'ı doğrular; başarıda diğer oturumlar iptal edilir.
- **Hesabı sil:** `authClient.deleteUser({ password })` (re-auth onayı — credential hesabı için parola gerekir). Sunucu tarafı: Better Auth config'inde `user.deleteUser.enabled = true` + `beforeDelete` hook. Hook, kullanıcı **herhangi bir workspace'in `owner`'ıysa** silmeyi **engeller** (`@pusula/domain` `canDeleteOwnAccount` — ownership transfer henüz yok; kullanıcı önce o workspace'leri silmeli/arşivlemeli; `workspaces.ownerId` zaten `onDelete: 'restrict'` — hook ham DB hatası yerine açıklayıcı bir mesaj döndürür). Silme cascade'i: `sessions`/`accounts`/`workspace_members`/`board_members`/`card_members`/`comments`/`push_tokens`/`notifications` cascade; `activity_events.actor_id`, davet `invited_by_id`/`accepted_by_id` `set null` (geçmiş kalır, aktör anonimleşir). Hesap silme domain kuralı → [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) (Hesap (User) — öz-yönetim), [`../domain/01-urun-modeli.md`](../domain/01-urun-modeli.md) (invariant 14).

## Şifre sıfırlama akışı (Faz 1 ek iş — [DEM-68](https://linear.app/demirkol/issue/DEM-68))

Kullanıcı parolasını unutursa **e-posta ile şifre sıfırlama bağlantısı** alır. Profil/hesap yönetimi gibi bu da doğrudan Better Auth uçlarına gider — yeni tRPC katmanı **yoktur**.

- **Web (`apps/web`):** Çok modlu `/sign-in` cam kartının `forgot` ve `reset` modları (tek sayfa — ayrı `/forgot-password`/`/reset-password` ekranları yok; eski rotalar `/sign-in?mode=…`'e server-side redirect). `forgot` modu — e-posta gir → `authClient.requestPasswordReset({ email, redirectTo: \`${window.location.origin}/sign-in?mode=reset\` })`→ "Bağlantı e-posta adresine gönderildi" nötr mesajı (e-posta var/yok **ayırt edilmez** — kullanıcı listesi sızdırılmaz; Better Auth da kayıt yoksa sessizce başarı döner).`reset` modu— bağlantıdaki`?token=` URL'den okunur → yeni parola gir (`@pusula/domain` `passwordSchema`ile istemcide doğrula) →`authClient.resetPassword({ newPassword, token })`→ başarıda kart içinde "parolan güncellendi" durumu (giriş moduna dönüş linki); token yok/geçersiz/süresi dolmuşsa açıklayıcı mesaj + "yeni bağlantı iste" (forgot moduna geçer). Sign-in modunda **"şifremi unuttun"** linki. Yalnız shadcn/ui + motion; kullanıcı-yüzlü metinler`strings.auth.\*`; ekran düzeni → [`08-web-ve-mobil.md`](08-web-ve-mobil.md) §8.1.1. `redirectTo`**mutlak** (web app origin'i) verilir — Better Auth`redirectTo`'yu sunucu tarafında kendi `baseURL`'üne (`API_URL`) göre çözer; göreli bir yol API sunucusuna işaret ederdi. Mutlak web URL'i `trustedOrigins` (`APP_URL`) origin kontrolünden geçer; Better Auth bu URL'e `&token=…` ekler →`/sign-in?mode=reset&token=…`. `/sign-in`rotası`Referrer-Policy: no-referrer`ile servis edilir (reset modunda token query'de —`Referer`sızıntısına karşı defense-in-depth;`apps/web/next.config.ts`).
- **API (`apps/api/src/auth.ts`):** Better Auth `emailAndPassword.sendResetPassword({ user, url, token }, request)` callback'i → **Resend** transactional e-postası gönderir (kısa HTML + plain-text gövde: sıfırlama linki + geçerlilik notu; gönderen = `EMAIL_FROM` env). `RESEND_API_KEY` / `EMAIL_FROM` `apps/api/src/env.ts` Zod şemasına eklenir; `RESEND_API_KEY` yoksa callback **best-effort** — uyarı loglanır, exception fırlatılmaz (signup bootstrap hook'undaki disiplinle aynı). Sıfırlama linki token'ı query'de taşıdığından **yalnızca dev'de** (`NODE_ENV !== 'production'`) log'a yazılır; prod'da `RESEND_API_KEY` unutulursa yalnızca "e-posta gönderilemedi" loglanır (token **log'a düşmez**). Dev ortamında (`NODE_ENV !== 'production'`) `EMAIL_DEV_OVERRIDE` env'i set ise tüm transactional auth e-postaları gerçek alıcı yerine bu adrese gönderilir (gerçek alıcıyı içeren bir uyarı loglanır); prod'da bu override **yok sayılır** — `EMAIL_FROM=onboarding@resend.dev` (Resend test göndereni, yalnız hesap sahibine teslim eder) ile farklı adresli kullanıcı testini kolaylaştırır (v1'deki `MAIL_DEV_ALICI_OVERRIDE` deseni). `resend` npm paketi `apps/api` deps'e eklenir. Şemalar `@pusula/domain` (`forgotPasswordInput` = `{ email }`, `resetPasswordInput` = `{ token, newPassword }` — `passwordSchema` yeniden kullanılır).
- **Bu auth e-postası bildirim outbox'undan AYRIDIR:** parola sıfırlama (ve ileride signup doğrulama) **request-path**'te Better Auth tarafından Resend ile gönderilir; Faz 6'daki `notification_outbox` + worker akışı **bildirim** e-postaları içindir, transactional auth e-postaları onun parçası değildir. Karar kaydı → [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) (2026-05-12).
- **Token:** Better Auth tek-kullanımlık, süreli token üretir (`verifications` tablosu); link web'in verdiği `redirectTo`'ya token eklenerek oluşur → `${APP_URL}/sign-in?mode=reset&token=…`. Token üretimi/süresi/iptali Better Auth varsayılanlarına bırakılır.
- **E-posta şablonu (ortak — `renderTransactionalEmail` helper'ı, `apps/api/src/auth-emails.ts`):** Şifre sıfırlama ve signup doğrulama e-postaları aynı email-safe (tablo bazlı, inline style, no flex/grid, `oklch` yerine email-safe hex `#5b5bd6`) layout'u paylaşır. Düzen: gizli preheader (inbox snippet) → indigo marka bandı (Pusula wordmark) → 600px beyaz kart (heading + intro) → bulletproof CTA butonu (table + bgcolor + inline-block, Outlook fallback'lı) → fallback URL kod kutusu (uzun token'ı `word-break:break-all` ile sarar) → süre + ignore notları → yıl + tagline footer. Konular diakritikli (`Pusula — Şifre sıfırlama` / `Pusula — E-posta doğrulama`). Dark mode override **yok** — Gmail/Outlook dark rendering'i client-bazlı tahmin edilemez; light tutarlı kalır. Marka rengi `--primary` token'ının email-safe hex eşdeğeri (`#5b5bd6`).

## Signup e-posta doğrulama (Faz 8 — [DEM-72](https://linear.app/demirkol/issue/DEM-72))

Signup e-posta doğrulama **yumuşak politika** ile çalışır: `emailAndPassword.requireEmailVerification = false`. Kullanıcı signup sonrası otomatik oturum alır ve onboarding kesilmez; doğrulanmamış oturumlar `(app)` kabuğunda kalıcı "E-postanı doğrula" banner'ı görür.

- **API (`apps/api/src/auth.ts`):** Better Auth `emailVerification` aktiftir: `sendOnSignUp: true`, `expiresIn: 3600`, `autoSignInAfterVerification: true`, `sendVerificationEmail({ user, url })` → `apps/api/src/auth-emails.ts` `sendVerificationEmail` → Resend. Auth e-postaları request-path'te kalır ve notification outbox/worker'a girmez.
- **Web (`apps/web`):** Signup `authClient.signUp.email({ ..., callbackURL: \`${window.location.origin}/verify-email\` })`gönderir. Banner tekrar gönderim için`authClient.sendVerificationEmail({ email, callbackURL })`çağırır.`/verify-email`route'u`(auth)`dışında public callback ekranıdır; Better Auth API redirect'i başarılıysa başarı,`?error=`varsa geçersiz/süresi dolmuş bağlantı durumu gösterir. Direct`/verify-email?token=` linkleri API verify endpoint'ine yönlendirilir.
- **Güvenlik:** Verification link token'ı query'dedir; production log'larına düşmez. `/verify-email` ve `/sign-in` (reset modunda `?token=` taşır) route'ları `Referrer-Policy: no-referrer` ile servis edilir.

## Yeni cihazda oturum maili (Faz 10I — [DEM-143](https://linear.app/demirkol/issue/DEM-143))

Bir kullanıcı **daha önce görmediğimiz** bir cihaz/ağ kombinasyonundan oturum açtığında hesap güvenliği için "Yeni cihazdan oturum açıldı" maili gönderilir. Bu **bir bildirim değildir**; `notification_outbox` / Faz 6 worker'a girmez, transactional auth e-postaları gibi request-path'te Resend ile gönderilir (sıfırlama/doğrulama maillerindeki aynı best-effort disiplin). Detay UI tasarımı → [`15-bildirim-ayar-ekrani.md`](15-bildirim-ayar-ekrani.md) §15.4 Section 8.

- **Tablo:** `auth_known_devices` (migration `packages/db/drizzle/0023_dem143_known_devices.sql`, Drizzle schema `packages/db/src/schema/auth.ts`). Her satır `(user_id, user_agent_hash, ip_subnet)` üçlüsünün ilk görüldüğü ve son görüldüğü anı tutar. Hash: `sha256(normalize(userAgent))` — patch-level browser sürüm farkları (örn. `Chrome/120.0.6099.130` ↔ `Chrome/120.0.6099.71`) major+minor seviyesinde aynı, major (120 → 121) sayılırsa **yeni cihaz**. Subnet: IPv4 `/24`, IPv6 `/48`; tanınamayan IP `'unknown'`. **Unique index** `(user_id, user_agent_hash, ip_subnet)` üzerinde — login hook tek round-trip `INSERT ... ON CONFLICT DO UPDATE SET last_seen_at = now()` ile "yeni mi bilinen mi" kararını verir.
- **Login hook (`apps/api/src/auth.ts`):** Better Auth `databaseHooks.session.create.after(session, ctx)` her başarılı login sonrası tetiklenir (e-posta+parola, OAuth, vb.). Hook `recordSessionDevice(...)`'ı (`apps/api/src/known-devices.ts`) çağırır; sonuç `isNewDevice === true` ise `users.email`/`users.name` lookup'u + `sendNewDeviceLoginEmail(...)` (`apps/api/src/auth-emails.ts`). Tüm yol **best-effort**: helper veya mail başarısızlığı login akışını bozmaz, sadece `console.error`/`console.warn` ile loglanır. Mail içeriği: tarayıcı (normalize edilmiş UA), yaklaşık ağ (subnet — ham IP **saklanmaz**), UTC tarih + "Hesabımı koru" CTA → `${APP_URL}/account?tab=security`. Token yok; production'da Resend yoksa link logu güvenli.
- **tRPC (`packages/api/src/routers/devices.ts` → `auth.devices.*`):** `auth.devices.list` (query, `protectedProcedure`) çağıran kullanıcının `auth_known_devices` satırlarını `last_seen_at DESC` döner; her satır `isCurrent` flag'i taşır — bu flag istek bağlamındaki `ctx.userAgent` + `ctx.ip`'nin hesaplanmış (UA hash, subnet) ikilisi ile satırın eşleşip eşleşmemesinden gelir. `auth.devices.revoke({ deviceId })` (mutation, `protectedProcedure`) satırı siler **ve** o (UA hash, subnet) ikilisiyle eşleşen tüm Better Auth `sessions` satırlarını filtreleyip kaldırır (`inArray(sessions.id, ...)`). Better Auth oturumları Drizzle adapter ile bizim `sessions` tablomuzda yaşadığından satır silinince ilgili cookie sahibi bir sonraki istekte oturumsuz kalır.
- **UI (`apps/web/src/app/(app)/account/_components/security-activity-section.tsx`):** /account "Güvenlik" sekmesi içinde `SecurityActivitySection` Card'ı bilinen cihazları listeler — current device "Bu oturum" badge'i taşır ve "Çıkış yap" butonu disabled'dır (kullanıcı kendi oturumunu yanlışlıkla kapatamaz). Diğer cihazlarda `auth.devices.revoke` çağrısı + `auth.devices.list` invalidasyonu + toast (`{count} oturum kapatıldı.`). Hardcoded metin yok — `strings.account.security.devices.*`. UI tasarım dili (Card, Badge, Button, EmptyState) → [`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md).
- **Mahremiyet:** Ham IP **persist edilmez** — yalnız subnet (`/24` veya `/48`). UA opsiyonel (truncate edilip 256 karakter sınırı) `userAgent` kolonuna kullanıcının kendi UI'sinde gösterilmek için yazılır. IP geo lookup yok — Faz 11+.
- **Faz 10I dışında bırakılanlar:** IP geo lookup (şehir/ülke), 2FA, "şüpheli login" ML scoring, mobile push (Faz 7+), mail içinde harita.
