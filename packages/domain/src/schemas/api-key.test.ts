/**
 * `api-key` domain şema testleri — Public API + Bot Erişimi (2026-07-13, Task 2).
 *
 * Bot key rolü board rollerinin katı alt kümesidir: `member` (varsayılan) veya
 * `viewer`. `admin` bota **hiçbir zaman** verilmez (pano yönetimi insan
 * sorumluluğu — `docs/domain/10-bot-ve-api-key-kurallari.md`). Şema katmanı ilk
 * savunma; procedure katmanı ikinci (Task 7).
 */
import { describe, expect, it } from 'vitest';
import {
  API_KEY_ROLES,
  MAX_ACTIVE_API_KEYS_PER_BOARD,
  apiKeyRoleSchema,
  createBoardApiKeyInput,
  listBoardApiKeysInput,
  revokeBoardApiKeyInput,
} from './api-key';

describe('apiKeyRoleSchema', () => {
  it('accepts `member`', () => {
    expect(apiKeyRoleSchema.parse('member')).toBe('member');
  });

  it('accepts `viewer`', () => {
    expect(apiKeyRoleSchema.parse('viewer')).toBe('viewer');
  });

  it('rejects `admin` (bots never manage a board)', () => {
    expect(apiKeyRoleSchema.safeParse('admin').success).toBe(false);
  });

  it('rejects an arbitrary string', () => {
    expect(apiKeyRoleSchema.safeParse('superuser').success).toBe(false);
  });
});

describe('createBoardApiKeyInput', () => {
  it('accepts a minimal payload and defaults role to `member`', () => {
    const parsed = createBoardApiKeyInput.parse({ boardId: 'brd_1', name: 'CI Bot' });
    expect(parsed).toMatchObject({ boardId: 'brd_1', name: 'CI Bot', role: 'member' });
    expect(parsed.expiresAt).toBeUndefined();
  });

  it('accepts an explicit `viewer` role', () => {
    const parsed = createBoardApiKeyInput.parse({
      boardId: 'brd_1',
      name: 'Read Bot',
      role: 'viewer',
    });
    expect(parsed.role).toBe('viewer');
  });

  it('rejects `admin` role (bots never manage a board)', () => {
    expect(
      createBoardApiKeyInput.safeParse({ boardId: 'brd_1', name: 'Bot', role: 'admin' }).success,
    ).toBe(false);
  });

  it('trims the name and rejects whitespace-only', () => {
    expect(createBoardApiKeyInput.parse({ boardId: 'brd_1', name: '  Bot  ' }).name).toBe('Bot');
    expect(createBoardApiKeyInput.safeParse({ boardId: 'brd_1', name: '   ' }).success).toBe(false);
  });

  it('rejects an empty name and one over 100 chars', () => {
    expect(createBoardApiKeyInput.safeParse({ boardId: 'brd_1', name: '' }).success).toBe(false);
    expect(
      createBoardApiKeyInput.safeParse({ boardId: 'brd_1', name: 'a'.repeat(101) }).success,
    ).toBe(false);
  });

  it('requires a boardId', () => {
    expect(createBoardApiKeyInput.safeParse({ name: 'Bot' }).success).toBe(false);
  });

  it('coerces an ISO datetime string `expiresAt` to a Date', () => {
    const iso = '2027-01-01T00:00:00.000Z';
    const parsed = createBoardApiKeyInput.parse({ boardId: 'brd_1', name: 'Bot', expiresAt: iso });
    expect(parsed.expiresAt).toBeInstanceOf(Date);
    expect(parsed.expiresAt?.toISOString()).toBe(iso);
  });

  it('accepts a Date `expiresAt`', () => {
    const when = new Date('2027-06-01T12:00:00.000Z');
    const parsed = createBoardApiKeyInput.parse({ boardId: 'brd_1', name: 'Bot', expiresAt: when });
    expect(parsed.expiresAt?.getTime()).toBe(when.getTime());
  });

  it('rejects a past `expiresAt` (L2 — a key must not be born already expired)', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const result = createBoardApiKeyInput.safeParse({ boardId: 'brd_1', name: 'Bot', expiresAt: past });
    expect(result.success).toBe(false);
  });

  it('rejects a past ISO datetime string `expiresAt`', () => {
    expect(
      createBoardApiKeyInput.safeParse({
        boardId: 'brd_1',
        name: 'Bot',
        expiresAt: '2000-01-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('accepts a future `expiresAt`', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(
      createBoardApiKeyInput.safeParse({ boardId: 'brd_1', name: 'Bot', expiresAt: future }).success,
    ).toBe(true);
  });
});

describe('MAX_ACTIVE_API_KEYS_PER_BOARD', () => {
  it('caps active keys per board at 20 (L4)', () => {
    expect(MAX_ACTIVE_API_KEYS_PER_BOARD).toBe(20);
  });

  it('is a positive integer', () => {
    expect(Number.isInteger(MAX_ACTIVE_API_KEYS_PER_BOARD)).toBe(true);
    expect(MAX_ACTIVE_API_KEYS_PER_BOARD).toBeGreaterThan(0);
  });
});

describe('API_KEY_ROLES', () => {
  it('is exactly [member, viewer]', () => {
    expect(API_KEY_ROLES).toEqual(['member', 'viewer']);
  });
});

describe('revokeBoardApiKeyInput', () => {
  it('accepts a boardId + apiKeyId', () => {
    expect(revokeBoardApiKeyInput.parse({ boardId: 'brd_1', apiKeyId: 'key_1' })).toEqual({
      boardId: 'brd_1',
      apiKeyId: 'key_1',
    });
  });

  it('rejects a missing apiKeyId', () => {
    expect(revokeBoardApiKeyInput.safeParse({ boardId: 'brd_1' }).success).toBe(false);
  });
});

describe('listBoardApiKeysInput', () => {
  it('accepts a boardId', () => {
    expect(listBoardApiKeysInput.parse({ boardId: 'brd_1' })).toEqual({ boardId: 'brd_1' });
  });

  it('rejects a missing boardId', () => {
    expect(listBoardApiKeysInput.safeParse({}).success).toBe(false);
  });
});
