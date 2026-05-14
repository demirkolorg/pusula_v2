import { describe, expect, it } from 'vitest';
import {
  CARD_COVER_IMAGE_MAX_BYTES,
  CARD_COVER_IMAGE_MIME_TYPES,
} from '../constants';
import { createAttachmentUploadInput, getAttachmentDownloadUrlInput } from './attachment';

describe('createAttachmentUploadInput', () => {
  it('accepts image uploads within the card cover image limits', () => {
    for (const mimeType of CARD_COVER_IMAGE_MIME_TYPES) {
      expect(
        createAttachmentUploadInput.parse({
          cardId: 'card_1',
          fileName: 'kapak.png',
          mimeType,
          size: 1024,
        }),
      ).toMatchObject({ cardId: 'card_1', fileName: 'kapak.png', mimeType, size: 1024 });
    }
  });

  it('rejects non-image files and files over the cover image size limit', () => {
    expect(
      createAttachmentUploadInput.safeParse({
        cardId: 'card_1',
        fileName: 'kapak.pdf',
        mimeType: 'application/pdf',
        size: 1024,
      }).success,
    ).toBe(false);

    expect(
      createAttachmentUploadInput.safeParse({
        cardId: 'card_1',
        fileName: 'kapak.png',
        mimeType: 'image/png',
        size: CARD_COVER_IMAGE_MAX_BYTES + 1,
      }).success,
    ).toBe(false);
  });
});

describe('getAttachmentDownloadUrlInput', () => {
  it('requires an attachment id', () => {
    expect(getAttachmentDownloadUrlInput.parse({ attachmentId: 'att_1' })).toEqual({
      attachmentId: 'att_1',
    });
  });
});
