import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_DESCRIPTION_MAX_LEN,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_TYPES,
  CARD_COVER_IMAGE_MAX_BYTES,
  CARD_COVER_IMAGE_MIME_TYPES,
  attachmentKindFromMime,
} from '../constants';
import {
  attachmentCommitInput,
  attachmentDeleteInput,
  attachmentDescriptionSchema,
  attachmentInitiateInput,
  attachmentListInput,
  attachmentMimeTypeSchema,
  attachmentUpdateInput,
  createAttachmentUploadInput,
  getAttachmentDownloadUrlInput,
} from './attachment';

const UUID_V4 = '11111111-2222-4333-8444-555555555555';

describe('createAttachmentUploadInput (DEM-110 cover-image legacy)', () => {
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

describe('attachmentMimeTypeSchema (Faz 11 V1 allowlist)', () => {
  it('accepts each of the 8 V1-allowlisted MIME types', () => {
    for (const mime of ATTACHMENT_MIME_TYPES) {
      expect(attachmentMimeTypeSchema.parse(mime)).toBe(mime);
    }
  });

  it('rejects MIME types outside the V1 allowlist', () => {
    for (const mime of [
      'image/svg+xml',
      'image/bmp',
      'image/tiff',
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/zip',
      'application/x-7z-compressed',
      'application/octet-stream',
      'application/vnd.oasis.opendocument.text',
      'audio/mpeg',
      'video/mp4',
    ]) {
      expect(attachmentMimeTypeSchema.safeParse(mime).success).toBe(false);
    }
  });

  it('rejects an empty string and a near-miss MIME (case / whitespace sensitive)', () => {
    expect(attachmentMimeTypeSchema.safeParse('').success).toBe(false);
    expect(attachmentMimeTypeSchema.safeParse('IMAGE/PNG').success).toBe(false);
    expect(attachmentMimeTypeSchema.safeParse(' image/png ').success).toBe(false);
    expect(attachmentMimeTypeSchema.safeParse('image/png;charset=utf-8').success).toBe(false);
  });
});

describe('attachmentDescriptionSchema', () => {
  it('trims whitespace and normalizes empty strings to undefined', () => {
    expect(attachmentDescriptionSchema.parse(undefined)).toBeUndefined();
    expect(attachmentDescriptionSchema.parse('')).toBeUndefined();
    expect(attachmentDescriptionSchema.parse('   ')).toBeUndefined();
    expect(attachmentDescriptionSchema.parse('  spec.pdf  ')).toBe('spec.pdf');
  });

  it(`accepts a caption of exactly ${ATTACHMENT_DESCRIPTION_MAX_LEN} characters`, () => {
    const exact = 'x'.repeat(ATTACHMENT_DESCRIPTION_MAX_LEN);
    expect(attachmentDescriptionSchema.parse(exact)).toBe(exact);
  });

  it(`rejects captions longer than ${ATTACHMENT_DESCRIPTION_MAX_LEN} characters`, () => {
    const tooLong = 'x'.repeat(ATTACHMENT_DESCRIPTION_MAX_LEN + 1);
    expect(attachmentDescriptionSchema.safeParse(tooLong).success).toBe(false);
  });

  it('measures the cap after trimming — surrounding whitespace does not count', () => {
    // 500 content chars + leading/trailing spaces: trims back to exactly 500 → accepted.
    const padded = `  ${'x'.repeat(ATTACHMENT_DESCRIPTION_MAX_LEN)}  `;
    expect(attachmentDescriptionSchema.parse(padded)).toBe(
      'x'.repeat(ATTACHMENT_DESCRIPTION_MAX_LEN),
    );
  });

  it('normalizes tab / newline-only captions to undefined', () => {
    expect(attachmentDescriptionSchema.parse('\t\n  \r')).toBeUndefined();
  });
});

describe('attachmentInitiateInput', () => {
  it('accepts a happy-path payload for every allowlisted MIME', () => {
    for (const mimeType of ATTACHMENT_MIME_TYPES) {
      const parsed = attachmentInitiateInput.parse({
        cardId: 'card_1',
        fileName: 'rapor.bin',
        mimeType,
        size: 2048,
        description: '  notlar  ',
        clientMutationId: UUID_V4,
      });
      expect(parsed).toMatchObject({
        cardId: 'card_1',
        fileName: 'rapor.bin',
        mimeType,
        size: 2048,
        description: 'notlar',
        clientMutationId: UUID_V4,
      });
    }
  });

  it('allows description + clientMutationId to be omitted entirely', () => {
    const parsed = attachmentInitiateInput.parse({
      cardId: 'card_1',
      fileName: 'r.png',
      mimeType: 'image/png',
      size: 1,
    });
    expect(parsed.description).toBeUndefined();
    expect(parsed.clientMutationId).toBeUndefined();
  });

  it('rejects oversized files, disallowed MIME types, and blank file names', () => {
    expect(
      attachmentInitiateInput.safeParse({
        cardId: 'card_1',
        fileName: 'big.pdf',
        mimeType: 'application/pdf',
        size: ATTACHMENT_MAX_BYTES + 1,
      }).success,
    ).toBe(false);

    expect(
      attachmentInitiateInput.safeParse({
        cardId: 'card_1',
        fileName: 'malicious.svg',
        mimeType: 'image/svg+xml',
        size: 1024,
      }).success,
    ).toBe(false);

    expect(
      attachmentInitiateInput.safeParse({
        cardId: 'card_1',
        fileName: '   ',
        mimeType: 'image/png',
        size: 1024,
      }).success,
    ).toBe(false);
  });

  it('rejects descriptions longer than the cap and non-UUID clientMutationId', () => {
    expect(
      attachmentInitiateInput.safeParse({
        cardId: 'card_1',
        fileName: 'a.png',
        mimeType: 'image/png',
        size: 1,
        description: 'x'.repeat(ATTACHMENT_DESCRIPTION_MAX_LEN + 1),
      }).success,
    ).toBe(false);

    expect(
      attachmentInitiateInput.safeParse({
        cardId: 'card_1',
        fileName: 'a.png',
        mimeType: 'image/png',
        size: 1,
        clientMutationId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it('accepts a file at exactly the 50 MiB ceiling', () => {
    expect(
      attachmentInitiateInput.safeParse({
        cardId: 'card_1',
        fileName: 'max.pdf',
        mimeType: 'application/pdf',
        size: ATTACHMENT_MAX_BYTES,
      }).success,
    ).toBe(true);
  });

  it('rejects a zero-byte file, a negative size, and a fractional size', () => {
    for (const size of [0, -1, -ATTACHMENT_MAX_BYTES, 1.5]) {
      expect(
        attachmentInitiateInput.safeParse({
          cardId: 'card_1',
          fileName: 'x.png',
          mimeType: 'image/png',
          size,
        }).success,
      ).toBe(false);
    }
  });

  it('accepts a 255-char file name and rejects a 256-char one', () => {
    const ext = '.png';
    const at255 = `${'a'.repeat(255 - ext.length)}${ext}`;
    const at256 = `${'a'.repeat(256 - ext.length)}${ext}`;
    expect(at255).toHaveLength(255);
    expect(at256).toHaveLength(256);

    expect(
      attachmentInitiateInput.parse({
        cardId: 'card_1',
        fileName: at255,
        mimeType: 'image/png',
        size: 1,
      }).fileName,
    ).toBe(at255);

    expect(
      attachmentInitiateInput.safeParse({
        cardId: 'card_1',
        fileName: at256,
        mimeType: 'image/png',
        size: 1,
      }).success,
    ).toBe(false);
  });

  it('trims the file name and rejects one that is only whitespace', () => {
    expect(
      attachmentInitiateInput.parse({
        cardId: 'card_1',
        fileName: '  rapor.pdf  ',
        mimeType: 'application/pdf',
        size: 1,
      }).fileName,
    ).toBe('rapor.pdf');

    expect(
      attachmentInitiateInput.safeParse({
        cardId: 'card_1',
        fileName: '',
        mimeType: 'image/png',
        size: 1,
      }).success,
    ).toBe(false);
  });

  it('rejects a missing cardId, fileName, mimeType, or size', () => {
    const base = {
      cardId: 'card_1',
      fileName: 'a.png',
      mimeType: 'image/png' as const,
      size: 1,
    };
    for (const key of ['cardId', 'fileName', 'mimeType', 'size'] as const) {
      const { [key]: _omitted, ...rest } = base;
      expect(attachmentInitiateInput.safeParse(rest).success).toBe(false);
    }
  });
});

describe('attachmentCommitInput', () => {
  it('accepts an attachment id with optional UUID clientMutationId', () => {
    expect(attachmentCommitInput.parse({ attachmentId: 'att_1' })).toMatchObject({
      attachmentId: 'att_1',
    });
    expect(
      attachmentCommitInput.parse({ attachmentId: 'att_1', clientMutationId: UUID_V4 }),
    ).toMatchObject({ attachmentId: 'att_1', clientMutationId: UUID_V4 });
  });

  it('rejects a missing attachment id and a non-UUID clientMutationId', () => {
    expect(attachmentCommitInput.safeParse({}).success).toBe(false);
    expect(
      attachmentCommitInput.safeParse({ attachmentId: 'att_1', clientMutationId: 'nope' }).success,
    ).toBe(false);
  });
});

describe('attachmentListInput', () => {
  it('requires a cardId', () => {
    expect(attachmentListInput.parse({ cardId: 'card_1' })).toEqual({ cardId: 'card_1' });
    expect(attachmentListInput.safeParse({}).success).toBe(false);
  });
});

describe('attachmentUpdateInput', () => {
  it('accepts a normalized description', () => {
    expect(
      attachmentUpdateInput.parse({
        attachmentId: 'att_1',
        description: '  yeni  ',
        clientMutationId: UUID_V4,
      }),
    ).toMatchObject({ attachmentId: 'att_1', description: 'yeni', clientMutationId: UUID_V4 });
  });

  it('clears the description when the caller sends an empty string', () => {
    const parsed = attachmentUpdateInput.parse({
      attachmentId: 'att_1',
      description: '   ',
    });
    expect(parsed.description).toBeUndefined();
  });

  it('rejects descriptions longer than the cap', () => {
    expect(
      attachmentUpdateInput.safeParse({
        attachmentId: 'att_1',
        description: 'x'.repeat(ATTACHMENT_DESCRIPTION_MAX_LEN + 1),
      }).success,
    ).toBe(false);
  });
});

describe('attachmentDeleteInput', () => {
  it('requires an attachment id and accepts an optional UUID clientMutationId', () => {
    expect(attachmentDeleteInput.parse({ attachmentId: 'att_1' })).toMatchObject({
      attachmentId: 'att_1',
    });
    expect(
      attachmentDeleteInput.parse({ attachmentId: 'att_1', clientMutationId: UUID_V4 }),
    ).toMatchObject({ attachmentId: 'att_1', clientMutationId: UUID_V4 });
    expect(attachmentDeleteInput.safeParse({}).success).toBe(false);
  });
});

describe('attachmentKindFromMime', () => {
  it('maps each V1 image MIME to "image"', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
      expect(attachmentKindFromMime(mime)).toBe('image');
    }
  });

  it('maps application/pdf to "pdf"', () => {
    expect(attachmentKindFromMime('application/pdf')).toBe('pdf');
  });

  it('maps Office Open XML MIME types to "office"', () => {
    expect(
      attachmentKindFromMime(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('office');
    expect(
      attachmentKindFromMime(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe('office');
    expect(
      attachmentKindFromMime(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ),
    ).toBe('office');
  });

  it('resolves every one of the 8 allowlisted MIME types to a non-null kind', () => {
    // Each entry in ATTACHMENT_MIME_TYPES must map to a concrete kind — no
    // allowlisted MIME may fall through to `null`.
    const expected: Record<string, 'image' | 'pdf' | 'office'> = {
      'image/jpeg': 'image',
      'image/png': 'image',
      'image/webp': 'image',
      'image/gif': 'image',
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'office',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'office',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'office',
    };
    expect(Object.keys(expected).sort()).toEqual([...ATTACHMENT_MIME_TYPES].sort());
    for (const mime of ATTACHMENT_MIME_TYPES) {
      expect(attachmentKindFromMime(mime)).toBe(expected[mime]);
    }
  });

  it('returns null for unknown / non-allowlisted MIME types', () => {
    expect(attachmentKindFromMime('text/plain')).toBeNull();
    expect(attachmentKindFromMime('text/csv')).toBeNull();
    expect(attachmentKindFromMime('application/zip')).toBeNull();
    expect(attachmentKindFromMime('application/octet-stream')).toBeNull();
    expect(attachmentKindFromMime('application/vnd.oasis.opendocument.text')).toBeNull();
    expect(attachmentKindFromMime('')).toBeNull();
  });

  it('refuses image/svg+xml — strict allowlist guards against stored-XSS via inline preview', () => {
    expect(attachmentKindFromMime('image/svg+xml')).toBeNull();
    expect(attachmentKindFromMime('image/bmp')).toBeNull();
    expect(attachmentKindFromMime('image/tiff')).toBeNull();
  });

  it('is exact-match — does not route a prefixed/suffixed near-miss into the image branch', () => {
    // A permissive `startsWith('image/')` would misroute these; the strict
    // switch must reject them so an SVG can never reach an inline <img>.
    expect(attachmentKindFromMime('image/png-evil')).toBeNull();
    expect(attachmentKindFromMime('image/')).toBeNull();
    expect(attachmentKindFromMime('IMAGE/PNG')).toBeNull();
    expect(attachmentKindFromMime('image/png ')).toBeNull();
  });
});
