/**
 * Faz 13Q (DEM-273) — `eslint-plugin-pusula` helper unit testleri.
 *
 * `isReportsModuleFile` ve `looksLikeHardcodedText` saf fonksiyonlar —
 * ESLint Linter API gerektirmeden direkt test edilir. Gerçek rule
 * davranışı `pnpm lint` smoke ile ayrıca doğrulanır (CI).
 */
// @ts-expect-error -- ESM .mjs plugin'i CommonJS-like default export sunmuyor;
// tipler için `.d.mts` yok, ama runtime davranışı doğrulamak için bu yeterli.
import { isReportsModuleFile, looksLikeHardcodedText } from '@pusula/config/eslint-plugin-pusula';
import { describe, expect, it } from 'vitest';

describe('eslint-plugin-pusula / isReportsModuleFile', () => {
  it('apps/web reports component dosyalarını yakalar', () => {
    expect(isReportsModuleFile('apps/web/src/components/reports/panel/report-panel.tsx')).toBe(
      true,
    );
  });

  it('packages/ui reports primitive dosyalarını yakalar', () => {
    expect(isReportsModuleFile('packages/ui/src/reports/primitives/empty-state.tsx')).toBe(
      true,
    );
  });

  it('Windows path ayraçlarına dayanır', () => {
    expect(
      isReportsModuleFile(
        'D:\\projects\\pusula_v2\\apps\\web\\src\\components\\reports\\panel\\foo.tsx',
      ),
    ).toBe(true);
  });

  it('test dosyaları (__tests__/) muaf', () => {
    expect(
      isReportsModuleFile(
        'apps/web/src/components/reports/__tests__/preset-picker.test.tsx',
      ),
    ).toBe(false);
  });

  it('reports modülü dışı dosyaları reddeder', () => {
    expect(isReportsModuleFile('apps/web/src/components/board/board.tsx')).toBe(false);
    expect(isReportsModuleFile('packages/api/src/routers/report.ts')).toBe(false);
  });
});

describe('eslint-plugin-pusula / looksLikeHardcodedText', () => {
  it('boş string + whitespace muaf', () => {
    expect(looksLikeHardcodedText('')).toBe(false);
    expect(looksLikeHardcodedText('   ')).toBe(false);
    expect(looksLikeHardcodedText('\n\t')).toBe(false);
  });

  it('tek karakter muaf (parantez, ayraç, vs.)', () => {
    expect(looksLikeHardcodedText('a')).toBe(false);
    expect(looksLikeHardcodedText(':')).toBe(false);
  });

  it('salt sayı / salt punctuation muaf', () => {
    expect(looksLikeHardcodedText('5')).toBe(false);
    expect(looksLikeHardcodedText('42')).toBe(false);
    expect(looksLikeHardcodedText('+5%')).toBe(false);
    expect(looksLikeHardcodedText('—')).toBe(false);
    expect(looksLikeHardcodedText('↑↓')).toBe(false);
    expect(looksLikeHardcodedText('Δ')).toBe(false);
  });

  it('salt emoji muaf', () => {
    expect(looksLikeHardcodedText('📊')).toBe(false);
    expect(looksLikeHardcodedText('✅ ')).toBe(false);
  });

  it('Türkçe + İngilizce kullanıcı metnini yakalar', () => {
    expect(looksLikeHardcodedText('Önizle')).toBe(true);
    expect(looksLikeHardcodedText('Preview report')).toBe(true);
    expect(looksLikeHardcodedText('Şablon Seç')).toBe(true);
  });

  it('text + sayı karışımını yakalar', () => {
    expect(looksLikeHardcodedText('5 micro-report')).toBe(true);
    expect(looksLikeHardcodedText('Faz 13Q')).toBe(true);
  });
});
