import { describe, expect, it } from 'vitest';
import {
  MATRIX_GROUPS,
  MATRIX_ROWS,
  NOTIFICATION_CHANNEL_KEYS,
  groupMatrixRows,
} from '@/lib/notification-matrix';

/**
 * `notification-matrix.ts` birim testleri (Faz 7K) — tip × kanal matrisi.
 */
describe('MATRIX_ROWS', () => {
  it('her satır üç kanalın da hücre durumunu taşır', () => {
    for (const row of MATRIX_ROWS) {
      for (const channel of NOTIFICATION_CHANNEL_KEYS) {
        expect(row.channels[channel]).toBeDefined();
      }
    }
  });

  it('her satırın grubu bilinen bir grup anahtarıdır', () => {
    for (const row of MATRIX_ROWS) {
      expect(MATRIX_GROUPS).toContain(row.group);
    }
  });

  it('mention satırı in-app + email mute-bypass', () => {
    const mention = MATRIX_ROWS.find((row) => row.type === 'mention');
    expect(mention?.channels.in_app).toBe('mute_bypass');
    expect(mention?.channels.email).toBe('mute_bypass');
    expect(mention?.channels.push).toBe('on');
  });

  it('davet satırları mute-bypass, push yok', () => {
    const boardInv = MATRIX_ROWS.find((row) => row.type === 'board_invitation');
    expect(boardInv?.channels.in_app).toBe('mute_bypass');
    expect(boardInv?.channels.push).toBe('unavailable');
  });
});

describe('groupMatrixRows', () => {
  it('satırları grup sırasına göre öbekler', () => {
    const grouped = groupMatrixRows(MATRIX_ROWS);
    expect(grouped.map((g) => g.group)).toEqual(
      MATRIX_GROUPS.filter((group) => MATRIX_ROWS.some((row) => row.group === group)),
    );
  });

  it('boş grup içermez', () => {
    const grouped = groupMatrixRows(MATRIX_ROWS);
    expect(grouped.every((g) => g.rows.length > 0)).toBe(true);
  });

  it('tüm satırlar gruplandığında korunur', () => {
    const grouped = groupMatrixRows(MATRIX_ROWS);
    const total = grouped.reduce((sum, g) => sum + g.rows.length, 0);
    expect(total).toBe(MATRIX_ROWS.length);
  });
});
