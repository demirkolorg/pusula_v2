import { describe, expect, it } from 'vitest';
import { activityLabel } from '../lib/activity-summary';

/**
 * Faz 7N — `activity-summary.ts` saf eşleme birim testleri. `activityLabel`,
 * aktivite olay tipini kart detay feed'i için Türkçe okuma etiketine çevirir;
 * bilinmeyen tip genel ifadeye düşer.
 */
describe('activityLabel', () => {
  it('bilinen kart olayı tipini Türkçe etikete çevirir', () => {
    expect(activityLabel('card.created')).toBe('kartı oluşturdu');
    expect(activityLabel('card.archived')).toBe('kartı arşivledi');
    expect(activityLabel('card.completed')).toBe('kartı tamamlandı işaretledi');
  });

  it('başlık değişiminin iki ayrı tipi aynı etikete çözülür', () => {
    expect(activityLabel('card.title_changed')).toBe('başlığı değiştirdi');
    expect(activityLabel('card.renamed')).toBe('başlığı değiştirdi');
    expect(activityLabel('card.title_changed')).toBe(activityLabel('card.renamed'));
  });

  it('yorum olaylarını Türkçe etikete çevirir', () => {
    expect(activityLabel('comment.created')).toBe('yorum ekledi');
    expect(activityLabel('comment.updated')).toBe('yorumu düzenledi');
    expect(activityLabel('comment.deleted')).toBe('yorumu sildi');
  });

  it('kontrol listesi olaylarını Türkçe etikete çevirir', () => {
    expect(activityLabel('checklist.created')).toBe('kontrol listesi ekledi');
    expect(activityLabel('checklist.item_added')).toBe('kontrol listesine madde ekledi');
    expect(activityLabel('checklist.item_completed')).toBe('bir maddeyi tamamladı');
    expect(activityLabel('checklist.item_unchecked')).toBe('bir maddenin işaretini kaldırdı');
  });

  it('ek dosya olaylarını Türkçe etikete çevirir', () => {
    expect(activityLabel('attachment.added')).toBe('dosya ekledi');
    expect(activityLabel('attachment.removed')).toBe('dosya kaldırdı');
  });

  it('son tarih ve kapak olaylarını Türkçe etikete çevirir', () => {
    expect(activityLabel('card.due_set')).toBe('son tarih ekledi');
    expect(activityLabel('card.due_cleared')).toBe('son tarihi kaldırdı');
    expect(activityLabel('card.cover_changed')).toBe('kapak rengini değiştirdi');
    expect(activityLabel('card.cover_image_cleared')).toBe('kapak görselini kaldırdı');
  });

  it('üye ve etiket olaylarını Türkçe etikete çevirir', () => {
    expect(activityLabel('card.label_added')).toBe('etiket ekledi');
    expect(activityLabel('card.label_removed')).toBe('etiket kaldırdı');
    expect(activityLabel('card.member_added')).toBe('karta üye ekledi');
    expect(activityLabel('card.member_removed')).toBe('karttan üye çıkardı');
  });

  it('bilinmeyen tip için genel ifadeye düşer', () => {
    expect(activityLabel('card.unknown_event')).toBe('bir işlem yaptı');
    expect(activityLabel('tamamen.bilinmeyen')).toBe('bir işlem yaptı');
  });

  it('boş string için genel ifadeye düşer', () => {
    expect(activityLabel('')).toBe('bir işlem yaptı');
  });

  it('büyük/küçük harf duyarlıdır — yanlış kasalı tip eşleşmez', () => {
    expect(activityLabel('CARD.CREATED')).toBe('bir işlem yaptı');
    expect(activityLabel('Card.Created')).toBe('bir işlem yaptı');
  });

  it('eşleme dışı rastgele girdiler genel ifadeye düşer', () => {
    expect(activityLabel('list.created')).toBe('bir işlem yaptı');
    expect(activityLabel('board.archived')).toBe('bir işlem yaptı');
    expect(activityLabel('   ')).toBe('bir işlem yaptı');
  });
});
