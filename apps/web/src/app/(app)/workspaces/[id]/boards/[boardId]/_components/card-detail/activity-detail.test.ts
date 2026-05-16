import { describe, expect, it } from 'vitest';
import { activityCategory, activityCategoryLabel, buildActivityChanges } from './activity-detail';

describe('activityCategory', () => {
  it('derives the category from the event type prefix', () => {
    expect(activityCategory('card.renamed')).toBe('card');
    expect(activityCategory('list.created')).toBe('list');
    expect(activityCategory('comment.created')).toBe('comment');
    expect(activityCategory('attachment.added')).toBe('attachment');
  });

  it('falls back to "other" for unknown prefixes', () => {
    expect(activityCategory('weird.thing')).toBe('other');
    expect(activityCategory('nonsense')).toBe('other');
  });
});

describe('activityCategoryLabel', () => {
  it('returns the Turkish label for the category', () => {
    expect(activityCategoryLabel('card.moved')).toBe('Kart');
    expect(activityCategoryLabel('comment.created')).toBe('Yorum');
    expect(activityCategoryLabel('checklist.item_added')).toBe('Yapılacaklar');
    expect(activityCategoryLabel('mystery.event')).toBe('Diğer');
  });
});

describe('buildActivityChanges', () => {
  it('returns an empty list for non-object payloads', () => {
    expect(buildActivityChanges(null)).toEqual([]);
    expect(buildActivityChanges(undefined)).toEqual([]);
    expect(buildActivityChanges('text')).toEqual([]);
  });

  it('builds a diff row for from*/to* pairs with a known label', () => {
    expect(buildActivityChanges({ fromTitle: 'Eski', toTitle: 'Yeni' })).toEqual([
      { kind: 'diff', label: 'Başlık', from: 'Eski', to: 'Yeni' },
    ]);
  });

  it('builds a diff row for old*/new* pairs', () => {
    expect(buildActivityChanges({ oldColor: 'kırmızı', newColor: 'mavi' })).toEqual([
      { kind: 'diff', label: 'Renk', from: 'kırmızı', to: 'mavi' },
    ]);
  });

  it('labels a bare from/to pair as "Değer"', () => {
    expect(buildActivityChanges({ from: 'gradient:a', to: 'solid:b' })).toEqual([
      { kind: 'diff', label: 'Değer', from: 'gradient:a', to: 'solid:b' },
    ]);
  });

  it('translates the role suffix on a diff pair', () => {
    expect(buildActivityChanges({ oldRole: 'watcher', newRole: 'assignee' })).toEqual([
      { kind: 'diff', label: 'Rol', from: 'İzleyen', to: 'Sorumlu' },
    ]);
  });

  it('builds value rows for known standalone scalars', () => {
    expect(buildActivityChanges({ fileName: 'rapor.png', mimeType: 'image/png' })).toEqual([
      { kind: 'value', label: 'Dosya', value: 'rapor.png' },
      { kind: 'value', label: 'Dosya türü', value: 'image/png' },
    ]);
  });

  it('renders the archived boolean as a readable state', () => {
    expect(buildActivityChanges({ archived: true })).toEqual([
      { kind: 'value', label: 'Arşiv durumu', value: 'Arşivlendi' },
    ]);
    expect(buildActivityChanges({ archived: false })).toEqual([
      { kind: 'value', label: 'Arşiv durumu', value: 'Geri yüklendi' },
    ]);
  });

  it('formats a byte count value with the size formatter', () => {
    expect(buildActivityChanges({ sizeBytes: 2048 })).toEqual([
      { kind: 'value', label: 'Boyut', value: '2 KB' },
    ]);
  });

  it('skips identifier-only keys from the change list', () => {
    expect(buildActivityChanges({ cardId: 'c1', attachmentId: 'at1' })).toEqual([]);
  });
});
