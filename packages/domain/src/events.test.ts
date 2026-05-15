import { describe, expect, it } from 'vitest';
import { parseRealtimeEventPayload } from './events';

describe('parseRealtimeEventPayload', () => {
  it('accepts a valid card.updated payload', () => {
    expect(
      parseRealtimeEventPayload('card.updated', {
        cardId: 'c1',
        patch: { title: 'Guncel kart' },
      }),
    ).toEqual({
      cardId: 'c1',
      patch: { title: 'Guncel kart' },
    });
  });

  it('rejects card.updated payloads without an object patch', () => {
    expect(parseRealtimeEventPayload('card.updated', { cardId: 'c1' })).toBeUndefined();
  });

  it('rejects malformed nested card.created rows', () => {
    expect(parseRealtimeEventPayload('card.created', { card: { id: 'c4' } })).toBeUndefined();
  });

  it('passes unknown event types through for forward compatibility', () => {
    const payload = { future: true };

    expect(parseRealtimeEventPayload('future.event', payload)).toBe(payload);
  });
});
