import { describe, expect, it } from 'vitest';
import { activityLabel } from '../lib/activity-summary';
import { parseTiptapValue, tiptapHasContent } from '../lib/tiptap';

/** Faz 7F — kart detay saf helper birim testleri. */
describe('activityLabel', () => {
  it('bilinen tipi Türkçe etikete çevirir', () => {
    expect(activityLabel('card.created')).toBe('kartı oluşturdu');
    expect(activityLabel('comment.created')).toBe('yorum ekledi');
  });

  it('bilinmeyen tip için genel ifade döndürür', () => {
    expect(activityLabel('card.something_new')).toBe('bir işlem yaptı');
    expect(activityLabel('')).toBe('bir işlem yaptı');
  });
});

// `cards.description` / `comments.body` veritabanında STRING saklanır
// (Tiptap JSON serialize edilmiş ya da legacy düz metin) — testler gerçek
// depolama biçimini yansıtır.
const jsonDoc = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'merhaba' }] }],
});

describe('parseTiptapValue', () => {
  it('Tiptap JSON string → doc düğümü', () => {
    const node = parseTiptapValue(jsonDoc);
    expect(node?.type).toBe('doc');
  });

  it('legacy düz metni tek paragraflık doc\'a sarar', () => {
    const node = parseTiptapValue('eski düz metin');
    expect(node?.type).toBe('doc');
    expect(tiptapHasContent('eski düz metin')).toBe(true);
  });

  it('geçersiz JSON → düz metin olarak sarılır', () => {
    expect(parseTiptapValue('{bozuk json')?.type).toBe('doc');
  });

  it('boş string / null → null', () => {
    expect(parseTiptapValue('')).toBeNull();
    expect(parseTiptapValue('   ')).toBeNull();
    expect(parseTiptapValue(null)).toBeNull();
    expect(parseTiptapValue(undefined)).toBeNull();
  });

  it('obje girdiyi tolere eder (ileriye dönük)', () => {
    expect(parseTiptapValue({ type: 'doc', content: [] })?.type).toBe('doc');
  });
});

describe('tiptapHasContent', () => {
  it('metin içeren JSON string doc → true', () => {
    expect(tiptapHasContent(jsonDoc)).toBe(true);
  });

  it('mention içeren doc → true', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'mention', attrs: { label: 'ada' } }] }],
    });
    expect(tiptapHasContent(doc)).toBe(true);
  });

  it('boş paragraflı doc / boş string → false', () => {
    const empty = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(tiptapHasContent(empty)).toBe(false);
    expect(tiptapHasContent('')).toBe(false);
  });

  it('null / geçersiz girdi → false', () => {
    expect(tiptapHasContent(null)).toBe(false);
    expect(tiptapHasContent(undefined)).toBe(false);
  });
});
