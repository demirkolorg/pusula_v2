import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  RichTextContent,
  RichTextEditor,
  parseRichTextValue,
  type RichTextEditorLabels,
} from '@pusula/ui';

const labels: RichTextEditorLabels = {
  bold: 'Kalın',
  italic: 'İtalik',
  strike: 'Üstü çizili',
  code: 'Kod',
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
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] };
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
    expect(screen.getByRole('button', { name: labels.heading1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.bulletList })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.link })).toBeInTheDocument();
  });

  it('hides headings/lists in the mini toolbar', () => {
    render(<RichTextEditor value={null} placeholder="Yaz…" labels={labels} toolbar="mini" />);
    expect(screen.getByRole('button', { name: labels.bold })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: labels.heading1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: labels.bulletList })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.link })).toBeInTheDocument();
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
