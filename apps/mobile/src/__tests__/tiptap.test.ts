import { describe, expect, it } from 'vitest';
import {
  asTiptapNode,
  parseTiptapValue,
  serializeTiptapDoc,
  tiptapChildren,
  tiptapHasContent,
  tiptapMarkTypes,
  tiptapToPlainText,
  type TiptapNode,
} from '../lib/tiptap';

/**
 * Faz 7N — `tiptap.ts` saf Tiptap JSON yardımcıları birim testleri.
 * Düğüm gezinme, parse/serialize round-trip, düz metin indirgeme ve boş
 * doküman tespiti; React Native bağımlılığı yok.
 */

/** Düz metin → doc string → düz metin round-trip için tek paragraflık doc. */
function paragraph(text: string): TiptapNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

describe('asTiptapNode', () => {
  it('nesne değeri düğüm olarak daraltır', () => {
    const node = { type: 'doc' };
    expect(asTiptapNode(node)).toBe(node);
  });

  it('null / undefined için null döndürür', () => {
    expect(asTiptapNode(null)).toBeNull();
    expect(asTiptapNode(undefined)).toBeNull();
  });

  it('string / sayı / boolean için null döndürür', () => {
    expect(asTiptapNode('metin')).toBeNull();
    expect(asTiptapNode(42)).toBeNull();
    expect(asTiptapNode(true)).toBeNull();
  });

  it('dizi de bir nesnedir — daraltır (gezinme katmanı diziyi tolere eder)', () => {
    const arr: unknown[] = [];
    expect(asTiptapNode(arr)).toBe(arr);
  });
});

describe('tiptapChildren', () => {
  it('content dizisindeki geçerli düğümleri döndürür', () => {
    const node: TiptapNode = {
      type: 'doc',
      content: [{ type: 'paragraph' }, { type: 'heading' }],
    };
    expect(tiptapChildren(node)).toHaveLength(2);
    expect(tiptapChildren(node)[0]?.type).toBe('paragraph');
  });

  it('content yoksa boş dizi döndürür', () => {
    expect(tiptapChildren({ type: 'paragraph' })).toEqual([]);
  });

  it('content dizi değilse boş dizi döndürür', () => {
    expect(tiptapChildren({ type: 'doc', content: 'bozuk' as unknown as unknown[] })).toEqual([]);
  });

  it('content içindeki geçersiz (nesne olmayan) elemanları eler', () => {
    const node: TiptapNode = {
      type: 'doc',
      content: ['metin', 7, null, { type: 'paragraph' }],
    };
    expect(tiptapChildren(node)).toHaveLength(1);
    expect(tiptapChildren(node)[0]?.type).toBe('paragraph');
  });
});

describe('tiptapMarkTypes', () => {
  it('text düğümündeki mark tiplerini küme olarak döndürür', () => {
    const node: TiptapNode = {
      type: 'text',
      text: 'kalın',
      marks: [{ type: 'bold' }, { type: 'italic' }],
    };
    const types = tiptapMarkTypes(node);
    expect(types.has('bold')).toBe(true);
    expect(types.has('italic')).toBe(true);
    expect(types.size).toBe(2);
  });

  it('marks yoksa boş küme döndürür', () => {
    expect(tiptapMarkTypes({ type: 'text', text: 'sade' }).size).toBe(0);
  });

  it('aynı mark tipi yinelenirse küme tekilleştirir', () => {
    const node: TiptapNode = {
      type: 'text',
      marks: [{ type: 'bold' }, { type: 'bold' }],
    };
    expect(tiptapMarkTypes(node).size).toBe(1);
  });

  it('tip taşımayan veya geçersiz mark elemanlarını eler', () => {
    const node: TiptapNode = {
      type: 'text',
      marks: [{ type: 'bold' }, {}, 'bozuk', null],
    };
    expect([...tiptapMarkTypes(node)]).toEqual(['bold']);
  });
});

describe('parseTiptapValue', () => {
  it('JSON string olarak serialize edilmiş doc objesini çözer', () => {
    const json = JSON.stringify({ type: 'doc', content: [paragraph('merhaba')] });
    const parsed = parseTiptapValue(json);
    expect(parsed?.type).toBe('doc');
    expect(tiptapChildren(parsed!)).toHaveLength(1);
  });

  it('düz metni tek paragraflık doc objesine sarar', () => {
    const parsed = parseTiptapValue('sadece düz metin');
    expect(parsed?.type).toBe('doc');
    expect(tiptapToPlainText(parsed)).toBe('sadece düz metin');
  });

  it('geçersiz JSON ({ ile başlayan bozuk string) düz metin olarak sarılır', () => {
    const parsed = parseTiptapValue('{bozuk json');
    expect(parsed?.type).toBe('doc');
    expect(tiptapToPlainText(parsed)).toBe('{bozuk json');
  });

  it('doc olmayan geçerli JSON ({ "type": "paragraph" }) düz metin olarak sarılır', () => {
    const parsed = parseTiptapValue('{"type":"paragraph"}');
    expect(parsed?.type).toBe('doc');
    // Doc'a çözülemedi → ham string tek paragrafa kondu.
    expect(tiptapToPlainText(parsed)).toBe('{"type":"paragraph"}');
  });

  it('boş / yalnız boşluk string için null döndürür', () => {
    expect(parseTiptapValue('')).toBeNull();
    expect(parseTiptapValue('   ')).toBeNull();
    expect(parseTiptapValue('\n\t')).toBeNull();
  });

  it('null / undefined / sayı için null döndürür', () => {
    expect(parseTiptapValue(null)).toBeNull();
    expect(parseTiptapValue(undefined)).toBeNull();
    expect(parseTiptapValue(123)).toBeNull();
  });

  it('doğrudan obje girdiyi tolere eder (ileriye dönük)', () => {
    const doc: TiptapNode = { type: 'doc', content: [paragraph('obje')] };
    expect(parseTiptapValue(doc)).toBe(doc);
  });
});

describe('serializeTiptapDoc', () => {
  it('düz metni doc JSON string olarak serialize eder', () => {
    const json = serializeTiptapDoc('tek satır');
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe('doc');
    expect(parsed.content).toHaveLength(1);
    expect(parsed.content[0].content[0].text).toBe('tek satır');
  });

  it('her satırı ayrı paragrafa böler', () => {
    const parsed = JSON.parse(serializeTiptapDoc('birinci\nikinci\nüçüncü'));
    expect(parsed.content).toHaveLength(3);
  });

  it('boş satırı içeriksiz paragraf olarak yazar', () => {
    const parsed = JSON.parse(serializeTiptapDoc('üst\n\nalt'));
    expect(parsed.content).toHaveLength(3);
    expect(parsed.content[1]).toEqual({ type: 'paragraph' });
  });

  it('CRLF satır sonlarını LF olarak normalize eder', () => {
    const parsed = JSON.parse(serializeTiptapDoc('win\r\nsatır'));
    expect(parsed.content).toHaveLength(2);
    expect(parsed.content[0].content[0].text).toBe('win');
  });

  it('boş string tek boş paragraflık doc üretir', () => {
    const parsed = JSON.parse(serializeTiptapDoc(''));
    expect(parsed.content).toEqual([{ type: 'paragraph' }]);
  });
});

describe('tiptapToPlainText', () => {
  it('paragraf metnini düz metne indirger', () => {
    const doc: TiptapNode = { type: 'doc', content: [paragraph('selam dünya')] };
    expect(tiptapToPlainText(doc)).toBe('selam dünya');
  });

  it('birden çok bloğu satır sonuyla birleştirir', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [paragraph('birinci'), { type: 'heading', content: [{ type: 'text', text: 'başlık' }] }],
    };
    expect(tiptapToPlainText(doc)).toBe('birinci\nbaşlık');
  });

  it('hardBreak düğümünü satır sonuna çevirir', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'üst' }, { type: 'hardBreak' }, { type: 'text', text: 'alt' }] },
      ],
    };
    expect(tiptapToPlainText(doc)).toBe('üst\nalt');
  });

  it('mention düğümünü @etiket olarak düzleştirir', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'mention', attrs: { label: 'ali' } }] },
      ],
    };
    expect(tiptapToPlainText(doc)).toBe('@ali');
  });

  it('label taşımayan mention boş metne indirgenir', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'mention', attrs: {} }] }],
    };
    expect(tiptapToPlainText(doc)).toBe('');
  });

  it('liste / blockquote gibi sarmalayıcılara iner', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('madde 1')] },
            { type: 'listItem', content: [paragraph('madde 2')] },
          ],
        },
      ],
    };
    expect(tiptapToPlainText(doc)).toBe('madde 1\nmadde 2');
  });

  it('horizontalRule görünmez — hiç satır üretmez (komşu paragraflar tek \\n ile birleşir)', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [paragraph('üst'), { type: 'horizontalRule' }, paragraph('alt')],
    };
    expect(tiptapToPlainText(doc)).toBe('üst\nalt');
  });

  it('codeBlock içeriğini düz metne indirger', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'kod()' }] }],
    };
    expect(tiptapToPlainText(doc)).toBe('kod()');
  });

  it('null / boş / geçersiz girdi için boş string döndürür', () => {
    expect(tiptapToPlainText(null)).toBe('');
    expect(tiptapToPlainText('')).toBe('');
    expect(tiptapToPlainText(undefined)).toBe('');
    expect(tiptapToPlainText('   ')).toBe('');
  });

  it('düz metin string girdiyi olduğu gibi indirger', () => {
    expect(tiptapToPlainText('eski satır metni')).toBe('eski satır metni');
  });

  it('serializeTiptapDoc ile round-trip metni korur', () => {
    const original = 'birinci satır\nikinci satır';
    expect(tiptapToPlainText(serializeTiptapDoc(original))).toBe(original);
  });

  it('baştaki/sondaki boş satırlar trim ile temizlenir', () => {
    const json = serializeTiptapDoc('\n\norta\n\n');
    expect(tiptapToPlainText(json)).toBe('orta');
  });
});

describe('tiptapHasContent', () => {
  it('görünür metin içeren doc için true', () => {
    const doc: TiptapNode = { type: 'doc', content: [paragraph('dolu')] };
    expect(tiptapHasContent(doc)).toBe(true);
  });

  it('mention içeren doc için true', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'mention', attrs: { label: 'x' } }] }],
    };
    expect(tiptapHasContent(doc)).toBe(true);
  });

  it('boş paragraflar dizisi içeren doc için false', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{ type: 'paragraph' }, { type: 'paragraph' }],
    };
    expect(tiptapHasContent(doc)).toBe(false);
  });

  it('yalnız boşluk metni olan doc için false', () => {
    const doc: TiptapNode = { type: 'doc', content: [paragraph('   ')] };
    expect(tiptapHasContent(doc)).toBe(false);
  });

  it('null / boş string / undefined için false', () => {
    expect(tiptapHasContent(null)).toBe(false);
    expect(tiptapHasContent('')).toBe(false);
    expect(tiptapHasContent(undefined)).toBe(false);
  });

  it('serializeTiptapDoc boş doc çıktısı için false', () => {
    expect(tiptapHasContent(serializeTiptapDoc(''))).toBe(false);
  });

  it('serializeTiptapDoc dolu doc çıktısı için true', () => {
    expect(tiptapHasContent(serializeTiptapDoc('içerik var'))).toBe(true);
  });

  it('düz metin string girdi için true', () => {
    expect(tiptapHasContent('eski düz metin')).toBe(true);
  });
});
