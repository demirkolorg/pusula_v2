/**
 * `plainTextToTiptap` testleri — Public API + Bot Erişimi (2026-07-13, Task 2).
 *
 * REST girişleri (kart açıklaması / yorum / checklist) hem Tiptap JSON hem düz
 * string kabul eder; düz string adapter'da minimal Tiptap dokümanına çevrilir.
 * Kanonik biçim tüm codebase'de aynı (`@pusula/ui` `parseRichTextValue`, mobil
 * `serializeTiptapDoc`): boş → tek boş paragraf; metin satırı → paragraph + text
 * düğümü; her `\n` bir yeni paragraph. Saf fonksiyon: I/O yok, node API yok.
 */
import { describe, expect, it } from 'vitest';
import { plainTextToTiptap } from './plain-text-to-tiptap';

describe('plainTextToTiptap', () => {
  it('returns a doc with a single empty paragraph for the empty string', () => {
    expect(plainTextToTiptap('')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
  });

  it('returns a doc with a single empty paragraph for whitespace-only input', () => {
    expect(plainTextToTiptap('   \t  ')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
  });

  it('wraps a single line in one paragraph with a text node', () => {
    expect(plainTextToTiptap('Merhaba dünya')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Merhaba dünya' }] }],
    });
  });

  it('maps each newline-separated line to its own paragraph', () => {
    expect(plainTextToTiptap('bir\niki\nüç')).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'bir' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'iki' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'üç' }] },
      ],
    });
  });

  it('normalises CRLF and represents blank interior lines as empty paragraphs', () => {
    expect(plainTextToTiptap('bir\r\n\r\niki')).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'bir' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'iki' }] },
      ],
    });
  });

  it('always returns a valid { type: "doc", content: [...] } root', () => {
    const doc = plainTextToTiptap('x');
    expect(doc.type).toBe('doc');
    expect(Array.isArray(doc.content)).toBe(true);
  });
});
