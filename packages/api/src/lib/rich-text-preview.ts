/**
 * Tiptap doc / plain-text içeriğini düz metin önizlemesine indirger — bildirim,
 * aktivite ve realtime envelope payload'ları için (JSON.stringify çıktısı yerine
 * okunabilir metin). Comment gövdesi (Faz 6 — W1) ile checklist maddesi içeriği
 * (Faz — 2026-07-08 zengin metin) aynı yardımcıyı paylaşır.
 *
 * Parser ile aynı disiplin: yalnız kök seviyesinde (depth 0) JSON.parse denenir
 * (madde/gövde legacy düz metin veya Tiptap JSON string olabilir), depth-cap ile
 * kötü niyetli derin ağaç sınırlanır (mention-parser K1/K3 fix'iyle simetrik).
 * `text` düğümleri ve `mention` chip'leri (`@label`) düz metne çevrilir;
 * paragraph/list-item/heading arası tek boşluk konur ki okunaksız birleşme olmasın.
 */
export function richTextPreview(body: unknown, max = 200): string {
  const MAX_DEPTH = 32;
  const buf: string[] = [];

  const visit = (node: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    if (typeof node === 'string') {
      if (depth === 0) {
        const trimmed = node.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(node) as unknown;
            if (parsed && typeof parsed === 'object') {
              visit(parsed, depth + 1);
              return;
            }
          } catch {
            // Düz metin olarak değerlendir.
          }
        }
      }
      buf.push(node);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    if (rec.type === 'text' && typeof rec.text === 'string') {
      buf.push(rec.text);
    }
    if (rec.type === 'mention' && rec.attrs && typeof rec.attrs === 'object') {
      const attrs = rec.attrs as Record<string, unknown>;
      const label = typeof attrs.label === 'string' ? attrs.label : '';
      if (label) buf.push('@' + label);
    }
    if (Array.isArray(rec.content)) {
      const before = buf.length;
      for (const child of rec.content) visit(child, depth + 1);
      // Paragraph/list-item arası boşluk: aksi halde "Birinci paragrafIkinci"
      // şeklinde okunaksız olur.
      if (
        (rec.type === 'paragraph' || rec.type === 'listItem' || rec.type === 'heading') &&
        buf.length > before
      ) {
        buf.push(' ');
      }
    }
  };

  visit(body, 0);
  const flat = buf.join('').replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}
