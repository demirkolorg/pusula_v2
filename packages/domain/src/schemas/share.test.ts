/**
 * Faz 9A (DEM-127) — share link Zod & expiry helper contracts.
 *
 * Önce-belge:
 *  - `docs/domain/08-paylasim-linki-kurallari.md` — kim oluşturur, misafir kuralları
 *  - `docs/architecture/14-paylasim-linki-mimarisi.md` — `share_links` şeması, token
 *    üretimi, tRPC API yüzeyi
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHARE_LINK_EXPIRY_DAYS,
  GUEST_AUTHOR_LABEL,
  SHARE_LINK_EXPIRY_PRESETS,
} from '../constants';
import {
  computeExpiresAt,
  shareLinkCreateInput,
  shareLinkListInput,
  shareLinkResponseSchema,
  shareLinkRevokeInput,
  shareLinkSummarySchema,
} from './share';

const VALID_UUID = 'b2fa0d4e-cf9d-4a83-89e6-1234567890ab';

describe('SHARE_LINK constants', () => {
  it('preset durations are the only three a member may pick', () => {
    expect(SHARE_LINK_EXPIRY_PRESETS).toEqual([7, 30, 90]);
  });

  it('default expiry is 90 days', () => {
    expect(DEFAULT_SHARE_LINK_EXPIRY_DAYS).toBe(90);
  });

  it('guest author label is the sabit "Misafir"', () => {
    expect(GUEST_AUTHOR_LABEL).toBe('Misafir');
  });
});

describe('shareLinkCreateInput', () => {
  it('accepts the minimal payload and defaults expiresInDays to 90', () => {
    expect(shareLinkCreateInput.parse({ cardId: 'card_1' })).toEqual({
      cardId: 'card_1',
      expiresInDays: 90,
    });
  });

  it.each([7, 30, 90])('accepts preset expiry %i', (days) => {
    expect(
      shareLinkCreateInput.parse({ cardId: 'card_1', expiresInDays: days }),
    ).toEqual({ cardId: 'card_1', expiresInDays: days });
  });

  it('rejects expiry values outside the preset', () => {
    expect(shareLinkCreateInput.safeParse({ cardId: 'card_1', expiresInDays: 60 }).success).toBe(
      false,
    );
    expect(shareLinkCreateInput.safeParse({ cardId: 'card_1', expiresInDays: 0 }).success).toBe(
      false,
    );
    expect(shareLinkCreateInput.safeParse({ cardId: 'card_1', expiresInDays: -7 }).success).toBe(
      false,
    );
  });

  it('rejects an invalid clientMutationId and accepts a valid UUID', () => {
    expect(
      shareLinkCreateInput.safeParse({ cardId: 'card_1', clientMutationId: 'not-uuid' }).success,
    ).toBe(false);
    expect(
      shareLinkCreateInput.parse({ cardId: 'card_1', clientMutationId: VALID_UUID }),
    ).toEqual({ cardId: 'card_1', expiresInDays: 90, clientMutationId: VALID_UUID });
  });

  it('requires cardId', () => {
    expect(shareLinkCreateInput.safeParse({}).success).toBe(false);
  });
});

describe('shareLinkRevokeInput', () => {
  it('accepts shareLinkId + cardId', () => {
    expect(shareLinkRevokeInput.parse({ shareLinkId: 'share_1', cardId: 'card_1' })).toEqual({
      shareLinkId: 'share_1',
      cardId: 'card_1',
    });
  });

  it('rejects payloads missing shareLinkId or cardId', () => {
    expect(shareLinkRevokeInput.safeParse({ cardId: 'card_1' }).success).toBe(false);
    expect(shareLinkRevokeInput.safeParse({ shareLinkId: 'share_1' }).success).toBe(false);
  });

  it('forwards clientMutationId when present', () => {
    expect(
      shareLinkRevokeInput.parse({
        shareLinkId: 'share_1',
        cardId: 'card_1',
        clientMutationId: VALID_UUID,
      }),
    ).toEqual({ shareLinkId: 'share_1', cardId: 'card_1', clientMutationId: VALID_UUID });
  });
});

describe('shareLinkListInput', () => {
  it('accepts cardId', () => {
    expect(shareLinkListInput.parse({ cardId: 'card_1' })).toEqual({ cardId: 'card_1' });
  });

  it('rejects the empty payload', () => {
    expect(shareLinkListInput.safeParse({}).success).toBe(false);
  });
});

describe('shareLinkResponseSchema', () => {
  it('parses the share.create response shape', () => {
    const expiresAt = new Date('2026-08-13T10:00:00.000Z');
    expect(
      shareLinkResponseSchema.parse({
        id: 'share_1',
        token: 'aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdefg',
        url: 'https://pusula.app/share/aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdefg',
        expiresAt,
      }),
    ).toEqual({
      id: 'share_1',
      token: 'aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdefg',
      url: 'https://pusula.app/share/aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdefg',
      expiresAt,
    });
  });

  it('rejects a response missing the token', () => {
    expect(
      shareLinkResponseSchema.safeParse({
        id: 'share_1',
        url: 'https://pusula.app/share/aBc',
        expiresAt: new Date(),
      }).success,
    ).toBe(false);
  });
});

describe('shareLinkSummarySchema', () => {
  const createdAt = new Date('2026-05-15T10:00:00.000Z');
  const expiresAt = new Date('2026-08-13T10:00:00.000Z');
  const lastAccessedAt = new Date('2026-05-15T11:00:00.000Z');

  it('parses an active link summary (revokedAt null)', () => {
    expect(
      shareLinkSummarySchema.parse({
        id: 'share_1',
        tokenPrefix: 'aBcDeFgH',
        createdById: 'user_1',
        createdAt,
        expiresAt,
        revokedAt: null,
        revokedById: null,
        accessCount: 0,
        lastAccessedAt: null,
      }),
    ).toEqual({
      id: 'share_1',
      tokenPrefix: 'aBcDeFgH',
      createdById: 'user_1',
      createdAt,
      expiresAt,
      revokedAt: null,
      revokedById: null,
      accessCount: 0,
      lastAccessedAt: null,
    });
  });

  it('parses a revoked summary with accessCount and lastAccessedAt populated', () => {
    const revokedAt = new Date('2026-05-15T12:00:00.000Z');
    expect(
      shareLinkSummarySchema.parse({
        id: 'share_1',
        tokenPrefix: 'aBcDeFgH',
        createdById: 'user_1',
        createdAt,
        expiresAt,
        revokedAt,
        revokedById: 'user_2',
        accessCount: 3,
        lastAccessedAt,
      }),
    ).toEqual({
      id: 'share_1',
      tokenPrefix: 'aBcDeFgH',
      createdById: 'user_1',
      createdAt,
      expiresAt,
      revokedAt,
      revokedById: 'user_2',
      accessCount: 3,
      lastAccessedAt,
    });
  });

  it('rejects negative access counters', () => {
    expect(
      shareLinkSummarySchema.safeParse({
        id: 'share_1',
        tokenPrefix: 'aBcDeFgH',
        createdById: 'user_1',
        createdAt,
        expiresAt,
        revokedAt: null,
        revokedById: null,
        accessCount: -1,
        lastAccessedAt: null,
      }).success,
    ).toBe(false);
  });
});

describe('computeExpiresAt', () => {
  it('adds the given days to the supplied `now` (90 gün)', () => {
    const now = new Date('2026-05-15T10:00:00.000Z');
    expect(computeExpiresAt(90, now)).toEqual(new Date('2026-08-13T10:00:00.000Z'));
  });

  it('adds the given days to the supplied `now` (7 gün)', () => {
    const now = new Date('2026-05-15T00:00:00.000Z');
    expect(computeExpiresAt(7, now)).toEqual(new Date('2026-05-22T00:00:00.000Z'));
  });

  it('falls back to current time when `now` is omitted', () => {
    const before = Date.now();
    const result = computeExpiresAt(30);
    const after = Date.now();
    const minExpected = before + 30 * 86_400_000;
    const maxExpected = after + 30 * 86_400_000;
    expect(result.getTime()).toBeGreaterThanOrEqual(minExpected);
    expect(result.getTime()).toBeLessThanOrEqual(maxExpected);
  });
});
