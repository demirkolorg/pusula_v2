---
title: 'Sistem Uyum Analizi'
description: 'Pusula v2 kod tabanının mimari kararlar, kullanılan araçlar ve proje kurallarıyla uyum denetimi.'
aliases:
  - 'Sistem Uyum Analizi'
  - 'Mimari Uyum Denetimi'
tags:
  - 'pusula'
  - 'analysis/system'
type: 'analysis'
axis: 'root'
status: 'active'
parent: '[[README|Pusula]]'
updated: 2026-05-15
---

# Sistem Uyum Analizi

## Kapsam

- Analiz tarihi: 2026-05-15.
- Çalışma dizini: `D:\projects\pusula_v2`.
- İncelenen ana eksenler:
  - `CLAUDE.md` içindeki vazgeçilmez kurallar.
  - `docs/architecture/*` teknik kararları.
  - `docs/domain/*` domain kuralları.
  - `apps/*`, `packages/*`, `e2e/*` kod yüzeyleri.
  - Paket manifestleri, build/test/lint/typecheck/format/e2e çıktıları.
- Yaklaşım:
  - Repo kural ve mimari belgeleri okundu.
  - Paket grafiği, import yönleri, route/API yüzeyi, realtime/outbox akışları ve UI bağımlılıkları grep ile tarandı.
  - Projenin kendi kalite kapıları çalıştırıldı.
  - Bulgular "aktif ihlal", "risk", "teknik borç" ve "uyumlu alan" olarak ayrıldı.

## Yönetici Özeti

- Ana sistem kurgusu büyük ölçüde korunmuş:
  - Monorepo `pnpm` + Turborepo üstünde.
  - Web uygulaması Next.js App Router kullanıyor.
  - Ana API sözleşmesi tRPC; Hono HTTP kabuğu olarak duruyor.
  - DB katmanı PostgreSQL + Drizzle; `snake_case` casing kararı korunmuş.
  - Realtime source of truth DB/outbox; Socket.IO yalnız taşıma katmanı.
  - Worker işleri BullMQ + Redis üzerinden ayrılmış.
  - Yasak component/DnD library kullanımı bulunmadı.
  - `packages/domain` framework/db/env bağımsızlığını koruyor.
- Doğrudan aksiyon gerektiren ana bulgular:
  - Tam Playwright e2e koşusunda realtime reconnect-resync senaryosu fail oldu.
  - `pnpm.cmd format:check` 395 dosyada Prettier uyuşmazlığıyla fail oldu.
  - Auth marka panelinde kullanıcıya görünen hardcoded UI metinleri var.
  - `apps/web` manifest/build config içinde `@pusula/db` web katmanına taşınmış görünüyor; doğrudan import yok ama katman sınırı açısından riskli.
  - Socket.IO server HTTP health açıldıktan sonra async attach ediliyor; bu durum zaten e2e içinde bekleme workaround'ı ve TODO ile görünür.
- Kritik güvenlik açığı sınıfında kesin bir bulgu çıkmadı; asıl sorunlar test güvenilirliği, katman sınırı, format standardı ve tip güvenliği etrafında.

## Çalıştırılan Komutlar

- `pnpm lint`
  - PowerShell execution policy `pnpm.ps1` çağrısını engelledi.
  - Windows giriş noktası olarak aynı araç `pnpm.cmd lint` ile çalıştırıldı.
- `pnpm.cmd lint`
  - Başarılı.
  - Uyarılar:
    - `packages/db/src/seed-kaymakamlik.ts`: 5 adet `console.log` uyarısı.
    - `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-meta-row.tsx`: kullanılmayan `cn` import'u.
- `pnpm.cmd typecheck`
  - Başarılı.
- `pnpm.cmd test`
  - Başarılı.
  - Görünen paket özetlerine göre 1053 test geçti.
  - Test çıktısında `pg` için deprecation warning görüldü: `client.query()` zaten query çalıştırırken çağrılıyor uyarısı.
- `pnpm.cmd lint:e2e`
  - Başarılı.
- `pnpm.cmd typecheck:e2e`
  - Başarılı.
- `pnpm.cmd format:check`
  - Başarısız.
  - Prettier 395 dosyada format uyuşmazlığı raporladı.
- `pnpm.cmd build`
  - Başarılı.
  - `@pusula/api-server`, `@pusula/worker`, `@pusula/web` build aldı.
- `docker compose ps`
  - Postgres, Redis ve MinIO çalışır/healthy durumda.
- `pnpm.cmd test:e2e`
  - Başarısız.
  - 20 testten 18 geçti, 1 fail oldu, 1 test seri blok nedeniyle çalışmadı.

## Aktif Bulgular

### P1 - Realtime reconnect e2e senaryosu başarısız

- Komut: `pnpm.cmd test:e2e`.
- Sonuç:
  - 18 passed.
  - 1 failed.
  - 1 did not run.
- Fail olan test:
  - `e2e/realtime-board-sync.spec.ts:235`
  - `reconnect resync - bob goes offline, alice moves a card, bob comes back and catches up`
- Fail noktası:
  - `e2e/realtime-board-sync.spec.ts:251-254`
  - Test `bobPeer.context.setOffline(true)` sonrası `strings.realtime.disconnected` banner'ını bekliyor.
  - Locator 10 saniyede bulunamadı.
- İlgili uygulama kodu:
  - `apps/web/src/lib/realtime/use-board-realtime.ts:153-155`
    - `disconnect` event'i gelirse `connected=false` yapılıyor.
  - `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/page.tsx:261-268`
    - `!realtime.connected` ise disconnect banner render ediliyor.
  - `apps/web/src/lib/realtime/client.ts:31-35`
    - Socket.IO client `transports: ['websocket']`, `autoConnect: false`.
- Risk:
  - Playwright offline simülasyonu mevcut WebSocket bağlantısını testin beklediği şekilde koparmıyor olabilir.
  - Alternatif olarak UI sadece Socket.IO `disconnect` event'ine bağlı kaldığı için tarayıcı offline durumunu yeterince hızlı yansıtmıyor olabilir.
  - Test fail olduğu için "offline iken kaçırılan event sonrası reconnect refetch/catch-up" davranışı bu koşuda doğrulanamadı.
  - Aynı serial describe içindeki `echo discipline` testi çalışmadı; realtime echo güvence kapsamı bu koşuda eksik kaldı.
- Öneri:
  - Offline banner davranışını hem Socket.IO disconnect hem browser `online/offline` event'leriyle uyumlu hale getir.
  - E2E testinde yalnız görünür banner'a bağlı kalmadan socket disconnect/reconnect state'ini deterministik bekleyen bir test yardımcı fonksiyonu ekle.
  - Reconnect catch-up davranışını banner kontrolünden bağımsız ikinci assertion olarak koru.

### P1 - Format kapısı repo genelinde kırık

- Komut: `pnpm.cmd format:check`.
- Sonuç:
  - Başarısız.
  - Prettier 395 dosyada format uyuşmazlığı raporladı.
- Etki:
  - Repo "format check" kalite kapısı yeşil değil.
  - Bu kadar geniş drift, gerçek kod değişikliklerinin diff'lerini ve review kalitesini bozar.
  - CI'da `format:check` koşuyorsa merge bloklanır.
- Öneri:
  - Ayrı ve mekanik bir format commit'i aç.
  - Kod davranışı değişikliğiyle format düzeltmesini karıştırma.
  - Sonrasında `pnpm.cmd format:check` CI kapısı olarak zorunlu tutulmalı.

### P2 - Kullanıcıya görünen UI metinleri hardcoded

- Proje kuralı:
  - `CLAUDE.md:64`: UI bileşenleri hardcode metin içermez, i18n uyumlu olur.
  - Mevcut geçici kaynak: `apps/web/src/lib/strings.ts`.
- Bulgular:
  - `apps/web/src/app/(auth)/_components/auth-brand-panel.tsx:20`
    - Marka paneli metni inline.
  - `apps/web/src/app/(auth)/_components/auth-brand-panel.tsx:24-31`
    - Başlık ve açıklama inline.
  - `apps/web/src/app/(auth)/_components/auth-brand-panel.tsx:45-47`
    - Alt açıklama inline.
  - `apps/web/src/app/(auth)/_components/auth-brand-panel.tsx:54-58`
    - `ADVANTAGES` dizisi inline kullanıcı metni.
  - `apps/web/src/app/(auth)/_components/auth-brand-panel.tsx:65-77`
    - Kart başlık/metrik metinleri inline.
- Etki:
  - i18n/centralized-copy standardından sapıyor.
  - Auth alanında metin değişikliği için tek kaynak `strings.ts` değil.
- Öneri:
  - Bu panelin tüm copy değerlerini `strings.auth.brandPanel` benzeri bir alt anahtara taşı.
  - Testlerde literal metin yerine `strings` kaynaklarını kullan.

### P2 - `apps/web` katmanı `@pusula/db` bağımlılığını taşıyor

- Bulgular:
  - `apps/web/package.json:21`: `@pusula/db` dependency.
  - `apps/web/next.config.ts:6`: `transpilePackages` içinde `@pusula/db`.
  - Kod taramasında `apps/web`, `packages/domain`, `packages/ui` içinde doğrudan `@pusula/db` import'u bulunmadı.
- Değerlendirme:
  - Bu aktif bir doğrudan DB import ihlali değil.
  - Ancak web paketinin manifest ve Next transpile yüzeyinde DB paketini taşıması katman sınırını gevşetiyor.
  - `apps/web` zaten `@pusula/api` tiplerini kullanıyor; bu tip zinciri DB paketini build yüzeyine çekiyorsa bunun bilinçli olarak belgelenmesi gerekir.
- Risk:
  - Gelecekte web tarafında yanlışlıkla DB kodu import etmek kolaylaşır.
  - Server/client bundle sınırları bulanıklaşabilir.
- Öneri:
  - Gerçek ihtiyaç yoksa `@pusula/db`'yi `apps/web/package.json` ve `next.config.ts` içinden çıkar.
  - `@pusula/api` tip tüketimi DB import'u gerektiriyorsa, `packages/api` public type export sınırı ayrıştırılmalı.

### P2 - Socket.IO attach sırası cold-start ve e2e yarış riski taşıyor

- Bulgular:
  - `apps/api/src/index.ts:13-15`: Hono HTTP server `serve` ile açılıyor.
  - `apps/api/src/index.ts:23-34`: `setupSocketServer(...)` async olarak `void` ile sonradan attach ediliyor.
  - `e2e/realtime-board-sync.spec.ts:60-75`: Test içinde health açıldıktan sonra Socket.IO/bridge attach yarışını açıklayan `waitForSocketJoin` workaround'ı ve TODO var.
- Etki:
  - `/health` hazır olsa bile Socket.IO ve Redis bridge tam hazır olmayabilir.
  - Cold boot'ta ilk realtime envelope kaçırma riski test yorumlarında da belgelenmiş.
- Öneri:
  - API startup akışını Socket.IO + Redis bridge hazır olmadan health ready kabul etmeyecek hale getir.
  - Ya `setupSocketServer` tamamlanmadan server ready sinyali verme ya da `/health` içine realtime readiness bilgisini ekle.
  - E2E'deki sabit `2_000ms` bekleme kaldırılabilir hale gelmeli.

### P2 - Realtime event client handler'larında tip güvenliği zayıf noktalar var

- Bulgular:
  - `apps/web/src/lib/realtime/event-handlers.ts:128-159`
    - Payload'tan `CardCache` üretirken `as unknown as CardCache` kullanılıyor.
  - `apps/web/src/lib/realtime/event-handlers.ts:162-182`
    - Payload'tan `ListCache` üretirken `as unknown as ListCache` kullanılıyor.
  - `apps/web/src/lib/realtime/event-handlers.ts:401-421`
    - `card.completed` / `card.uncompleted` patch'lerinde `Partial<CardCache>` ve `Partial<CardDetailCache>` cast zinciri var.
- Etki:
  - Realtime payload sözleşmesi compile-time görünse de runtime'da gevşek.
  - Eksik/bozuk payload bazı alanlarda sessiz cache bozulmasına yol açabilir.
- Güçlü taraf:
  - Bu dosyanın geniş test kapsamı var (`event-handlers.test.ts` 50 test geçti).
- Öneri:
  - `@pusula/domain` altında discriminated Zod realtime event payload şemaları tanımla.
  - Client handler'a gelen envelope'u type guard/Zod parse ile daralt.
  - `CardCache` / `ListCache` inşasını cast yerine explicit mapper ile kapat.

### P2 - Demo seed dosyası riskli ve lint uyarısı üretiyor

- Bulgular:
  - `packages/db/src/seed-kaymakamlik.ts:1-10`
    - "Veritabanı bağlantı objenizin yolu", "Şema tanımlarınızın yolu" gibi yerel/prototip yorumlar duruyor.
  - `packages/db/src/seed-kaymakamlik.ts:14-17`
    - Basit `['a','b','c']` benzeri pozisyon üretimi var; ana `@pusula/domain/position` helper disiplininden farklı.
  - `packages/db/src/seed-kaymakamlik.ts:120-127`
    - Script çalışırsa `cards`, `lists`, `boards`, `workspaces` gibi tabloları temizliyor.
  - `packages/db/src/seed-kaymakamlik.ts:101,121,135,153,157`
    - `console.log` kullanımları lint uyarısı üretiyor.
- Değerlendirme:
  - Root/package scriptlerinde bu dosyanın çağrıldığı görülmedi; aktif çalıştırma yolu yok gibi.
  - Buna rağmen DB paketinde durması riskli: yanlışlıkla çalıştırılırsa geniş veri temizliği yapıyor.
- Öneri:
  - Bu dosya gerçekten gerekli değilse kaldır.
  - Gerekiyorsa adını ve komutunu açıkça "demo/dev-only" yap; production env guard ekle.
  - Pozisyon üretimini `positionsBetween` ile aynı standarda çek.
  - `console.log` yerine izin verilen logger/`console.warn` ya da script istisnası kararı kullan.

### P3 - `npx` referansı proje kuralıyla çelişiyor

- Proje kuralı:
  - `CLAUDE.md:57` ve `docs/architecture/02-teknoloji-kararlari.md:26`: `pnpm` dışında `npm/yarn/bun/npx` kullanılmaz.
- Bulgu:
  - `packages/db/src/schema/auth.ts:7-8`
    - Yorumda `npx @better-auth/cli generate` öneriliyor.
- Değerlendirme:
  - Bu çalışan script değil; yorum seviyesinde.
  - Yine de repo içi yönerge olarak yanlış alışkanlık üretiyor.
- Öneri:
  - Yorumu `pnpm dlx @better-auth/cli generate` veya repo tarafından onaylanmış Better Auth schema generate komutuyla değiştir.
  - Eğer Better Auth CLI için istisna gerekiyorsa `docs/architecture/02-teknoloji-kararlari.md` karar kaydına yaz.

### P3 - Bildirim outbox fallback'i yanlış wiring durumunda email/push kaybettirebilir

- Bulgular:
  - `apps/worker/src/jobs/notification-publish.ts:213-232`
    - Email enqueuer varsa email kuyruğuna devrediyor.
    - Enqueuer yoksa "fall through" ile devam ediyor.
  - `apps/worker/src/jobs/notification-publish.ts:233-248`
    - Push için aynı desen var.
  - `apps/worker/src/jobs/notification-publish.ts:251-264`
    - Fallthrough durumunda row `processedAt` ve `status: 'sent'` ile stamp ediliyor.
- Güçlü taraf:
  - `apps/worker/src/index.ts` production wiring içinde email/push enqueuer'lar sağlanıyor.
  - Bu aktif production path'te doğrudan kayıp gibi görünmüyor.
- Risk:
  - Yanlış/eksik host wiring durumunda email/push outbox row'u "sent" işaretlenip gerçekten gönderilmeden kaybolabilir.
- Öneri:
  - Enqueuer yoksa `sent` yerine açık `skipped` / `unwired` status kullan.
  - Production'da enqueuer yokluğu boot-time fatal olmalı ya da health/readiness fail etmeli.

### P3 - Raw SQL sonuç tipinde geniş cast var

- Bulgu:
  - `apps/worker/src/jobs/notification-publish-sweeper.ts:71-73`
    - `db.execute(...)` sonucu `(rows as unknown as { rows: ... }).rows` ile açılıyor.
- Etki:
  - Küçük bir tip güvenliği borcu.
  - Drizzle driver sonucu değişirse runtime hatası erken yakalanmayabilir.
- Öneri:
  - Driver-specific sonuç tipini yardımcı fonksiyonda izole et.
  - Mümkünse Drizzle select builder ile typed result üret.

### P3 - Lint uyarısı: kullanılmayan import

- Bulgu:
  - `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-meta-row.tsx:9`
  - `cn` import edilmiş ama kullanılmıyor.
- Etki:
  - Davranışsal risk düşük.
  - Lint gate warning ile yeşil olsa bile repo hijyenini düşürüyor.
- Öneri:
  - `cn` import'unu kaldır.

### P3 - Testlerde `pg` deprecation warning var

- Bulgu:
  - `pnpm.cmd test` sırasında `@pusula/api` testlerinde `pg` uyarısı görüldü:
    - `Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0`.
- Etki:
  - Testler geçiyor.
  - `pg@9` yükseltmesinde kırılma riski var.
- Öneri:
  - Uyarı kaynağını `node --trace-deprecation` ile daralt.
  - Aynı client üzerinde paralel query akışı varsa async flow'u seri hale getir veya ayrı client/pool kullan.

## Uyumlu Alanlar

### Paket yöneticisi ve monorepo

- Root `package.json`:
  - `packageManager: pnpm@11.1.0`.
  - `engines.node >=22`.
  - Scriptler `pnpm --filter` ve Turborepo üstünden.
- Lockfile taraması:
  - `pnpm-lock.yaml` mevcut.
  - `package-lock.json`, `yarn.lock`, `bun.lockb` gibi alternatif lockfile bulunmadı.
- Not:
  - PowerShell ortamı `pnpm.ps1` çalıştırmayı engellediği için analiz komutları `pnpm.cmd` üzerinden çalıştırıldı; bu paket yöneticisi değişikliği değildir.

### Backend/API kurgusu

- `apps/api/src/app.ts` içinde Hono yalnız HTTP kabuğu:
  - `/`
  - `/health`
  - `/api/auth/*` Better Auth mount.
  - `/trpc/*` tRPC handler.
- Next.js içinde ana API'ye alternatif `app/api` route handler yüzeyi bulunmadı.
- Hono RPC, Express/Fastify/Koa gibi paralel ana API stack'i bulunmadı.
- Web tarafındaki doğrudan `fetch` kullanımları:
  - tRPC client transport.
  - Presigned upload URL'lerine dosya upload.
  - Bunlar ana API sözleşmesini by-pass eden genel REST yayılımı gibi görünmüyor.

### Domain paketi saflığı

- `packages/domain/src` içinde React, Next, Hono, tRPC, Better Auth, env veya DB import'u bulunmadı.
- `@pusula/db` referansları yorumlarda enum eşleşmesini anlatıyor; import değil.
- Domain paketi rol/permission, Zod schema, event type ve position helper sorumluluğunda kalıyor.

### DB/ORM ve sıralama

- Drizzle yapılandırmasında `casing: 'snake_case'` kullanımı mevcut.
- Liste/kart/checklist sıralama kolonları `text().notNull()` position olarak tutuluyor:
  - `packages/db/src/schema/lists.ts`
  - `packages/db/src/schema/cards.ts`
- Integer `order` yaklaşımı tespit edilmedi.
- `packages/domain/src/position.ts` fractional-indexing helper'larını sağlıyor:
  - `positionBetween`
  - `positionsBetween`
  - `firstPosition`
  - `isValidPosition`
  - `shouldCompact`
- Web DnD position hesapları `@pusula/domain` helper'ını kullanıyor.

### Yetkilendirme ve procedure sınırları

- `protectedProcedure` session garantisini sağlıyor.
- `workspaceProcedure`, `boardProcedure`, `cardProcedure` katmanlı erişim çözümleme desenini uyguluyor.
- Router taramasında board/list/card/comment/checklist/label/member akışlarının büyük bölümü scoped procedure üstünden gidiyor.
- Public procedure yüzeyi sınırlı:
  - `auth.me`
  - `health.ping`
  - `health.db`
- Hassas mutation'lar public görünmüyor.

### Realtime/outbox genel kurgusu

- Collaborative mutation'lar DB transaction içinde `realtime_events` yazıyor.
- Host app commit sonrası BullMQ producer'ı çağırıyor.
- Worker `realtime_events` row'unu alıp Redis pub/sub kanalına publish ediyor.
- API Socket.IO bridge worker mesajını local socket odalarına yayıyor.
- Bu yapı "Socket.IO kalıcı kaynak değil; Postgres + outbox source of truth" kararına uyuyor.
- Doğrudan Socket.IO emit yardımcıları `apps/api/src/socket/*` sınırında kalıyor.

### Bildirim kurgusu

- Domain activity/notification outbox transaction içinde yazılıyor.
- Worker in-app notification, email, push teslimini background job olarak işliyor.
- Auth password reset e-postası Better Auth callback içinde Resend ile request-path'te gidiyor; bu repo dokümanlarında bildirim outbox'tan bilinçli istisna olarak tanımlanmış.
- Resend/Expo doğrudan web/request mutation içine yayılmış görünmüyor.

### UI ve dependency kararları

- Yasak web component library kullanımı bulunmadı:
  - MUI yok.
  - Chakra yok.
  - Ant yok.
  - Mantine yok.
  - Headless UI yok.
  - Base UI yok.
- Drag-drop tarafında Atlassian Pragmatic Drag and Drop paketleri kullanılıyor.
- Radix kullanımı `packages/ui` altında shadcn/ui primitive'leri kapsamında görünüyor.
- Rich text tarafında Tiptap kullanımı kararlarla uyumlu.
- `apps/mobile` klasörü bulunmuyor; kullanıcı istemeden mobile scaffold yapılmamış.

## Öncelikli Aksiyon Sırası

- 1. Realtime reconnect e2e fail'ini ele al:
  - Banner state kaynağı ve Socket.IO/browser offline davranışını deterministik hale getir.
  - Test 5 ve test 6'yı yeniden yeşile çek.
- 2. Format drift'i ayrı mekanik değişiklikle düzelt:
  - `pnpm.cmd format`.
  - Ardından `pnpm.cmd format:check`.
- 3. `auth-brand-panel.tsx` hardcoded copy'lerini `strings.ts` içine taşı.
- 4. `apps/web` içindeki `@pusula/db` dependency/transpile gerekçesini kaldır veya açıkça ayrıştır.
- 5. API startup readiness'i Socket.IO + Redis bridge hazır olmadan health-ready olmayacak şekilde sıkılaştır.
- 6. `seed-kaymakamlik.ts` dosyasını kaldır, dev-only guard ekle veya standart seed disiplinine çek.
- 7. Realtime event handler payload doğrulamasını domain Zod şemalarıyla güçlendir.
- 8. Küçük hijyen işleri:
  - `card-meta-row.tsx` kullanılmayan `cn` import'unu kaldır.
  - `packages/db/src/schema/auth.ts` içindeki `npx` yorumunu `pnpm` standardına çek.
  - `pg` deprecation warning kaynağını trace ile bul.
  - Notification publish fallback'inde unwired email/push davranışını "sent" yerine güvenli statüye çek.

## Son Durum

- Kodda ana sistem mimarisini tamamen tersine çeviren büyük bir sapma bulunmadı.
- En ciddi işlevsel kanıt, tam e2e koşusunda realtime reconnect-resync senaryosunun fail olmasıdır.
- En geniş kalite problemi, Prettier format kapısının repo genelinde kırık olmasıdır.
- En net kural ihlali, auth marka panelindeki hardcoded UI metinleridir.
- En önemli mimari sınır riski, web paketinin `@pusula/db` bağımlılığını build yüzeyinde taşımasıdır.

## Re-validation 2026-05-15 (kapanış notu)

- Tarih: 2026-05-15 (analizden sonra aynı gün re-validation).
- Yöntem: Her bulgunun ilgili dosya/satırı tek tek okundu; mevcut HEAD durumu raporla karşılaştırıldı.
- Sonuç: Bulguların büyük çoğunluğu paralel olarak ilerleyen [`05-is-kayit-defteri.md`](docs/process/05-is-kayit-defteri.md) `QA-2026-05-15-001` ([DEM-123](https://linear.app/demirkol/issue/DEM-123)) kapsamında zaten kapatılmıştı.

### Bulgu-bulgu durum

- P1 — Format drift
  - Durum: ✅ Kapandı.
  - Aksiyon: `pnpm format` mekanik commit'i atıldı (`chore: prettier format pass`); `pnpm format:check` yeşil. Gerçek diff 8 dosyaydı (raporun 395 sayısı CRLF/LF uyarısı veren dosya sayısıydı — gerçek prettier diff'i değil).
- P1 — Realtime reconnect e2e fail (`e2e/realtime-board-sync.spec.ts:235`)
  - Durum: ⚠ Bu re-validation koşusunda e2e ayrıca koşulmadı; ancak ilgili kodda raporun önerdiği düzeltmeler **zaten** uygulanmış görünüyor:
    - [use-board-realtime.ts:185-198](apps/web/src/lib/realtime/use-board-realtime.ts#L185-L198) browser `online`/`offline` event listener'ı taşıyor; banner state'i yalnız Socket.IO disconnect'e bağlı değil.
    - [realtime-board-sync.spec.ts:70-74](e2e/realtime-board-sync.spec.ts#L70-L74) `waitForSocketJoin` artık fixed `2_000ms` yerine `data-realtime-board-joined="true"` DOM attribute'ünü bekliyor.
  - Önerilen takip: E2E altyapısı ayağa kalktığında `pnpm test:e2e --grep "reconnect resync"` ile yeniden doğrula. Hâlâ fail ise hipotez `Playwright setOffline(true)` ↔ Chromium `offline` event timing'i (banner timeout 10s yetersiz olabilir).
- P2 — Auth brand panel hardcoded copy
  - Durum: ✅ Kapandı. [auth-brand-panel.tsx](<apps/web/src/app/(auth)/_components/auth-brand-panel.tsx>) tüm kullanıcı metinlerini `strings.auth.brandPanel` üzerinden alıyor (eyebrow / headline / description / advantages / summary / footer).
- P2 — `apps/web` → `@pusula/db` katman gevşekliği
  - Durum: ✅ Kapandı. [apps/web/package.json](apps/web/package.json) bağımlılıklarında `@pusula/db` yok; [next.config.ts:6](apps/web/next.config.ts#L6) `transpilePackages` yalnızca `@pusula/ui`, `@pusula/domain`, `@pusula/api` taşıyor.
- P2 — Socket.IO + Redis bridge cold-start race
  - Durum: ✅ Kapandı. [apps/api/src/index.ts:19-30](apps/api/src/index.ts#L19-L30) `setupSocketServer(...)` promise'i sonrası `markApiStartupReady()`/`markApiStartupFailed()` çağrılıyor; raporun önerdiği "Socket.IO + Redis adapter hazır olmadan ready işareti verme" disiplini uygulanmış.
- P2 — Realtime event handler tip güvenliği
  - Durum: ✅ Kapandı (yumuşak gevşeklik kalktı). `apps/web/src/lib/realtime/event-handlers.ts` içinde `as unknown` cast'i kalmadı. (Discriminated Zod realtime envelope şemaları kapsamı bu raporun dışında bir takip işi olarak değerlendirilebilir.)
- P2 — `seed-kaymakamlik.ts`
  - Durum: ✅ Kapandı. `packages/db/src/` artık yalnızca `seed.ts` ve `seed-safety.test.ts` taşıyor; kaymakamlık demo seed dosyası tamamen kaldırılmış.
- P3 — `npx` referansı ([auth.ts:7-8](packages/db/src/schema/auth.ts#L7))
  - Durum: ✅ Kapandı. Yorum `pnpm dlx @better-auth/cli generate` olarak güncellenmiş.
- P3 — Notification outbox fallback (`'sent'` ile silent loss)
  - Durum: ✅ Kapandı. [notification-publish.ts:217-264](apps/worker/src/jobs/notification-publish.ts#L217-L264) enqueuer yokken/hata aldığında `markChannelHandoffUnavailable(...)` çağırıp `'skipped'` dönüyor; `processedAt` artık `in_app` başarı dalında stamp ediliyor.
- P3 — Raw SQL cast ([notification-publish-sweeper.ts:71-73](apps/worker/src/jobs/notification-publish-sweeper.ts#L71-L73))
  - Durum: ✅ Kapandı. `(rows as unknown as ...).rows` cast'i yerine `extractRawSqlRows<NotificationOutboxEventIdRow>(...)` helper'ı kullanılıyor (`apps/worker/src/jobs/raw-sql-rows.ts` izolasyonu).
- P3 — Kullanılmayan `cn` import ([card-meta-row.tsx](<apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-meta-row.tsx>))
  - Durum: ✅ Kapandı. Dosya artık `cn` import etmiyor; lint warning yok.
- P3 — `pg` deprecation warning
  - Durum: ⏳ Bu re-validation kapsamında `node --trace-deprecation` ile izole edilmedi. Mevcut `pnpm.cmd test` çıktısında uyarının halen yer alıp almadığı ayrı bir adımda doğrulanmalı.

### Re-validation sırasında ortaya çıkan yan bulgular

- `apps/api-server` typecheck'i şu anda fail oluyor: [bootstrap.ts:14-15](apps/api/src/bootstrap.ts#L14-L15) `@pusula/domain`'den `ONBOARDING_LIST_TITLES` ve `ONBOARDING_WELCOME_CARDS` import ediyor; bu adlar `@pusula/domain` içinde mevcut ([constants.ts:137-144](packages/domain/src/constants.ts#L137-L144)), yani import isimleri eşleşiyor — fakat `tsc` "no exported member" diyor. Hipotez: paralel açık WIP'lerden birinin yarım kalmış reexport düzenlemesi; bu rapor kapsamı dışında, ayrı bir issue olarak kovalanmalı.
- `@pusula/web` test koşusunda `redirect-if-authenticated.test.tsx` modülü "Cannot find module" hatası veriyor; ilgili komponent ([redirect-if-authenticated.tsx](<apps/web/src/app/(auth)/_components/redirect-if-authenticated.tsx>)) mevcut ama test dosyası filesystem'de yok. Hipotez: aktif `DEM-126` (default landing route) WIP'inin yarım kalmış izi — bu rapor kapsamı dışında.
- `packages/api/src/routers/auth.test.ts:8` kullanılmayan `beforeAll` import warning'i — yine `DEM-126` WIP'inin parçası, dokunulmadı.

### Sonuç

- Raporun açtığı ana itirazlar (format gate, hardcoded copy, DB katman sızıntısı, Socket.IO race, payload tip gevşekliği, demo seed, npx, notification silent loss, raw SQL cast, unused import) **bu re-validation tarihinde geçerli değildir**.
- Bu re-validation turunda atılan tek yeni commit: `chore: prettier format pass` (P1 format drift kapatma).
- Kalan açık takip: P1 e2e reconnect senaryosunun gerçek koşuda doğrulanması ve `pg` deprecation kaynağının trace edilmesi — ikisi de [DEM-123](https://linear.app/demirkol/issue/DEM-123) `In Progress` kapsamında ya da bir alt issue olarak takip edilebilir.
