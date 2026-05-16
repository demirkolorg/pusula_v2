/**
 * Unit tests for digest email rendering — Faz 10G (DEM-141).
 *
 * Pure-function: hiç I/O yok, `renderDigestEmail` snapshot benzeri kararlı
 * çıktılar üretir. Tipe-göre gruplama, "ve X daha" özet, başlık şekli ve
 * subject formatı doğrulanır.
 */
import { describe, expect, it } from 'vitest';
import { renderDigestEmail, type DigestItem } from './notification-templates';

const RECIPIENT = { name: 'Asya', email: 'asya@example.test' };
const APP_URL = 'https://app.pusula.test';

function item(
  type: DigestItem['type'],
  overrides: Partial<DigestItem['payload']> = {},
  createdAt = new Date('2026-05-15T10:00:00Z'),
): DigestItem {
  return {
    type,
    createdAt,
    payload: {
      actorName: 'Bob',
      cardTitle: 'Önemli kart',
      cardId: 'c1',
      boardId: 'b1',
      workspaceId: 'w1',
      ...overrides,
    },
  };
}

describe('renderDigestEmail', () => {
  it('subject format: "Pusula — {N} yeni bildirim (saatlik özet)"', () => {
    const result = renderDigestEmail({
      recipient: RECIPIENT,
      cadence: 'hourly',
      items: [item('card_assigned'), item('comment_reply')],
      appUrl: APP_URL,
    });
    expect(result.subject).toBe('Pusula — 2 yeni bildirim (saatlik özet)');
  });

  it("daily cadence uses 'günlük özet' in subject", () => {
    const result = renderDigestEmail({
      recipient: RECIPIENT,
      cadence: 'daily',
      items: [item('card_assigned')],
      appUrl: APP_URL,
    });
    expect(result.subject).toContain('günlük özet');
  });

  it('groups items by notification type, preserves first-seen order', () => {
    const result = renderDigestEmail({
      recipient: RECIPIENT,
      cadence: 'hourly',
      items: [
        item('card_assigned', { actorName: 'Bob', cardTitle: 'A' }),
        item('comment_reply', { actorName: 'Carol', cardTitle: 'A' }),
        item('card_assigned', { actorName: 'Dave', cardTitle: 'B' }),
      ],
      appUrl: APP_URL,
    });
    // İlk başlık atamalar (2 satır), sonra yorumlar (1 satır).
    expect(result.html.indexOf('Atamalar')).toBeLessThan(result.html.indexOf('Yorumlar'));
    expect(result.html).toContain('Atamalar (2)');
    expect(result.html).toContain('Yorumlar');
  });

  it('renders at most 5 lines per group; extras collapse into "ve X daha"', () => {
    const seven = Array.from({ length: 7 }).map((_, i) =>
      item('card_assigned', { actorName: 'Bob', cardTitle: `Kart ${i + 1}` }),
    );
    const result = renderDigestEmail({
      recipient: RECIPIENT,
      cadence: 'hourly',
      items: seven,
      appUrl: APP_URL,
    });
    expect(result.html).toContain('Kart 1');
    expect(result.html).toContain('Kart 5');
    expect(result.html).not.toContain('Kart 6');
    expect(result.html).toContain('ve 2 daha');
  });

  it('plain text body mirrors HTML structure', () => {
    const result = renderDigestEmail({
      recipient: RECIPIENT,
      cadence: 'hourly',
      items: [item('card_assigned', { actorName: 'Bob', cardTitle: 'X' })],
      appUrl: APP_URL,
    });
    expect(result.text).toContain('Merhaba Asya');
    expect(result.text).toContain('Atamalar');
    expect(result.text).toContain('Bob');
    expect(result.text).toContain('"X"');
    expect(result.text).toContain(`${APP_URL}/account?tab=notifications`);
  });

  it('footer links to /account?tab=notifications and explains mute-bypass', () => {
    const result = renderDigestEmail({
      recipient: RECIPIENT,
      cadence: 'daily',
      items: [item('mention')],
      appUrl: APP_URL,
    });
    expect(result.html).toContain(`${APP_URL}/account?tab=notifications`);
    expect(result.html).toContain('davetler her zaman anlık');
  });

  it('empty items list still renders a safe shell (defensive)', () => {
    const result = renderDigestEmail({
      recipient: RECIPIENT,
      cadence: 'hourly',
      items: [],
      appUrl: APP_URL,
    });
    expect(result.subject).toContain('saatlik özet');
    expect(result.html).toContain('gönderecek yeni bir bildirim yok');
  });

  it('escapes HTML in cardTitle (XSS safety)', () => {
    const result = renderDigestEmail({
      recipient: RECIPIENT,
      cadence: 'hourly',
      items: [
        item('card_assigned', {
          cardTitle: '<script>alert(1)</script>',
          actorName: 'Bob',
        }),
      ],
      appUrl: APP_URL,
    });
    expect(result.html).not.toContain('<script>alert(1)</script>');
    expect(result.html).toContain('&lt;script&gt;');
  });
});
