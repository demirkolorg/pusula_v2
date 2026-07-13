/**
 * Düz metni minimal bir Tiptap `doc` dökümanına çevirir — Public API + Bot
 * Erişimi (2026-07-13, Task 2). REST girişleri (kart açıklaması / yorum /
 * checklist içeriği) hem Tiptap JSON hem düz string kabul eder; düz string bu
 * helper ile kanonik Tiptap dökümanına yükseltilir.
 *
 * Saf fonksiyon: I/O yok, `node:` API yok — domain barrel'ı üzerinden web/mobil
 * client bundle'ında da güvenle çalışır.
 *
 * Kanonik biçim tüm codebase'de aynıdır; yeni format icat edilmez:
 *  - `@pusula/ui` `parseRichTextValue`: boş → `{ type: 'doc', content: [{ type: 'paragraph' }] }`,
 *    metin → tek paragraph + text düğümü.
 *  - mobil `serializeTiptapDoc`: her `\n` bir paragraph; boş satır boş paragraph.
 *
 * Bu iki emsalin birleşimi:
 *  - Girdinin tamamı boş/yalnız-boşluk → tek boş paragraflı doc.
 *  - Aksi halde `\n` ile bölünür (CRLF normalize edilir); her satır bir
 *    paragraph — dolu satır text düğümlü, boş satır boş paragraph.
 *
 * Çıkış tüketimi: ham JSON hem de `richTextPreview` (`@pusula/api`) ile önizleme.
 */

/** Bir Tiptap `text` inline düğümü. */
export interface TiptapTextNode {
  readonly type: 'text';
  readonly text: string;
}

/** Bir Tiptap `paragraph` blok düğümü — boşsa `content` alanı taşımaz. */
export interface TiptapParagraphNode {
  readonly type: 'paragraph';
  readonly content?: readonly TiptapTextNode[];
}

/** Kök Tiptap `doc` düğümü. */
export interface TiptapDoc {
  readonly type: 'doc';
  readonly content: readonly TiptapParagraphNode[];
}

/** Tek boş paragraflı kanonik boş doc (yeni obje — mutasyon paylaşılmaz). */
function emptyDoc(): TiptapDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/**
 * Düz metni `{ type: 'doc', content: [...] }` Tiptap dökümanına çevirir.
 * Boş / yalnız-boşluk girdi tek boş paragraf döner; aksi halde her satır
 * (CRLF normalize) bir paragraph olur.
 */
export function plainTextToTiptap(plainText: string): TiptapDoc {
  if (plainText.trim().length === 0) return emptyDoc();

  const content: readonly TiptapParagraphNode[] = plainText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      line.length > 0
        ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
        : { type: 'paragraph' },
    );

  return { type: 'doc', content };
}
