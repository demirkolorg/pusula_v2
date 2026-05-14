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

    await expect(parseMentions(tiptapDoc('Merhaba @bob bakar misin?'), 'board-1', ctx)).resolves.toEqual([
      { mentionedUserId: 'user-bob', mentionText: 'bob' },
    ]);
    expect(ctx.db.execute).toHaveBeenCalledTimes(1);
  });

  it('parses Tiptap JSON stored as a string by the web comment composer', async () => {
    const ctx = ctxWithRows([{ id: 'user-bob', name: 'bob' }]);

    await expect(parseMentions(JSON.stringify(tiptapDoc('@bob please review this')), 'board-1', ctx)).resolves.toEqual([
      { mentionedUserId: 'user-bob', mentionText: 'bob' },
    ]);
  });

  it('skips email-like text', async () => {
    const ctx = ctxWithRows([{ id: 'user-example', name: 'example.test' }]);

    await expect(parseMentions(tiptapDoc('mail bob@example.test'), 'board-1', ctx)).resolves.toEqual([]);
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
      content: [{ type: 'paragraph', content: [{ type: 'mention', attrs: { id: 'user-123', label: 'bob' } }] }],
    };

    await expect(parseMentions(body, 'board-1', ctx)).resolves.toEqual([
      { mentionedUserId: 'user-123', mentionText: 'bob' },
    ]);
  });
});
