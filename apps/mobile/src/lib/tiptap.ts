/**
 * Tiptap JSON saf yardımcıları — düğüm gezinme + içerik tespiti. React Native
 * bağımlılığı **yok**; render katmanı (`src/components/tiptap-render.tsx`)
 * bunları kullanır, böylece bu mantık birim test edilebilir kalır.
 */

export type TiptapNode = {
  type?: string;
  text?: string;
  content?: unknown[];
  marks?: unknown[];
  attrs?: Record<string, unknown>;
};

/** Bilinmeyen değeri düğüm nesnesine daraltır (değilse `null`). */
export function asTiptapNode(value: unknown): TiptapNode | null {
  return typeof value === 'object' && value !== null ? (value as TiptapNode) : null;
}

/** Düğümün geçerli çocuk düğümleri. */
export function tiptapChildren(node: TiptapNode): TiptapNode[] {
  if (!Array.isArray(node.content)) return [];
  return node.content
    .map(asTiptapNode)
    .filter((child): child is TiptapNode => child !== null);
}

/** Bir text düğümündeki mark tiplerinin kümesi (`bold` / `italic` / …). */
export function tiptapMarkTypes(node: TiptapNode): Set<string> {
  const set = new Set<string>();
  if (Array.isArray(node.marks)) {
    for (const raw of node.marks) {
      const mark = asTiptapNode(raw);
      if (mark?.type) set.add(mark.type);
    }
  }
  return set;
}

/**
 * Saklanan rich-text değerini Tiptap dökümanına çevirir.
 *
 * `cards.description` / `comments.body` veritabanında **string** kolonudur
 * (`text()`): ya Tiptap `getJSON()` serialize edilmiş JSON string'i, ya da
 * eski satırlarda düz metin. Web `@pusula/ui` `parseRichTextValue` ile aynı
 * davranış: JSON string `type: 'doc'` objesine çözülürse o kullanılır; düz
 * metin / geçersiz JSON tek paragraflık doc'a sarılır; boş değer `null`.
 * (Obje girdi de tolere edilir — ileriye dönük.)
 */
export function parseTiptapValue(value: unknown): TiptapNode | null {
  if (typeof value === 'object' && value !== null) return asTiptapNode(value);
  if (typeof value !== 'string') return null;
  if (value.trim().length === 0) return null;
  if (value.trim().startsWith('{')) {
    try {
      const node = asTiptapNode(JSON.parse(value));
      if (node?.type === 'doc') return node;
    } catch {
      // Geçerli JSON değil — aşağıda düz metin olarak ele alınır.
    }
  }
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
  };
}

/** Tiptap rich-text değerinde görünür içerik var mı (boş doc tespiti). */
export function tiptapHasContent(doc: unknown): boolean {
  const root = parseTiptapValue(doc);
  if (!root) return false;
  let found = false;
  const visit = (node: TiptapNode) => {
    if (found) return;
    if (node.type === 'text' && typeof node.text === 'string' && node.text.trim().length > 0) {
      found = true;
      return;
    }
    if (node.type === 'mention') {
      found = true;
      return;
    }
    for (const child of tiptapChildren(node)) visit(child);
  };
  visit(root);
  return found;
}
