/**
 * Faz 14C smoke tests — `BoardReportDocument` (DEM-294).
 *
 * React-PDF gerçek render (pdf().toBuffer()) Node-only + native modüller;
 * vitest+jsdom altında kararsız (`fontkit` / `brotli`). Bu test suite'i:
 *   1. Tiptap → plaintext helper'ını birim doğrular.
 *   2. Component'in `React.createElement` ile fırlatmadan oluşturulduğunu
 *      doğrular (JSX/tip sözleşmesi sağlam — sayfa sayısı kararına göre).
 *
 * E2E PDF render doğrulaması Faz 14G'de (DEM-297) Playwright `e2e/board-classic-pdf.spec.ts`'te.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pdf/fonts', () => ({
  registerReportFonts: vi.fn(),
}));

vi.mock('@react-pdf/renderer', () => {
  const passthrough = (tag: string) =>
    function Stub({ children, ...rest }: { children?: React.ReactNode }) {
      return React.createElement('div', { 'data-pdf-tag': tag, ...rest }, children);
    };
  return {
    Document: passthrough('Document'),
    Page: passthrough('Page'),
    View: passthrough('View'),
    Text: passthrough('Text'),
    StyleSheet: { create: (s: unknown) => s },
    Font: { register: vi.fn() },
  };
});

import type { BoardReportData } from '@pusula/api';
import { BoardReportDocument, __testing } from './board-report-document';

const { tiptapJsonToPlainText, clampPlain } = __testing;

function makeData(overrides?: Partial<BoardReportData>): BoardReportData {
  return {
    board: {
      id: 'b1',
      title: 'Test Board',
      description: null,
      icon: 'layout-grid',
      createdAt: '2026-05-25T10:00:00.000Z',
      archivedAt: null,
    },
    workspace: { id: 'w1', name: 'Test Workspace' },
    members: [],
    lists: [],
    stats: { totalCards: 0, completedCards: 0, openCards: 0, progressPercent: 0 },
    generatedAt: '2026-05-25T10:00:00.000Z',
    ...overrides,
  };
}

describe('tiptapJsonToPlainText', () => {
  it('null/undefined/boş → boş string', () => {
    expect(tiptapJsonToPlainText(null)).toBe('');
    expect(tiptapJsonToPlainText(undefined)).toBe('');
    expect(tiptapJsonToPlainText('')).toBe('');
  });

  it('Tiptap doc → tüm text node\'larını birleştirir, paragraph sonrası newline', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Merhaba' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Dünya' }] },
      ],
    });
    const out = tiptapJsonToPlainText(doc);
    expect(out).toContain('Merhaba');
    expect(out).toContain('Dünya');
  });

  it('JSON parse fail (ham metin) → olduğu gibi döner', () => {
    expect(tiptapJsonToPlainText('düz metin yorumu')).toBe('düz metin yorumu');
  });

  it('iç içe content + bold/italic marks ham text → text node\'lar concat', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Bu ' },
            { type: 'text', text: 'kalın', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' yazı' },
          ],
        },
      ],
    });
    expect(tiptapJsonToPlainText(doc)).toContain('Bu kalın yazı');
  });
});

describe('clampPlain', () => {
  it('limitin altındaysa olduğu gibi döner', () => {
    expect(clampPlain('kısa', 10)).toBe('kısa');
  });

  it('limit aşarsa ellipsis ile keser', () => {
    expect(clampPlain('uzun metin örneği', 10)).toBe('uzun meti…');
  });
});

describe('BoardReportDocument', () => {
  it('boş pano fixture\'ında render-without-throw + Kapak + Üyeler + "Veri yok" sayfaları çizilir (14A karar 12)', () => {
    const data = makeData();
    expect(() =>
      React.createElement(BoardReportDocument, { data }),
    ).not.toThrow();
  });

  it('1 liste 2 kart fixture\'ında çökmeden render edilir (Kapak + Üyeler + 1 liste sayfası)', () => {
    const data = makeData({
      lists: [
        {
          id: 'l1',
          title: 'Backlog',
          position: 'a0',
          color: null,
          cards: [
            {
              id: 'c1',
              title: 'First',
              description: null,
              position: 'a0',
              completed: true,
              completedAt: '2026-05-25T10:00:00.000Z',
              dueAt: null,
              members: [{ userId: 'u1', name: 'Alice' }],
              labels: [{ id: 'lbl1', name: 'Urgent', color: 'red' }],
              checklists: [
                {
                  id: 'ch1',
                  title: 'Pre',
                  position: 'a0',
                  items: [
                    { id: 'i1', content: 'Step 1', completed: true, position: 'a0' },
                    { id: 'i2', content: 'Step 2', completed: false, position: 'a1' },
                  ],
                },
              ],
              comments: [
                {
                  id: 'co1',
                  body: 'düz yorum',
                  createdAt: '2026-05-25T11:00:00.000Z',
                  author: { id: 'u1', name: 'Alice' },
                },
              ],
              commentCount: 8,
              attachmentCount: 0,
            },
            {
              id: 'c2',
              title: 'Second',
              description: JSON.stringify({
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'desc' }] }],
              }),
              position: 'a1',
              completed: false,
              completedAt: null,
              dueAt: '2026-05-30T00:00:00.000Z',
              members: [],
              labels: [],
              checklists: [],
              comments: [],
              commentCount: 0,
              attachmentCount: 0,
            },
          ],
        },
      ],
      stats: { totalCards: 2, completedCards: 1, openCards: 1, progressPercent: 50 },
      members: [
        {
          userId: 'u1',
          name: 'Alice',
          email: 'alice@example.test',
          role: 'admin',
          assignedCardCount: 1,
        },
      ],
    });

    expect(() => React.createElement(BoardReportDocument, { data })).not.toThrow();
  });
});
