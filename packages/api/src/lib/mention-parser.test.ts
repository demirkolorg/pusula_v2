import { describe, expect, it, vi } from 'vitest';
import { parseMentions } from './mention-parser';

type ExecuteRow = { id: string; name: string };

function ctxWithRows(rows: ExecuteRow[]) {
  return {
    db: {
      execute: vi.fn().mockResolvedValue(rows),
    },
  };
}

const tiptapDoc = (text: string) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text }],
    },
  ],
});

describe('parseMentions', () => {
  it('matches @username text and returns the board-accessible user id', async () => {
    const ctx = ctxWithRows([{ id: 'user-bob', name: 'bob' }]);

    await expect(
      parseMentions(tiptapDoc('Merhaba @bob bakar misin?'), 'board-1', ctx),
    ).resolves.toEqual([{ mentionedUserId: 'user-bob', mentionText: 'bob' }]);
    expect(ctx.db.execute).toHaveBeenCalledTimes(1);
  });

  it('parses Tiptap JSON stored as a string by the web comment composer', async () => {
    const ctx = ctxWithRows([{ id: 'user-bob', name: 'bob' }]);

    await expect(
      parseMentions(JSON.stringify(tiptapDoc('@bob please review this')), 'board-1', ctx),
    ).resolves.toEqual([{ mentionedUserId: 'user-bob', mentionText: 'bob' }]);
  });

  it('skips email-like text', async () => {
    const ctx = ctxWithRows([{ id: 'user-example', name: 'example.test' }]);

    await expect(
      parseMentions(tiptapDoc('mail bob@example.test'), 'board-1', ctx),
    ).resolves.toEqual([]);
    expect(ctx.db.execute).not.toHaveBeenCalled();
  });

  it('dedupes repeated mentions of the same user in one comment', async () => {
    const ctx = ctxWithRows([{ id: 'user-bob', name: 'bob' }]);

    await expect(parseMentions(tiptapDoc('@bob tekrar @bob'), 'board-1', ctx)).resolves.toEqual([
      { mentionedUserId: 'user-bob', mentionText: 'bob' },
    ]);
  });

  it('silently skips a mentioned user without board access', async () => {
    const ctx = ctxWithRows([]);

    await expect(parseMentions(tiptapDoc('@bob'), 'board-1', ctx)).resolves.toEqual([]);
  });

  it('silently skips an unknown username', async () => {
    const ctx = ctxWithRows([]);

    await expect(parseMentions(tiptapDoc('@nobody'), 'board-1', ctx)).resolves.toEqual([]);
  });

  it('returns multiple valid mentions', async () => {
    const ctx = ctxWithRows([
      { id: 'user-alice', name: 'alice' },
      { id: 'user-bob', name: 'bob' },
    ]);

    await expect(parseMentions(tiptapDoc('@alice ve @bob'), 'board-1', ctx)).resolves.toEqual([
      { mentionedUserId: 'user-alice', mentionText: 'alice' },
      { mentionedUserId: 'user-bob', mentionText: 'bob' },
    ]);
  });

  it('traverses nested Tiptap JSON text nodes', async () => {
    const ctx = ctxWithRows([{ id: 'user-bob', name: 'bob' }]);
    const body = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cc @bob' }] }],
            },
          ],
        },
      ],
    };

    await expect(parseMentions(body, 'board-1', ctx)).resolves.toEqual([
      { mentionedUserId: 'user-bob', mentionText: 'bob' },
    ]);
  });

  it('parses mentions split across adjacent formatted text nodes', async () => {
    const ctx = ctxWithRows([{ id: 'user-bob', name: 'bob' }]);
    const body = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'cc @bo' },
            { type: 'text', text: 'b' },
          ],
        },
      ],
    };

    await expect(parseMentions(body, 'board-1', ctx)).resolves.toEqual([
      { mentionedUserId: 'user-bob', mentionText: 'bob' },
    ]);
  });

  it('supports future Tiptap mention nodes by attrs.id', async () => {
    const ctx = ctxWithRows([{ id: 'user-123', name: 'Robert' }]);
    const body = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'mention', attrs: { id: 'user-123', label: 'bob' } }],
        },
      ],
    };

    await expect(parseMentions(body, 'board-1', ctx)).resolves.toEqual([
      { mentionedUserId: 'user-123', mentionText: 'bob' },
    ]);
  });

  // Faz 6 review fix (K1/K3): inner `text` node'larında JSON-shaped içerik
  // root-only parse guard sayesinde tekrar JSON.parse'a sürüklenmemeli;
  // aksi halde sonsuz recursion / DoS riski. Inner JSON-string içine
  // gömülmüş bir `mention` node'u yalnızca guard bozulursa keşfedilebilir;
  // doğru davranışta string düz metin olarak ele alınır ve attrs.id ulaşılmaz.
  it('does not re-parse JSON-shaped content inside an inner text node', async () => {
    const innerWithMention = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          // attrs.id parse edilirse `user-trojan` mention olarak yakalanır.
          content: [{ type: 'mention', attrs: { id: 'user-trojan', label: 'trojan' } }],
        },
      ],
    });
    const ctx = ctxWithRows([{ id: 'user-trojan', name: 'trojan' }]);
    const body = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: innerWithMention }],
        },
      ],
    };

    // Guard çalışıyorsa: inner JSON string düz metin → `mention` node ulaşılmaz
    // → ctx.db.execute hiç çağrılmaz (içerikte @ regex match'i de yok) → []
    await expect(parseMentions(body, 'board-1', ctx)).resolves.toEqual([]);
    expect(ctx.db.execute).not.toHaveBeenCalled();
  });

  it('handles deeply nested Tiptap JSON without unbounded recursion (depth cap = 32)', async () => {
    const ctx = ctxWithRows([{ id: 'user-bob', name: 'bob' }]);
    // 100 seviye iç içe paragraph node'u — depth cap olmadan stack overflow olur.
    let nested: { type: string; content?: unknown[] } = {
      type: 'paragraph',
      content: [{ type: 'text', text: '@bob' }],
    };
    for (let i = 0; i < 100; i++) {
      nested = { type: 'paragraph', content: [nested] };
    }
    const body = { type: 'doc', content: [nested] };

    // Cap aşıldığı için derinlerdeki `@bob` görülmez; ama stack'te patlamadan
    // boş array dönmeli (DoS önlemi).
    await expect(parseMentions(body, 'board-1', ctx)).resolves.toEqual([]);
  });
});
