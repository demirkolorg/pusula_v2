import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Font } from '@react-pdf/renderer';

/**
 * Klasik pano PDF Roboto font kaydı. Faz 14B + 14F kararıyla local TTF'ler;
 * gstatic.com CDN URL'leri Roboto major sürüm yükseltmelerinde stabil değil.
 *
 * Önceki konum `apps/web/src/lib/pdf/fonts.ts` `process.cwd()` ile Next.js'in
 * `public/fonts` dizinine işaret ederdi; endpoint `apps/api`'ye taşınınca (cookie
 * subdomain post-mortem, 2026-06-01) `process.cwd()` API container/dev shell
 * koşum dizinine bağlı kalır. Bunun yerine **module-relative**:
 *   - dev (tsx watch): `apps/api/src/reports/fonts.ts` → `../../public/fonts`
 *   - prod bundle (tsup): `apps/api/dist/index.js` → `../public/fonts`
 * Her iki konum da aynı paket içinde `apps/api/public/fonts/*.ttf` çözer.
 * `tsup` bundle çıktısı `dist/` altında, public klasörü `apps/api/public/`
 * korunur; Dockerfile `turbo prune --docker` ile dahil olur.
 */
const HERE = dirname(fileURLToPath(import.meta.url));

function resolveFontDir(): string {
  const candidates = [
    join(HERE, '..', '..', 'public', 'fonts'), // dev: src/reports → apps/api/public/fonts
    join(HERE, '..', 'public', 'fonts'), // prod bundle: dist → apps/api/public/fonts
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  // Hiçbiri yoksa ilk adayı dön — @react-pdf/renderer kayıt aşamasında dosya
  // okumaz; render anında lazy okur, başarısız olursa render hata fırlatır.
  return candidates[0]!;
}

let registered = false;

export function registerReportFonts(): void {
  if (registered) return;

  const fontDir = resolveFontDir();

  Font.register({
    family: 'Roboto',
    fonts: [
      { src: join(fontDir, 'roboto-light.ttf'), fontWeight: 300 },
      { src: join(fontDir, 'roboto-regular.ttf'), fontWeight: 400 },
      { src: join(fontDir, 'roboto-medium.ttf'), fontWeight: 500 },
      { src: join(fontDir, 'roboto-bold.ttf'), fontWeight: 700 },
    ],
  });

  registered = true;
}

export function __resetFontRegistrationForTests(): void {
  registered = false;
}
