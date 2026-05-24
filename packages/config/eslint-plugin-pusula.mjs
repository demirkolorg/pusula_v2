/**
 * Faz 13Q (DEM-273) — Pusula özel ESLint kuralları.
 *
 * Şu an tek kural: `no-hardcoded-text-in-reports`. Reports modülünde
 * (`apps/web/src/components/reports/**`, `packages/ui/src/reports/**`)
 * JSX text literal'ı veya kullanıcıya görünür string attribute'u (`title`,
 * `aria-label`, `placeholder`, `alt`) hardcode yazılmasını engeller —
 * i18n key kullanmaya zorlar.
 *
 * Plugin formatı: ESLint v9 flat-config + CommonJS-style rule object.
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §12 (i18n stratejisi)
 *       + CLAUDE.md §2 #8 ("UI bileşenleri hardcode metin içermez").
 */

/**
 * Reports modülündeki dosyaları tespit eder (Windows path ayraçlarına
 * dayanıklı). Test dosyaları (`__tests__/` veya `*.test.*`) muaf.
 * Test edilebilirlik için named export.
 */
export function isReportsModuleFile(filename) {
  const normalized = filename.replace(/\\/g, '/');
  if (!/(components\/reports\/|ui\/src\/reports\/)/.test(normalized)) {
    return false;
  }
  if (/__tests__\/|\.test\.[tj]sx?$/.test(normalized)) {
    return false;
  }
  return true;
}

/**
 * Bir string'in hardcode metin sayılıp sayılmadığını belirler. Sayı,
 * salt punctuation, salt emoji, tek karakterlik whitespace, salt `&nbsp;`-
 * benzeri özel karakterler muaf. Test edilebilirlik için named export.
 */
export function looksLikeHardcodedText(text) {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  // Tek karakter ve sembol — muaf.
  if (trimmed.length === 1) return false;
  // Salt rakam / salt punctuation / salt sembol.
  if (/^[\d\s.,;:!?\-()&%$+*/=<>–—…↑↓Δ]+$/.test(trimmed)) {
    return false;
  }
  // Salt emoji (Unicode property — Node 16+ destekler).
  if (/^[\p{Emoji}\s]+$/u.test(trimmed)) return false;
  // En az bir harf içermeli (aksi halde sembolik).
  if (!/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(trimmed)) return false;
  return true;
}

const VISIBLE_STRING_ATTRIBUTES = new Set([
  'title',
  'aria-label',
  'aria-description',
  'alt',
  'placeholder',
]);

const noHardcodedTextInReports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Reports modülünde JSX text literal yasak — i18n için t(key) kullanın.',
      recommended: true,
    },
    schema: [],
    messages: {
      jsxText:
        'Hardcode metin "{{snippet}}" — t() ile i18n key kullanın (reports modülünde hardcode UI metni yasak).',
      attribute:
        'JSX attribute "{{name}}" hardcode metin içeriyor — t() ile i18n key kullanın.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isReportsModuleFile(filename)) {
      return {};
    }
    return {
      JSXText(node) {
        if (!looksLikeHardcodedText(node.value)) return;
        context.report({
          node,
          messageId: 'jsxText',
          data: { snippet: node.value.trim().slice(0, 40) },
        });
      },
      JSXAttribute(node) {
        const name = node.name?.name;
        if (typeof name !== 'string') return;
        if (!VISIBLE_STRING_ATTRIBUTES.has(name)) return;
        const value = node.value;
        if (!value) return;
        if (value.type !== 'Literal') return;
        if (typeof value.value !== 'string') return;
        if (!looksLikeHardcodedText(value.value)) return;
        context.report({
          node: value,
          messageId: 'attribute',
          data: { name },
        });
      },
    };
  },
};

/**
 * ESLint v9 flat-config plugin objesi. `plugins: { pusula: pluginPusula }`
 * + `rules: { 'pusula/no-hardcoded-text-in-reports': 'error' }` ile etkin.
 */
export default {
  meta: {
    name: 'eslint-plugin-pusula',
    version: '0.0.1',
  },
  rules: {
    'no-hardcoded-text-in-reports': noHardcodedTextInReports,
  },
};
