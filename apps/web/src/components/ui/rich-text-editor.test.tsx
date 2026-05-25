import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  RichTextContent,
  RichTextEditor,
  parseRichTextValue,
  type MentionSource,
  type RichTextEditorLabels,
} from '@pusula/ui';

const labels: RichTextEditorLabels = {
  bold: 'Kalın',
  italic: 'İtalik',
  strike: 'Üstü çizili',
  code: 'Kod',
  textStyle: 'Metin stili',
  paragraph: 'Normal yazı',
  heading1: 'Başlık 1',
  heading2: 'Başlık 2',
  heading3: 'Başlık 3',
  bulletList: 'Madde işaretli liste',
  orderedList: 'Numaralı liste',
  link: 'Bağlantı',
  linkPrompt: 'Bağlantı adresi:',
};

describe('parseRichTextValue', () => {
  it('wraps legacy plain text in a single paragraph', () => {
    expect(parseRichTextValue('Merhaba')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Merhaba' }] }],
    });
  });

  it('returns an empty doc for null / blank input', () => {
    expect(parseRichTextValue(null)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(parseRichTextValue('   ')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  it('keeps a valid Tiptap document JSON string as-is', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
    };
    expect(parseRichTextValue(JSON.stringify(doc))).toEqual(doc);
  });

  it('falls back to a paragraph when the JSON is not a doc node', () => {
    expect(parseRichTextValue('{"foo":1}')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '{"foo":1}' }] }],
    });
  });
});

describe('<RichTextContent>', () => {
  it('renders legacy plain text as a paragraph', async () => {
    render(<RichTextContent value="Sadece düz metin" />);
    expect(await screen.findByText('Sadece düz metin')).toBeInTheDocument();
  });

  it('renders nothing for an empty document', () => {
    const { container } = render(<RichTextContent value={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders stored Tiptap JSON content', async () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'JSON içerik' }] }],
    });
    render(<RichTextContent value={doc} />);
    expect(await screen.findByText('JSON içerik')).toBeInTheDocument();
  });

  it('never renders a `javascript:` link href from a hand-crafted stored doc (stored XSS)', async () => {
    // A malicious `card.update` / `comment.*` payload could persist this. The
    // read-only renderer must not emit `<a href="javascript:...">`.
    const malicious = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'tıkla',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    });
    const { container } = render(<RichTextContent value={malicious} />);
    // The text still renders…
    expect(await screen.findByText('tıkla')).toBeInTheDocument();
    // …but no anchor may carry a `javascript:` href (Tiptap blanks it on render,
    // or the link mark is dropped entirely).
    container.querySelectorAll('a').forEach((a) => {
      expect(a.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
      expect(a.href).not.toMatch(/^javascript:/i);
    });
  });

  it('renders a stored `mention` node as an @-prefixed chip', async () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Selam ' },
            { type: 'mention', attrs: { id: 'u-alice', label: 'Alice' } },
            { type: 'text', text: ' bak buna' },
          ],
        },
      ],
    });
    render(<RichTextContent value={doc} />);
    expect(await screen.findByText(/@Alice/)).toBeInTheDocument();
  });

  it('keeps a safe `https:` link href in a stored doc', async () => {
    const safe = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'pusula',
              marks: [{ type: 'link', attrs: { href: 'https://pusula.example/' } }],
            },
          ],
        },
      ],
    });
    const { container } = render(<RichTextContent value={safe} />);
    expect(await screen.findByText('pusula')).toBeInTheDocument();
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe('https://pusula.example/');
  });
});

describe('<RichTextEditor>', () => {
  it('renders the full toolbar with localised labels', () => {
    render(<RichTextEditor value={null} placeholder="Yaz…" labels={labels} />);
    expect(screen.getByRole('button', { name: labels.bold })).toBeInTheDocument();
    // Headings live inside the text-style ("T") dropdown — the trigger carries
    // the textStyle aria-label; H1/H2/H3 only appear after opening it.
    expect(screen.getByRole('button', { name: labels.textStyle })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: labels.heading1 })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.bulletList })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.link })).toBeInTheDocument();
  });

  it('hides headings/lists in the mini toolbar', () => {
    render(<RichTextEditor value={null} placeholder="Yaz…" labels={labels} toolbar="mini" />);
    expect(screen.getByRole('button', { name: labels.bold })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: labels.textStyle })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: labels.heading1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: labels.bulletList })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.link })).toBeInTheDocument();
  });

  it('opens the text-style dropdown and applies a heading on selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RichTextEditor
        value="Merhaba"
        placeholder="Yaz…"
        ariaLabel="Açıklama"
        labels={labels}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Açıklama'));
    await user.click(screen.getByRole('button', { name: labels.textStyle }));

    const headingItem = await screen.findByRole('menuitemradio', { name: labels.heading1 });
    await user.click(headingItem);

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const [serialized] = onChange.mock.calls.at(-1) as [string, boolean];
    const doc = JSON.parse(serialized) as {
      content: Array<{ type: string; attrs?: { level?: number } }>;
    };
    const node = doc.content[0];
    expect(node?.type).toBe('heading');
    expect(node?.attrs?.level).toBe(1);
  });

  it('opens the @-mention picker, narrows by query and inserts a mention node on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const candidates = [
      { id: 'u-alice', label: 'Alice' },
      { id: 'u-bob', label: 'Bob' },
      { id: 'u-carol', label: 'Carol' },
    ];
    const mentions: MentionSource = {
      search: (query) => {
        const q = query.trim().toLowerCase();
        if (q.length === 0) return candidates;
        return candidates.filter((u) => u.label.toLowerCase().includes(q));
      },
      emptyLabel: 'Eşleşen kullanıcı yok',
    };
    render(
      <RichTextEditor
        value={null}
        placeholder="Yorum yaz…"
        ariaLabel="Yorum"
        labels={labels}
        toolbar="mini"
        mentions={mentions}
        onChange={onChange}
      />,
    );

    const region = await screen.findByLabelText('Yorum');
    await user.click(region);
    await user.keyboard('@');

    // Popup with all candidates opens on the bare `@`.
    const popup = await screen.findByRole('listbox', { name: '@mention' });
    expect(popup).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bob' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Carol' })).toBeInTheDocument();

    // Typing narrows.
    await user.keyboard('ca');
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'Alice' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: 'Carol' })).toBeInTheDocument();

    // Click insert → mention node lands in the serialised doc.
    await user.click(screen.getByRole('option', { name: 'Carol' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const [serialized] = onChange.mock.calls.at(-1) as [string, boolean];
    const doc = JSON.parse(serialized) as {
      content: Array<{ content?: Array<{ type: string; attrs?: { id?: string; label?: string } }> }>;
    };
    const inline = doc.content[0]?.content ?? [];
    const mention = inline.find((node) => node.type === 'mention');
    expect(mention).toBeDefined();
    expect(mention?.attrs?.id).toBe('u-carol');
    expect(mention?.attrs?.label).toBe('Carol');
  });

  it('shows the empty label when no candidate matches the query', async () => {
    const user = userEvent.setup();
    const mentions: MentionSource = {
      search: () => [],
      emptyLabel: 'Eşleşen kullanıcı yok',
    };
    render(
      <RichTextEditor
        value={null}
        placeholder="Yorum yaz…"
        ariaLabel="Yorum"
        labels={labels}
        toolbar="mini"
        mentions={mentions}
      />,
    );
    const region = await screen.findByLabelText('Yorum');
    await user.click(region);
    await user.keyboard('@xyz');
    expect(await screen.findByText('Eşleşen kullanıcı yok')).toBeInTheDocument();
  });

  it('does not mount the @-mention popup when `mentions` is absent', async () => {
    const user = userEvent.setup();
    render(
      <RichTextEditor
        value={null}
        placeholder="Açıklama"
        ariaLabel="Açıklama"
        labels={labels}
      />,
    );
    const region = await screen.findByLabelText('Açıklama');
    await user.click(region);
    await user.keyboard('@asya');
    expect(screen.queryByRole('listbox', { name: '@mention' })).not.toBeInTheDocument();
  });

  it('seeds the editor from legacy plain text and reports edits as serialised JSON', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RichTextEditor
        value="Eski"
        placeholder="Yaz…"
        ariaLabel="Açıklama"
        labels={labels}
        onChange={onChange}
      />,
    );
    expect(await screen.findByText('Eski')).toBeInTheDocument();

    const region = screen.getByLabelText('Açıklama');
    await user.click(region);
    await user.keyboard(' yeni');

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const [serialized, isEmpty] = onChange.mock.calls.at(-1) as [string, boolean];
    expect(isEmpty).toBe(false);
    const doc = JSON.parse(serialized) as { type: string };
    expect(doc.type).toBe('doc');
    expect(serialized).toContain('Eski');
  });
});
