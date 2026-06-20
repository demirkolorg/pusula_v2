import { describe, expect, it } from 'vitest';
import {
  buildNotificationChanges,
  notificationCategoryLabel,
} from '@/lib/notification-audit';

/**
 * `notification-audit.ts` birim testleri (Faz 5+6) — bildirim detay ekranının
 * "Değişiklikler" (önce → sonra) mobil enjeksiyonu. Saf diff motoru
 * `@pusula/domain` `buildActivityChanges`'te test edilir; burada yalnız mobil
 * etiket/`formatBytes`/boolean-rol enjeksiyonunun doğru bağlandığı doğrulanır.
 */
describe('buildNotificationChanges', () => {
  it('from*/to* çiftini Türkçe etiketli diff satırına çevirir', () => {
    const changes = buildNotificationChanges({ fromTitle: 'Eski', toTitle: 'Yeni' });
    expect(changes).toEqual([{ kind: 'diff', label: 'Başlık', from: 'Eski', to: 'Yeni' }]);
  });

  it('old*/new* çiftini de diff olarak tanır', () => {
    const changes = buildNotificationChanges({ oldRole: 'member', newRole: 'admin' });
    expect(changes).toEqual([{ kind: 'diff', label: 'Rol', from: 'member', to: 'admin' }]);
  });

  it('byte alanını formatBytes ile insanlaştırır (Türkçe ondalık)', () => {
    const changes = buildNotificationChanges({ sizeBytes: 2048, fileName: 'rapor.pdf' });
    expect(changes).toContainEqual({ kind: 'value', label: 'Boyut', value: '2 KB' });
    expect(changes).toContainEqual({ kind: 'value', label: 'Dosya', value: 'rapor.pdf' });
  });

  it('archived boolean değerini Türkçeleştirir', () => {
    expect(buildNotificationChanges({ archived: true })).toEqual([
      { kind: 'value', label: 'Arşiv durumu', value: 'Arşivlendi' },
    ]);
    expect(buildNotificationChanges({ archived: false })).toEqual([
      { kind: 'value', label: 'Arşiv durumu', value: 'Geri yüklendi' },
    ]);
  });

  it('id-benzeri ve nesne alanları atlanır', () => {
    const changes = buildNotificationChanges({
      cardId: 'c-1',
      actorId: 'u-1',
      nested: { a: 1 },
      title: 'Görünür',
    });
    expect(changes).toEqual([{ kind: 'value', label: 'Başlık', value: 'Görünür' }]);
  });

  it('kırpılmış (truncated) audit-text alanını bayrakla taşır', () => {
    const changes = buildNotificationChanges({
      fromDescription: { value: 'kısa' },
      toDescription: { value: 'çok uzun…', truncated: true },
    });
    expect(changes).toEqual([
      { kind: 'diff', label: 'Açıklama', from: 'kısa', to: 'çok uzun…', truncated: true },
    ]);
  });

  it('düz obje olmayan girdi boş liste döndürür (eski/veri-yok bildirim)', () => {
    expect(buildNotificationChanges(null)).toEqual([]);
    expect(buildNotificationChanges('bozuk')).toEqual([]);
    expect(buildNotificationChanges(undefined)).toEqual([]);
  });

  it('bilinmeyen alan anahtarını insanlaştırır (humanize fallback)', () => {
    const changes = buildNotificationChanges({ fromCustomField: 'a', toCustomField: 'b' });
    expect(changes).toEqual([{ kind: 'diff', label: 'Custom Field', from: 'a', to: 'b' }]);
  });
});

describe('notificationCategoryLabel', () => {
  it('nokta ayraçlı tipin kategorisini çözer', () => {
    expect(notificationCategoryLabel('card.renamed')).toBe('Kart');
    expect(notificationCategoryLabel('board.archived')).toBe('Pano');
    expect(notificationCategoryLabel('comment.created')).toBe('Yorum');
  });

  it('alt çizgi ayraçlı tipin kategorisini çözer', () => {
    expect(notificationCategoryLabel('card_moved')).toBe('Kart');
    expect(notificationCategoryLabel('list_created')).toBe('Liste');
    expect(notificationCategoryLabel('attachment_added')).toBe('Ek dosya');
  });

  it('mention ve due özel eşlenir', () => {
    expect(notificationCategoryLabel('mention')).toBe('Yorum');
    expect(notificationCategoryLabel('due_overdue')).toBe('Teslim tarihi');
  });

  it('bilinmeyen kategori "Diğer" döner', () => {
    expect(notificationCategoryLabel('watched_activity')).toBe('Diğer');
  });
});
