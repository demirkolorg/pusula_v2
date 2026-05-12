import { parseRichTextValue } from '@pusula/ui';

/**
 * True when two stored rich-text values (Tiptap JSON string or legacy plain
 * text) are *semantically* equal — i.e. their parsed Tiptap documents match.
 * Needed because a legacy plain-text value (`"hi"`) and its Tiptap JSON
 * serialisation (`'{"type":"doc",…}'`) compare unequal as raw strings, so a
 * naive `draft !== original` no-op check would always fire a useless mutation
 * (dirtying the activity feed + the "edited" stamp) when a legacy comment /
 * description is opened in the editor and saved without real changes.
 */
export const isSameRichText = (a: string | null | undefined, b: string | null | undefined): boolean =>
  JSON.stringify(parseRichTextValue(a)) === JSON.stringify(parseRichTextValue(b));
