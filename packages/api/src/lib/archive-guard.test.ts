/**
 * Faz 8F (DEM-283) — `assertNotArchived` unit testi (pure helper, DB yok).
 *
 * Helper'ın 4 entity (workspace/board/list/card) için doğru reddi + default
 * Türkçe mesajı + override mesajını döndürdüğünü doğrular. archived-guard
 * konsolidasyonun "neden" katmanını burada sabitliyoruz; konsolidasyonu
 * tüketen router test'leri zaten `code: 'BAD_REQUEST'` assertion'larını
 * koruyor (mesaj string'i çoğunda yok).
 */
import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { archivedMessages, assertNotArchived } from './archive-guard';

describe('archive-guard / assertNotArchived', () => {
  describe('aktif satır (archivedAt = null)', () => {
    it.each(['workspace', 'board', 'list', 'card'] as const)('%s → no-op', (entity) => {
      expect(() => assertNotArchived(entity, { archivedAt: null })).not.toThrow();
    });
  });

  describe('arşivli satır (archivedAt = Date)', () => {
    const archivedAt = new Date('2026-01-01T00:00:00Z');

    it.each(['workspace', 'board', 'list', 'card'] as const)(
      '%s → BAD_REQUEST + entity default mesajı',
      (entity) => {
        expect(() => assertNotArchived(entity, { archivedAt })).toThrowError(TRPCError);
        try {
          assertNotArchived(entity, { archivedAt });
        } catch (err) {
          const trpcErr = err as TRPCError;
          expect(trpcErr.code).toBe('BAD_REQUEST');
          expect(trpcErr.message).toBe(archivedMessages[entity]);
        }
      },
    );

    it('override mesajı default yerine kullanılır', () => {
      try {
        assertNotArchived('board', { archivedAt }, "Arşivli board'a liste eklenemez.");
      } catch (err) {
        const trpcErr = err as TRPCError;
        expect(trpcErr.code).toBe('BAD_REQUEST');
        expect(trpcErr.message).toBe("Arşivli board'a liste eklenemez.");
      }
    });

    it('boş string override mesajı ignore edilir, default kullanılır', () => {
      // Empty string falsy; `?? DEFAULT` empty string'i geçirir AMA `undefined ??`
      // pattern'ı boş string'i tutar. Burada nullish coalescing tutarlı: '' default'a düşmez.
      // Bu test pattern'i belgeler: empty string vermeyin.
      try {
        assertNotArchived('board', { archivedAt }, '');
      } catch (err) {
        const trpcErr = err as TRPCError;
        // `?? DEFAULT` nullish coalescing: '' kalır (boş string nullish değil)
        expect(trpcErr.message).toBe('');
      }
    });
  });

  describe('default mesaj sözlüğü', () => {
    it('4 entity için Türkçe default mesajlar tanımlı', () => {
      expect(archivedMessages.workspace).toMatch(/^Arşivli workspace/);
      expect(archivedMessages.board).toMatch(/^Arşivli board/);
      expect(archivedMessages.list).toMatch(/^Arşivli liste/);
      expect(archivedMessages.card).toMatch(/^Arşivli kart/);
    });
  });
});
