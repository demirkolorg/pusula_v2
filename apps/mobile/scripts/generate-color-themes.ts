/**
 * generate-color-themes.ts — 15 renk paleti üretici (web → mobil).
 *
 * Çalıştır:
 *   pnpm --filter @pusula/mobile exec tsx scripts/generate-color-themes.ts
 *
 * NE YAPAR
 * --------
 * Web `packages/ui/src/styles/theme.css`'teki `[data-color-theme='X']` (light)
 * + `.dark[data-color-theme='X']` (dark) bloklarını okur, her paletin web
 * token'larını (oklch / hex) parse eder, **oklch→sRGB** dönüştürür ve mobilin
 * `--color-*` "R G B" kanal formatına eşler. Çıktı tek dosya:
 *   `apps/mobile/src/theme/color-themes.generated.ts`
 *
 * NEDEN GENERATOR
 * ---------------
 * `13-ui-tasarim-dili.md` §13.7.7 + `02-teknoloji-kararlari.md` 2026-06-21:
 * 15 palet × (light+dark) × ~17 token elle senkronlanamaz; web tek-kaynak,
 * mobil iki token sistemi (`tokens.ts` JS hex + `global.css` RGB) bu tablodan
 * türetilir → DEM-177 manuel senkron borcu kapanır.
 *
 * KANAL FORMATI
 * -------------
 * NativeWind/Tailwind `rgb(var(--color-x) / <alpha-value>)` için değerler
 * boşlukla ayrılmış "R G B" (0-255) kanalı olmalı — `global.css` ile aynı.
 *
 * TOKEN EŞLEME (web override seti → mobil `--color-*`)
 * ---------------------------------------------------
 * Web her palette yalnız şu seti override eder:
 *   --background --foreground --card --card-foreground --popover
 *   --popover-foreground --muted --muted-foreground --secondary
 *   --secondary-foreground --accent --accent-foreground --border --input
 *   --primary --primary-foreground --ring
 * (--palet-* ve --board-* override EDİLMEZ.)
 *
 * Mobilin token yüzeyi daha geniş (primary-light/dark, surface-strong,
 * card-border, input-bg, border-soft, divider, tab-bar-bg, tab-inactive,
 * skeleton-*). Web'de doğrudan karşılığı olmayanlar paletin override
 * değerlerinden **türetilir** (aşağıdaki deriveMobileTokens).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { converter, parse } from 'culori';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(MOBILE_ROOT, '..', '..');
const THEME_CSS = resolve(REPO_ROOT, 'packages/ui/src/styles/theme.css');
const OUT_FILE = resolve(MOBILE_ROOT, 'src/theme/color-themes.generated.ts');

/** Üretilecek palet sırası — emerald varsayılan başta. */
const COLOR_THEMES = [
  'emerald',
  'slate',
  'zinc',
  'stone',
  'neutral',
  'rose',
  'red',
  'orange',
  'amber',
  'green',
  'blue',
  'cyan',
  'violet',
  'whatsapp',
  'discord',
] as const;

type ColorThemeName = (typeof COLOR_THEMES)[number];
type Mode = 'light' | 'dark';

/** Web override token'ları (parse hedefi). */
type WebTokens = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  input: string;
  primary: string;
  primaryForeground: string;
  // İhtiyaç-anına göre referans alınanlar:
  secondary: string;
  accent: string;
  ring: string;
};

/** Web CSS değişken adı → WebTokens anahtarı. */
const WEB_VAR_TO_KEY: Record<string, keyof WebTokens> = {
  '--background': 'background',
  '--foreground': 'foreground',
  '--card': 'card',
  '--card-foreground': 'cardForeground',
  '--muted': 'muted',
  '--muted-foreground': 'mutedForeground',
  '--border': 'border',
  '--input': 'input',
  '--primary': 'primary',
  '--primary-foreground': 'primaryForeground',
  '--secondary': 'secondary',
  '--accent': 'accent',
  '--ring': 'ring',
};

const toRgb = converter('rgb');

const clamp01 = (c: number) => Math.max(0, Math.min(1, c));
const to255 = (c: number) => Math.max(0, Math.min(255, Math.round(c * 255)));

/**
 * Tek bir CSS renk değerini (oklch / hex / rgb) "R G B" kanalına çevirir.
 *
 * Mobil kanal formatında alpha YOK (`rgb(var(--color-x) / <alpha-value>)`
 * alpha'yı Tailwind verir). Web dark `--border`/`--input` ise translucent
 * (`oklch(1 0 0 / 14%)`) — opak kanala çevirince çözünmez. Bu yüzden alpha < 1
 * ise verilen `over` rengi (paletin arka planı) üzerine **flatten** edilir →
 * web'de görünen kompozit renk korunur.
 */
function toChannels(cssColor: string, over?: string): string {
  const parsed = parse(cssColor.trim());
  if (!parsed) {
    throw new Error(`Renk parse edilemedi: "${cssColor}"`);
  }
  const rgb = toRgb(parsed);
  if (!rgb) {
    throw new Error(`sRGB'ye çevrilemedi: "${cssColor}"`);
  }
  const alpha = rgb.alpha ?? 1;
  if (alpha >= 1 || !over) {
    return `${to255(rgb.r)} ${to255(rgb.g)} ${to255(rgb.b)}`;
  }
  // Alpha kompoziti (source-over): out = src*α + bg*(1-α).
  const bg = toRgb(parse(over.trim())!)!;
  const comp = (s: number, b: number) => clamp01(s * alpha + b * (1 - alpha));
  return `${to255(comp(rgb.r, bg.r))} ${to255(comp(rgb.g, bg.g))} ${to255(comp(rgb.b, bg.b))}`;
}

/**
 * Belirli bir selector için `--var: value;` çiftlerini çıkarır.
 * `.dark[data-color-theme='X']` ararken `[data-color-theme='X']` ile
 * çakışmasını önlemek için light selector'da başında `.dark` OLMAMASINI
 * doğrularız.
 */
function extractBlock(css: string, theme: ColorThemeName, mode: Mode): Record<string, string> {
  const sel =
    mode === 'dark'
      ? `\\.dark\\[data-color-theme='${theme}'\\]`
      : `(?<!\\.dark)\\[data-color-theme='${theme}'\\]`;
  const blockRe = new RegExp(`${sel}\\s*\\{([^}]*)\\}`, 'm');
  const match = css.match(blockRe);
  const body = match?.[1];
  if (body === undefined) {
    throw new Error(`Blok bulunamadı: ${theme} / ${mode}`);
  }
  const vars: Record<string, string> = {};
  const varRe = /(--[a-z-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = varRe.exec(body)) !== null) {
    const name = m[1];
    const val = m[2];
    if (name !== undefined && val !== undefined) {
      vars[name.trim()] = val.trim();
    }
  }
  return vars;
}

/** Web ham var'larını WebTokens'a daraltır (eksik anahtar = hata). */
function toWebTokens(vars: Record<string, string>, theme: ColorThemeName, mode: Mode): WebTokens {
  const out: Partial<WebTokens> = {};
  for (const [cssVar, key] of Object.entries(WEB_VAR_TO_KEY)) {
    const raw = vars[cssVar];
    if (raw === undefined) {
      throw new Error(`Eksik token: ${cssVar} (${theme}/${mode})`);
    }
    out[key] = raw;
  }
  return out as WebTokens;
}

/**
 * Web token'larını mobilin `--color-*` "R G B" tablosuna çevirir.
 *
 * Doğrudan eşlenenler web override'tan; mobile-özel olanlar (primary-light/
 * dark, surface-strong, card-border, input-bg, border-soft, divider,
 * tab-bar-bg, tab-inactive, skeleton-*) web paletinden TÜRETİLİR:
 *   - primary-light = primary'i lightness +%8 (dark'ta +%6)
 *   - primary-dark  = primary'i lightness -%8
 *   - surface-strong = muted (bir tık daha doygun yüzey)
 *   - card-border   = border
 *   - input-bg      = card (form alanı kart yüzeyi)
 *   - border-soft   = muted (yumuşak ayraç)
 *   - divider       = border
 *   - tab-bar-bg    = card
 *   - tab-inactive  = muted-foreground
 *   - skeleton-base = muted, skeleton-highlight = background
 */
function deriveMobileTokens(
  web: WebTokens,
  mode: Mode,
): Record<`--color-${string}`, string> {
  const oklch = converter('oklch');

  // primary'i OKLCH uzayında lightness kaydırarak light/dark üret.
  const shiftLightness = (cssColor: string, delta: number): string => {
    const parsed = parse(cssColor);
    if (!parsed) throw new Error(`primary parse edilemedi: ${cssColor}`);
    const p = oklch(parsed);
    if (!p) throw new Error(`primary OKLCH'e çevrilemedi: ${cssColor}`);
    const l = Math.max(0, Math.min(1, (p.l ?? 0) + delta));
    return toChannels(`oklch(${l} ${p.c ?? 0} ${p.h ?? 0})`);
  };

  const lightDelta = mode === 'dark' ? 0.06 : 0.08;

  // Translucent border/input (dark'ta beyaz @ %14/16) kart yüzeyi üzerine
  // flatten edilir — mobil opak kanal web kompozitini korur.
  const border = toChannels(web.border, web.card);
  const input = toChannels(web.input, web.card);

  return {
    '--color-background': toChannels(web.background),
    '--color-foreground': toChannels(web.foreground),
    '--color-card': toChannels(web.card),
    '--color-card-foreground': toChannels(web.cardForeground),
    '--color-card-border': border,
    '--color-muted': toChannels(web.muted),
    '--color-muted-foreground': toChannels(web.mutedForeground),
    '--color-surface-strong': toChannels(web.muted),
    '--color-primary': toChannels(web.primary),
    '--color-primary-light': shiftLightness(web.primary, lightDelta),
    '--color-primary-dark': shiftLightness(web.primary, -0.08),
    '--color-primary-foreground': toChannels(web.primaryForeground),
    '--color-border': border,
    '--color-border-soft': toChannels(web.muted),
    '--color-divider': border,
    '--color-input-bg': input,
    '--color-tab-bar-bg': toChannels(web.card),
    '--color-tab-inactive': toChannels(web.mutedForeground),
    '--color-skeleton-base': toChannels(web.muted),
    '--color-skeleton-highlight': toChannels(web.background),
  };
}

function build(): void {
  const css = readFileSync(THEME_CSS, 'utf8');

  const table: Record<
    ColorThemeName,
    { light: Record<string, string>; dark: Record<string, string> }
  > = {} as never;

  for (const theme of COLOR_THEMES) {
    const lightWeb = toWebTokens(extractBlock(css, theme, 'light'), theme, 'light');
    const darkWeb = toWebTokens(extractBlock(css, theme, 'dark'), theme, 'dark');
    table[theme] = {
      light: deriveMobileTokens(lightWeb, 'light'),
      dark: deriveMobileTokens(darkWeb, 'dark'),
    };
  }

  const ts = renderModule(table);
  writeFileSync(OUT_FILE, ts, 'utf8');

  // Doğrulama kanıtı — emerald/blue/violet --primary değerlerini logla.
  for (const t of ['emerald', 'blue', 'violet'] as const) {
    // eslint-disable-next-line no-console
    console.log(
      `${t}: light --color-primary = ${table[t].light['--color-primary']} | dark = ${table[t].dark['--color-primary']}`,
    );
  }
  // eslint-disable-next-line no-console
  console.log(`\n✓ ${OUT_FILE} üretildi (${COLOR_THEMES.length} palet).`);
}

function renderRecord(rec: Record<string, string>, indent: string): string {
  return Object.entries(rec)
    .map(([k, v]) => `${indent}'${k}': '${v}',`)
    .join('\n');
}

function renderModule(
  table: Record<ColorThemeName, { light: Record<string, string>; dark: Record<string, string> }>,
): string {
  const themesLiteral = COLOR_THEMES.map((t) => `'${t}'`).join(', ');

  const entries = COLOR_THEMES.map((theme) => {
    const { light, dark } = table[theme];
    return `  ${theme}: {
    light: {
${renderRecord(light, '      ')}
    },
    dark: {
${renderRecord(dark, '      ')}
    },
  },`;
  }).join('\n');

  return `/**
 * color-themes.generated.ts — AUTO-GENERATED, ELLE DÜZENLEME.
 *
 * Üret: pnpm --filter @pusula/mobile exec tsx scripts/generate-color-themes.ts
 * Kaynak: packages/ui/src/styles/theme.css (web 15 renk paleti, oklch→rgb).
 *
 * Değerler "R G B" (0-255) kanal formatında — \`global.css\` + NativeWind
 * \`vars()\` ile aynı; \`rgb(var(--color-x) / <alpha-value>)\` ile tüketilir.
 * \`theme/tokens.ts\` \`themeFor(scheme, colorTheme)\` ve \`theme-provider\`
 * \`vars()\` override'ı bu tablodan beslenir.
 */

export const COLOR_THEMES = [${themesLiteral}] as const;

export type ColorThemeName = (typeof COLOR_THEMES)[number];

/** Varsayılan palet — web \`DEFAULT_COLOR_THEME\` simetriği. */
export const DEFAULT_COLOR_THEME: ColorThemeName = 'emerald';

/** Mobil \`--color-*\` token anahtarları (global.css ile birebir). */
export type ColorThemeVars = Record<\`--color-\${string}\`, string>;

/**
 * Her palet için light + dark mobil token tablosu. Değerler "R G B" kanalı.
 */
export const colorThemeVars: Record<
  ColorThemeName,
  { light: ColorThemeVars; dark: ColorThemeVars }
> = {
${entries}
};
`;
}

build();
