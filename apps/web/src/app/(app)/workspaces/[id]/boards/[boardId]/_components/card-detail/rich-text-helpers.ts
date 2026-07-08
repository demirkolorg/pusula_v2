import { parseRichTextValue, renderRichTextToHTML } from '@pusula/ui';

/**
 * True when two stored rich-text values (Tiptap JSON string or legacy plain
 * text) are *semantically* equal — i.e. their parsed Tiptap documents match.
 * Needed because a legacy plain-text value (`"hi"`) and its Tiptap JSON
 * serialisation (`'{"type":"doc",…}'`) compare unequal as raw strings, so a
 * naive `draft !== original` no-op check would always fire a useless mutation
 * (dirtying the activity feed + the "edited" stamp) when a legacy comment /
 * description is opened in the editor and saved without real changes.
 */
export const isSameRichText = (
  a: string | null | undefined,
  b: string | null | undefined,
): boolean => JSON.stringify(parseRichTextValue(a)) === JSON.stringify(parseRichTextValue(b));

/**
 * Copy a stored rich-text value (Tiptap JSON string or legacy plain text) to
 * the clipboard as both `text/html` (formatted paste into Word/Docs/e-mail) and
 * `text/plain` (tag-stripped fallback). Browsers without `ClipboardItem` get the
 * plain-text variant via `writeText`. Rejects when the clipboard write fails so
 * the caller can surface a toast. Shared by the description "Kopyala" action and
 * the comment context-menu "Kopyala" so both behave identically.
 */
export async function copyRichTextToClipboard(value: string | null | undefined): Promise<void> {
  const html = renderRichTextToHTML(value);
  // Plain-text fallback: strip tags via a detached element (no document append,
  // no XSS — innerHTML on a non-rendered element is safe for extraction).
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const plain = tmp.textContent ?? '';

  if (typeof window !== 'undefined' && typeof window.ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ]);
  } else {
    await navigator.clipboard.writeText(plain);
  }
}
