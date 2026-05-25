import { join } from 'node:path';
import { Font } from '@react-pdf/renderer';

// Faz 14B + 14F follow-up — 14A karar 4 revize (2026-05-25, kullanıcı geri
// bildirimi sonrası): Google Fonts gstatic.com CDN URL'leri stabil değil
// (Roboto v30 → v51 sürüm yükseltmesi sonrası eski URL'ler 404 döndü).
// Local TTF'lere geçildi — `apps/web/public/fonts/roboto-*.ttf` (~124KB × 4 =
// 496KB binary repo yükü; build deterministik, offline-friendly, CDN downtime
// veya URL bozulması ile etkilenmiyor). `@react-pdf/renderer` `src` absolute
// file path kabul eder; Node tarafı `fs.readFileSync`'i kendisi yapar.
const FONT_DIR = join(process.cwd(), 'public', 'fonts');

let registered = false;

export function registerReportFonts(): void {
  if (registered) return;

  Font.register({
    family: 'Roboto',
    fonts: [
      { src: join(FONT_DIR, 'roboto-light.ttf'), fontWeight: 300 },
      { src: join(FONT_DIR, 'roboto-regular.ttf'), fontWeight: 400 },
      { src: join(FONT_DIR, 'roboto-medium.ttf'), fontWeight: 500 },
      { src: join(FONT_DIR, 'roboto-bold.ttf'), fontWeight: 700 },
    ],
  });

  registered = true;
}

export function __resetFontRegistrationForTests(): void {
  registered = false;
}
