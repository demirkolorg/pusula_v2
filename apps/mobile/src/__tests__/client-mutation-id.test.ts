import { randomUUID as nodeRandomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

/**
 * Faz 7N — `client-mutation-id.ts` saf üreteç birim testleri.
 *
 * Modül `expo-crypto` `randomUUID()` kullanır; node test ortamında native
 * modül yüklenemediğinden `expo-crypto` node'un gerçek RFC 4122 v4 üretecine
 * yönlendirilir — üretilen id'lerin format ve benzersizlik garantileri
 * davranış olarak gerçeğiyle birebirdir.
 */
vi.mock('expo-crypto', () => ({
  randomUUID: () => nodeRandomUUID(),
}));

const { newClientMutationId, newTempId, isPendingId } = await import('../lib/client-mutation-id');

/** RFC 4122 v4 UUID formatı. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('newClientMutationId', () => {
  it('RFC 4122 v4 UUID formatında bir string üretir', () => {
    const id = newClientMutationId();
    expect(typeof id).toBe('string');
    expect(id).toMatch(UUID_V4);
  });

  it('her çağrıda benzersiz id üretir', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newClientMutationId()));
    expect(ids.size).toBe(500);
  });

  it('geçici id öneki taşımaz — saf UUID', () => {
    expect(newClientMutationId().startsWith('tmp-')).toBe(false);
  });
});

describe('newTempId', () => {
  it('`tmp-` öneki + UUID biçiminde bir string üretir', () => {
    const id = newTempId();
    expect(id.startsWith('tmp-')).toBe(true);
    expect(id.slice(4)).toMatch(UUID_V4);
  });

  it('her çağrıda benzersiz id üretir', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newTempId()));
    expect(ids.size).toBe(500);
  });

  it('ürettiği id `isPendingId` ile geçici olarak tanınır', () => {
    expect(isPendingId(newTempId())).toBe(true);
  });
});

describe('isPendingId', () => {
  it('`tmp-` ile başlayan id geçici sayılır', () => {
    expect(isPendingId('tmp-abc')).toBe(true);
    expect(isPendingId('tmp-')).toBe(true);
  });

  it('sunucu UUID id geçici sayılmaz', () => {
    expect(isPendingId(nodeRandomUUID())).toBe(false);
    expect(isPendingId(newClientMutationId())).toBe(false);
  });

  it('boş string geçici sayılmaz', () => {
    expect(isPendingId('')).toBe(false);
  });

  it('`tmp-` ortada/sonda geçen id geçici sayılmaz — yalnızca önek', () => {
    expect(isPendingId('card-tmp-1')).toBe(false);
    expect(isPendingId('xtmp-1')).toBe(false);
  });

  it('büyük harfli `TMP-` öneki geçici sayılmaz — kasaya duyarlı', () => {
    expect(isPendingId('TMP-abc')).toBe(false);
  });
});
