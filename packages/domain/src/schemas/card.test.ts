import { describe, expect, it } from 'vitest';
import { updateCardInput } from './card';

describe('updateCardInput cover image', () => {
  it('accepts setting and clearing a card cover image attachment', () => {
    expect(updateCardInput.parse({ cardId: 'card_1', coverImageAttachmentId: 'att_1' })).toEqual({
      cardId: 'card_1',
      coverImageAttachmentId: 'att_1',
    });

    expect(updateCardInput.parse({ cardId: 'card_1', coverImageAttachmentId: null })).toEqual({
      cardId: 'card_1',
      coverImageAttachmentId: null,
    });
  });
});
