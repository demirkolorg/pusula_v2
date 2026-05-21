import { NextResponse } from 'next/server';

/**
 * Apple App Site Association (AASA) — iOS universal links doğrulama dosyası.
 *
 *   GET https://pusulaportal.com/.well-known/apple-app-site-association
 *
 * iOS, Pusula mobil uygulaması kuruluyken `pusulaportal.com` linklerini
 * uygulamada açar (Faz 7L kararı — tüm yollar; bkz. `apps/mobile/app.config.ts`
 * `ios.associatedDomains: ['applinks:pusulaportal.com']`). Apple'ın `swcd`
 * servisi bu dosyayı çeker; `appID` = `<TeamID>.<bundleId>`.
 *
 * - **Team ID:** `W86CKUEB82` (Apple Developer — Individual, 2026-05-20 EAS build).
 * - **Bundle ID:** `com.pusula.app`.
 * - **`paths: ['*']`:** tüm yollar uygulamaya yönlendirilir (kullanıcı kararı
 *   2026-05-18).
 *
 * Route handler kullanılır (statik `public/` dosyası yerine): `NextResponse.json`
 * `Content-Type: application/json` garantiler — Apple bu MIME tipini bekler;
 * uzantısız statik dosyada içerik tipi belirsiz kalırdı. `force-static` ile
 * derleme anında bir kez üretilip CDN-cache'lenebilir hâle gelir.
 *
 * Android `assetlinks.json` ayrı dosyadır ve Android yayını ertelendiği için
 * şimdilik eklenmedi (Faz 7O — iOS öncelikli).
 */
export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json({
    applinks: {
      details: [
        {
          appID: 'W86CKUEB82.com.pusula.app',
          paths: ['*'],
        },
      ],
    },
  });
}
