'use client';

import * as React from 'react';
import { useEditor, EditorContent, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  BoldIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  StrikethroughIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';

/** A parsed Tiptap document (root `doc` node). */
type TiptapDoc = JSONContent & { type: 'doc' };

/**
 * Parse a stored `description` / `body` string into a Tiptap document. Storage
 * is Tiptap `getJSON()` serialised to a string; legacy rows hold plain text. If
 * the string parses to an object with `type: 'doc'` we use it as-is; otherwise
 * (plain text, empty, or invalid JSON) we wrap the text in a single paragraph.
 * This is the parse-time fallback that lets us skip a migration.
 */
export function parseRichTextValue(value: string | null | undefined): TiptapDoc {
  const text = value ?? '';
  if (text.trim().length === 0) return { type: 'doc', content: [{ type: 'paragraph' }] };
  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { type?: unknown }).type === 'doc'
    ) {
      return parsed as TiptapDoc;
    }
  } catch {
    // not JSON — treat as plain text below
  }
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

/** Serialise an editor's current document to the stored string form. */
export function serializeRichTextValue(editor: Editor): string {
  return JSON.stringify(editor.getJSON());
}

/** True when the editor holds no meaningful content (only empty paragraphs). */
export function isRichTextEmpty(editor: Editor): boolean {
  return editor.getText().trim().length === 0;
}

/** Localised labels for the toolbar buttons + placeholder — no hardcoded copy. */
export interface RichTextEditorLabels {
  bold: string;
  italic: string;
  strike: string;
  code: string;
  heading1: string;
  heading2: string;
  heading3: string;
  bulletList: string;
  orderedList: string;
  link: string;
  /** Window prompt asking for the link URL (mini editors may omit headings/lists). */
  linkPrompt: string;
}

/**
 * Allowlist of URI schemes a link mark may carry. Anything else — most
 * importantly `javascript:` (and `data:`, `vbscript:`, …) — is rejected, so a
 * hand-crafted `card.update` / `comment.*` payload can't smuggle a clickable
 * `javascript:` URL into the read-only renderer (stored XSS).
 */
const ALLOWED_LINK_URI = /^(?:https?|mailto):/i;

/** Same allowlist, restricted to schemes the autolinker may apply unprompted. */
const ALLOWED_AUTOLINK_URI = /^https?:/i;

/**
 * StarterKit options for our editors: H1–H3 only, plus the bundled `link`
 * extension (Tiptap v3 — `link` is part of StarterKit and accepts
 * `Partial<LinkOptions>`) configured to be safe:
 *  - `openOnClick: false` — never navigate from inside the editor;
 *  - `autolink` on, but `shouldAutoLink` restricts it to `http(s):`;
 *  - safe `rel`/`target`;
 *  - `protocols` allowlist + an explicit `isAllowedUri` so a stored
 *    `javascript:` href is dropped/blanked on render (`renderHTML` calls
 *    `isAllowedUri` and emits `href=""` when it returns `false`), and
 *    `parseHTML`/`setLink` reject it too.
 * (XSS: content is also produced by Tiptap's controlled schema and rendered via
 * `EditorContent`, never `dangerouslySetInnerHTML`.) The exact same options
 * back both `RichTextEditor` and the read-only `RichTextContent`.
 */
function starterKitOptions() {
  return {
    heading: { levels: [1, 2, 3] as [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      protocols: ['http', 'https', 'mailto'] as string[],
      isAllowedUri: (uri: string) => ALLOWED_LINK_URI.test(uri),
      shouldAutoLink: (url: string) => ALLOWED_AUTOLINK_URI.test(url),
    },
  };
}

function buildExtensions(placeholder: string) {
  return [StarterKit.configure(starterKitOptions()), Placeholder.configure({ placeholder })];
}

/** Shared editor surface styling (matches the design tokens; no Tailwind Typography plugin). */
const PROSE_CLASS =
  'max-w-none text-sm break-words focus:outline-none [&_p]:my-1 [&_h1]:mt-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-medium [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:text-xs [&_pre]:max-w-full [&_pre]:overflow-x-auto';

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function ToolbarButton({ label, active = false, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none [&_svg]:size-3.5',
        active && 'bg-accent text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />;
}

export interface RichTextEditorProps {
  /** Stored value (Tiptap JSON string or legacy plain text); `null` ⇒ empty. */
  value: string | null;
  placeholder: string;
  labels: RichTextEditorLabels;
  disabled?: boolean;
  /** `full` shows headings + lists; `mini` shows only bold/italic/link. */
  toolbar?: 'full' | 'mini';
  /** Optional aria-label for the editable region. */
  ariaLabel?: string;
  /**
   * Called whenever the document changes — receives `(serialisedValue, isEmpty)`.
   * `serialisedValue` is the Tiptap JSON string; callers typically store `''`
   * instead when `isEmpty` so a "no description" placeholder still works.
   */
  onChange?: (serializedValue: string, isEmpty: boolean) => void;
  className?: string;
}

/**
 * Editable rich-text field built on Tiptap (headless). A small sticky toolbar
 * (bold / italic / strike / code · headings · bullet / ordered · link in `full`;
 * bold / italic / link in `mini`) plus the editable content area. Entity-
 * agnostic and i18n-ready: all visible copy (placeholder, button labels, link
 * prompt) is passed in via props — there is no hardcoded text. Re-renders to the
 * incoming `value` when it changes externally (e.g. after a save resets it).
 */
export function RichTextEditor({
  value,
  placeholder,
  labels,
  disabled = false,
  toolbar = 'full',
  ariaLabel,
  onChange,
  className,
}: RichTextEditorProps) {
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: buildExtensions(placeholder),
    content: parseRichTextValue(value),
    editorProps: {
      attributes: {
        class: cn(PROSE_CLASS, 'min-h-[2.5rem] px-3 py-2'),
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
      },
    },
    onUpdate({ editor: ed }) {
      onChangeRef.current?.(serializeRichTextValue(ed), isRichTextEmpty(ed));
    },
  });

  // Keep the editor in sync with external value changes (e.g. server reset).
  React.useEffect(() => {
    if (!editor) return;
    const next = parseRichTextValue(value);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [value, editor]);

  React.useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) {
    return (
      <div
        data-slot="rich-text-editor"
        className={cn('rounded-md border bg-card', className)}
        aria-busy
      />
    );
  }

  const setLink = () => {
    const previous = (editor.getAttributes('link') as { href?: string }).href ?? '';
    const url = window.prompt(labels.linkPrompt, previous);
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  return (
    <div
      data-slot="rich-text-editor"
      className={cn(
        'overflow-hidden rounded-md border bg-card',
        disabled && 'opacity-60',
        className,
      )}
    >
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b bg-card px-1 py-1">
        <ToolbarButton
          label={labels.bold}
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon />
        </ToolbarButton>
        <ToolbarButton
          label={labels.italic}
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon />
        </ToolbarButton>
        <ToolbarButton
          label={labels.strike}
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <StrikethroughIcon />
        </ToolbarButton>
        <ToolbarButton
          label={labels.code}
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <CodeIcon />
        </ToolbarButton>
        {toolbar === 'full' && (
          <>
            <Divider />
            <ToolbarButton
              label={labels.heading1}
              active={editor.isActive('heading', { level: 1 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              <Heading1Icon />
            </ToolbarButton>
            <ToolbarButton
              label={labels.heading2}
              active={editor.isActive('heading', { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2Icon />
            </ToolbarButton>
            <ToolbarButton
              label={labels.heading3}
              active={editor.isActive('heading', { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              <Heading3Icon />
            </ToolbarButton>
            <Divider />
            <ToolbarButton
              label={labels.bulletList}
              active={editor.isActive('bulletList')}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <ListIcon />
            </ToolbarButton>
            <ToolbarButton
              label={labels.orderedList}
              active={editor.isActive('orderedList')}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrderedIcon />
            </ToolbarButton>
          </>
        )}
        <Divider />
        <ToolbarButton label={labels.link} active={editor.isActive('link')} onClick={setLink}>
          <Link2Icon />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export interface RichTextContentProps {
  /** Stored value (Tiptap JSON string or legacy plain text); `null`/empty ⇒ renders nothing. */
  value: string | null;
  className?: string;
}

/**
 * Read-only renderer for stored rich text. Uses a non-editable Tiptap editor so
 * the output goes through the same controlled schema as the editor — no
 * `dangerouslySetInnerHTML`, no separate sanitiser. When the value is empty it
 * renders `null` (callers show their own "no description" placeholder).
 */
export function RichTextContent({ value, className }: RichTextContentProps) {
  const doc = React.useMemo(() => parseRichTextValue(value), [value]);
  const empty = React.useMemo(() => {
    const content = doc.content;
    if (!Array.isArray(content) || content.length === 0) return true;
    // Empty when every node is a paragraph with no children.
    return content.every(
      (node) =>
        typeof node === 'object' &&
        node !== null &&
        (node as { type?: unknown }).type === 'paragraph' &&
        ((node as { content?: unknown[] }).content?.length ?? 0) === 0,
    );
  }, [doc]);

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: false,
      extensions: [StarterKit.configure(starterKitOptions())],
      content: doc,
    },
    [doc],
  );

  if (empty || !editor) return null;

  return (
    <div data-slot="rich-text-content" className={cn(PROSE_CLASS, className)}>
      <EditorContent editor={editor} />
    </div>
  );
}
