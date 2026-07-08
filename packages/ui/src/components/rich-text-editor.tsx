'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, type Editor, type JSONContent } from '@tiptap/react';
import { generateHTML } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import type { SuggestionProps } from '@tiptap/suggestion';
import {
  BoldIcon,
  CheckIcon,
  ChevronDownIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  PilcrowIcon,
  StrikethroughIcon,
  TypeIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

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
  /** Tooltip + aria-label for the text-style dropdown trigger (the "T" button). */
  textStyle: string;
  /** "Normal text" option inside the text-style dropdown (clears any heading). */
  paragraph: string;
  heading1: string;
  heading2: string;
  heading3: string;
  bulletList: string;
  orderedList: string;
  link: string;
  /** Window prompt asking for the link URL (mini editors may omit headings/lists). */
  linkPrompt: string;
}

/** One mentionable user (board / workspace member with access to the current scope). */
export interface MentionUser {
  /** Stable user id — serialised into `attrs.id` of the mention node. */
  id: string;
  /** Display name shown in the popup and inside the rendered chip. */
  label: string;
}

/**
 * Suggestion data source for the @mention picker. The editor calls `search`
 * synchronously on every keystroke; the caller pre-loads members (e.g. via
 * `board.members.list`) and filters in-memory. The result is capped at 8 items.
 */
export interface MentionSource {
  search: (query: string) => MentionUser[];
  /** Shown when the search returns no items (entity-bag­no­stic copy). */
  emptyLabel: string;
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

/**
 * Shared Mention node configuration. The node renders an inline chip with
 * `data-mention-id` (so cache invalidation / notification tooling can pick it
 * up later) and the user's display name prefixed by `@`. The same options
 * back both the editor and the read-only renderer so a stored mention round-
 * trips byte-for-byte. Backend parser (`packages/api/src/lib/mention-parser.ts`)
 * already recognises `{ type: 'mention', attrs: { id, label } }`.
 */
function mentionNodeOptions() {
  return {
    HTMLAttributes: {
      class:
        'rounded-sm bg-primary/10 px-1 py-0.5 text-primary font-medium no-underline whitespace-nowrap',
    },
    renderText({ node }: { node: { attrs: { id?: string | null; label?: string | null } } }) {
      const label = node.attrs.label ?? node.attrs.id ?? '';
      return `@${label}`;
    },
  };
}

function buildExtensions(placeholder: string, mentions?: MentionSuggestionWire) {
  const base = [StarterKit.configure(starterKitOptions()), Placeholder.configure({ placeholder })];
  if (mentions) {
    base.push(
      Mention.configure({
        ...mentionNodeOptions(),
        suggestion: mentions,
      }) as never,
    );
  }
  return base;
}

/** Same as `buildExtensions` but read-only — no Placeholder / suggestion. */
function buildContentExtensions() {
  return [StarterKit.configure(starterKitOptions()), Mention.configure(mentionNodeOptions())];
}

/**
 * Render a stored Tiptap value (JSON string or legacy plain text) to HTML using
 * the same extension set as `RichTextContent` — so the rendered tree mirrors
 * what the modal shows (link sanitisation + mention chip + heading levels). Used
 * by the description "Kopyala" + "Word olarak indir" actions (FE-2026-05-31-002).
 * Empty values render an empty string (callers decide what to do with that).
 */
export function renderRichTextToHTML(value: string | null | undefined): string {
  const doc = parseRichTextValue(value);
  return generateHTML(doc, buildContentExtensions());
}

/**
 * Reduce a stored Tiptap value (JSON string or legacy plain text) to plain text —
 * for `aria-label`s, previews, and any non-visual consumer that must never leak
 * raw Tiptap JSON. Mirrors the server `richTextPreview` and the mobile
 * `tiptapToPlainText`: `text` nodes plus `@mention` labels, block nodes
 * (paragraph / list-item / heading) separated by a single space. Formatting
 * (bold / list markers / links) is dropped. Empty values yield `''`.
 */
export function richTextToPlainText(value: string | null | undefined): string {
  const parts: string[] = [];
  const visit = (node: JSONContent): void => {
    if (node.type === 'text' && typeof node.text === 'string') {
      parts.push(node.text);
      return;
    }
    if (node.type === 'mention') {
      const label = node.attrs?.label;
      if (typeof label === 'string' && label) parts.push('@' + label);
      return;
    }
    const children = node.content;
    if (!Array.isArray(children)) return;
    const before = parts.length;
    for (const child of children) visit(child);
    if (
      (node.type === 'paragraph' || node.type === 'listItem' || node.type === 'heading') &&
      parts.length > before
    ) {
      parts.push(' ');
    }
  };
  visit(parseRichTextValue(value));
  return parts.join('').replace(/\s+/g, ' ').trim();
}

/** Tiptap suggestion configuration the editor actually consumes. */
type MentionSuggestionWire = {
  char: string;
  items: (props: { query: string }) => MentionUser[];
  render: () => {
    onStart: (props: SuggestionProps<MentionUser>) => void;
    onUpdate: (props: SuggestionProps<MentionUser>) => void;
    onKeyDown: (props: { event: KeyboardEvent }) => boolean;
    onExit: () => void;
  };
};

/** Internal popup state — `null` when the suggestion is closed. */
type SuggestionState = {
  items: MentionUser[];
  command: (item: MentionUser) => void;
  clientRect: () => DOMRect | null;
  query: string;
};

/**
 * Floating suggestion popup. Positioned absolute relative to the document so
 * we don't need a portal/tippy. Renders avatar-less rows (the comment author
 * avatar is enough context); the highlighted row tracks ↑/↓ and Enter inserts.
 * `emptyLabel` is shown when there are no matches; we intentionally do NOT
 * dismiss on empty so the caller can see "kimse yok" feedback.
 */
const MentionSuggestionPopup = React.forwardRef<
  { onKeyDown: (event: KeyboardEvent) => boolean },
  { state: SuggestionState; emptyLabel: string }
>(function MentionSuggestionPopup({ state, emptyLabel }, ref) {
  const [active, setActive] = React.useState(0);
  const { items, command, clientRect } = state;

  // Reset highlight when the candidate set changes (e.g. query narrows).
  React.useEffect(() => {
    setActive(0);
  }, [items]);

  React.useImperativeHandle(
    ref,
    () => ({
      onKeyDown(event: KeyboardEvent): boolean {
        if (items.length === 0) {
          if (event.key === 'Escape') return true; // swallow Esc so editor doesn't blur
          return false;
        }
        if (event.key === 'ArrowDown') {
          setActive((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowUp') {
          setActive((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const pick = items[active];
          if (pick) command(pick);
          return true;
        }
        if (event.key === 'Escape') return true;
        return false;
      },
    }),
    [items, active, command],
  );

  const rect = clientRect();
  if (!rect) return null;

  // The popup is portalled to `document.body` so it escapes the card-detail
  // Radix Dialog's CSS transform — otherwise `position: fixed` resolves against
  // the transformed ancestor (containing-block) and the popup ends up off-screen.
  // `clientRect` returns viewport-relative coords, which is what fixed wants.
  const style: React.CSSProperties = {
    position: 'fixed',
    top: rect.bottom + 4,
    left: rect.left,
    zIndex: 1000,
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      data-slot="rich-text-mention-popup"
      role="listbox"
      aria-label="@mention"
      style={style}
      className="min-w-[180px] max-w-[280px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
    >
      {items.length === 0 ? (
        <div className="px-2 py-1.5 text-xs text-muted-foreground">{emptyLabel}</div>
      ) : (
        <ul className="max-h-56 overflow-y-auto py-1 text-sm">
          {items.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  command(item);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 px-2 py-1 text-left',
                  index === active && 'bg-accent text-accent-foreground',
                )}
              >
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body,
  );
});

const PROSE_CLASS =
  'max-w-none text-sm break-words focus:outline-none [&_p]:my-1 [&_h1]:mt-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-medium [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:text-xs [&_pre]:max-w-full [&_pre]:overflow-x-auto';

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

const TOOLBAR_BUTTON_CLASS =
  'inline-flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none [&_svg]:size-3.5';

function ToolbarButton({ label, active = false, onClick, children }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className={cn(TOOLBAR_BUTTON_CLASS, active && 'bg-accent text-foreground')}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />;
}

/**
 * Dropdown trigger styled like a toolbar button (the "T" pill). Carries the
 * `textStyle` tooltip; `headingLevel` controls which icon is shown so the
 * trigger reflects the current block: pilcrow for paragraph, H1/H2/H3
 * otherwise. The popover content (paragraph + heading rows) is rendered by
 * the caller, since it owns the editor commands and active state.
 */
type TextStyleTriggerProps = {
  label: string;
  headingLevel: 1 | 2 | 3 | null;
};

function TextStyleTrigger({ label, headingLevel }: TextStyleTriggerProps) {
  const Icon =
    headingLevel === 1
      ? Heading1Icon
      : headingLevel === 2
        ? Heading2Icon
        : headingLevel === 3
          ? Heading3Icon
          : TypeIcon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger
          aria-label={label}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            TOOLBAR_BUTTON_CLASS,
            'gap-0.5 px-1 w-auto [&_svg]:size-3.5',
            headingLevel !== null && 'bg-accent text-foreground',
          )}
        >
          <Icon />
          <ChevronDownIcon className="!size-3 opacity-60" />
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

type TextStyleItemProps = {
  label: string;
  active: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
};

function TextStyleItem({ label, active, onSelect, icon }: TextStyleItemProps) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:outline-none [&_svg]:size-3.5',
        active && 'bg-accent/60 text-foreground',
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1">{label}</span>
      {active && <CheckIcon className="!size-3.5 text-primary" />}
    </button>
  );
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
   * @-mention picker source. When provided, typing `@` opens a suggestion popup
   * filtered by `mentions.search(query)`; selecting an item inserts a
   * `mention` node `{ type: 'mention', attrs: { id, label } }` that the backend
   * parser recognises. When `undefined`, no mention extension is loaded — the
   * caller (e.g. card description editor) keeps its current behaviour.
   */
  mentions?: MentionSource;
  /**
   * Called whenever the document changes — receives `(serialisedValue, isEmpty)`.
   * `serialisedValue` is the Tiptap JSON string; callers typically store `''`
   * instead when `isEmpty` so a "no description" placeholder still works.
   */
  onChange?: (serializedValue: string, isEmpty: boolean) => void;
  className?: string;
  /**
   * Extra classes for the editable content area (the ProseMirror node). Use to
   * cap its height + enable its own scroll (e.g. `max-h-[50vh] overflow-y-auto`)
   * so the sticky toolbar — and any save/cancel actions the caller renders below
   * the editor — stay in view while a long document scrolls *inside* the field.
   */
  contentClassName?: string;
  /**
   * When `true`, the toolbar is hidden until the editor is focused (or already
   * holds content) — the field reads as a slim single line at rest and expands
   * on focus. Used by the compact comment composer (checklist item thread) so a
   * full editor doesn't dominate an inline, chat-style thread.
   */
  collapsibleToolbar?: boolean;
}

/**
 * Editable rich-text field built on Tiptap (headless). A small sticky toolbar
 * (bold / italic / strike / code · headings · bullet / ordered · link in `full`;
 * bold / italic / link in `mini`) plus the editable content area. Entity-
 * agnostic and i18n-ready: all visible copy (placeholder, button labels, link
 * prompt) is passed in via props — there is no hardcoded text. Re-renders to the
 * incoming `value` when it changes externally (e.g. after a save resets it).
 * When `mentions` is supplied, typing `@` opens an inline picker — the resulting
 * `mention` node round-trips through `RichTextContent` and is consumed by the
 * backend parser in `packages/api/src/lib/mention-parser.ts`.
 */
export function RichTextEditor({
  value,
  placeholder,
  labels,
  disabled = false,
  toolbar = 'full',
  ariaLabel,
  mentions,
  onChange,
  className,
  contentClassName,
  collapsibleToolbar = false,
}: RichTextEditorProps) {
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });

  // `collapsibleToolbar`: toolbar yalnız editör odaktayken (veya içerik
  // doluyken) görünür; boşta alan ince tek satır gibi durur.
  const [focused, setFocused] = React.useState(false);
  const [hasContent, setHasContent] = React.useState(false);

  // Mention extension is bound once per editor instance via `useMemo`. The
  // `search` callback is read through `mentionsRef` so a parent passing a new
  // function on every render does not re-build the extension chain (which would
  // destroy the editor and wipe the user's draft).
  const mentionsRef = React.useRef(mentions);
  React.useEffect(() => {
    mentionsRef.current = mentions;
  });

  const [suggestion, setSuggestion] = React.useState<SuggestionState | null>(null);
  const suggestionRef = React.useRef<{ onKeyDown: (event: KeyboardEvent) => boolean } | null>(null);

  const mentionSuggestion = React.useMemo<MentionSuggestionWire | undefined>(() => {
    if (!mentions) return undefined;
    return {
      char: '@',
      items: ({ query }) => mentionsRef.current?.search(query).slice(0, 8) ?? [],
      render: () => ({
        onStart(props) {
          setSuggestion({
            items: props.items,
            command: (item) => props.command(item),
            clientRect: () => props.clientRect?.() ?? null,
            query: props.query,
          });
        },
        onUpdate(props) {
          setSuggestion({
            items: props.items,
            command: (item) => props.command(item),
            clientRect: () => props.clientRect?.() ?? null,
            query: props.query,
          });
        },
        onKeyDown({ event }) {
          return suggestionRef.current?.onKeyDown(event) ?? false;
        },
        onExit() {
          setSuggestion(null);
        },
      }),
    };
    // Dep tracks *whether* a mention source is provided, not the source itself —
    // the search fn is read through `mentionsRef` so a new search callback on
    // every render doesn't rebuild the extension chain (which would wipe the
    // user's draft).
  }, [Boolean(mentions)]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: buildExtensions(placeholder, mentionSuggestion),
    content: parseRichTextValue(value),
    editorProps: {
      attributes: {
        class: cn(PROSE_CLASS, 'min-h-[2.5rem] px-3 py-2', contentClassName),
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
      },
    },
    onUpdate({ editor: ed }) {
      const empty = isRichTextEmpty(ed);
      setHasContent(!empty);
      onChangeRef.current?.(serializeRichTextValue(ed), empty);
    },
    onFocus() {
      setFocused(true);
    },
    onBlur() {
      setFocused(false);
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

  const activeHeading: 1 | 2 | 3 | null = editor.isActive('heading', { level: 1 })
    ? 1
    : editor.isActive('heading', { level: 2 })
      ? 2
      : editor.isActive('heading', { level: 3 })
        ? 3
        : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div
        data-slot="rich-text-editor"
        className={cn(
          'overflow-hidden rounded-md border bg-card',
          disabled && 'opacity-60',
          className,
        )}
      >
        {(!collapsibleToolbar || focused || hasContent) && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b bg-card px-1 py-1">
          {toolbar === 'full' && (
            <>
              <Popover>
                <TextStyleTrigger label={labels.textStyle} headingLevel={activeHeading} />
                <PopoverContent
                  align="start"
                  sideOffset={6}
                  className="w-48 p-1"
                  role="menu"
                  aria-label={labels.textStyle}
                >
                  <TextStyleItem
                    label={labels.paragraph}
                    active={activeHeading === null}
                    icon={<PilcrowIcon />}
                    onSelect={() => editor.chain().focus().setParagraph().run()}
                  />
                  <TextStyleItem
                    label={labels.heading1}
                    active={activeHeading === 1}
                    icon={<Heading1Icon />}
                    onSelect={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                  />
                  <TextStyleItem
                    label={labels.heading2}
                    active={activeHeading === 2}
                    icon={<Heading2Icon />}
                    onSelect={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  />
                  <TextStyleItem
                    label={labels.heading3}
                    active={activeHeading === 3}
                    icon={<Heading3Icon />}
                    onSelect={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                  />
                </PopoverContent>
              </Popover>
              <Divider />
            </>
          )}
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
        )}
        <EditorContent editor={editor} />
        {suggestion && mentions && (
          <MentionSuggestionPopup
            ref={suggestionRef}
            state={suggestion}
            emptyLabel={mentions.emptyLabel}
          />
        )}
      </div>
    </TooltipProvider>
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
 * renders `null` (callers show their own "no description" placeholder). Stored
 * `mention` nodes round-trip through the same shared `Mention` extension config
 * so a chip rendered in the editor looks identical here.
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
      extensions: buildContentExtensions(),
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
