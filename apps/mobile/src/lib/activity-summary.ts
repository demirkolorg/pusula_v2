/**
 * Aktivite olayı tipini Türkçe okuma etiketine çevirir — kart detay aktivite
 * feed'i için. Web'in tam payload-cümlesi değil; sade, tip-bazlı bir feed
 * (7F salt-okunur kapsamı).
 */
const ACTIVITY_LABELS: Record<string, string> = {
  'card.created': 'kartı oluşturdu',
  'card.title_changed': 'başlığı değiştirdi',
  'card.renamed': 'başlığı değiştirdi',
  'card.description_changed': 'açıklamayı güncelledi',
  'card.due_set': 'son tarih ekledi',
  'card.due_changed': 'son tarihi değiştirdi',
  'card.due_cleared': 'son tarihi kaldırdı',
  'card.completed': 'kartı tamamlandı işaretledi',
  'card.uncompleted': 'tamamlandı işaretini kaldırdı',
  'card.archived': 'kartı arşivledi',
  'card.restored': 'kartı arşivden çıkardı',
  'card.moved': 'kartı taşıdı',
  'card.movedToList': 'kartı başka listeye taşıdı',
  'card.cover_changed': 'kapak rengini değiştirdi',
  'card.cover_cleared': 'kapak rengini kaldırdı',
  'card.cover_image_changed': 'kapak görselini değiştirdi',
  'card.cover_image_cleared': 'kapak görselini kaldırdı',
  'card.label_added': 'etiket ekledi',
  'card.label_removed': 'etiket kaldırdı',
  'card.member_added': 'karta üye ekledi',
  'card.member_removed': 'karttan üye çıkardı',
  'comment.created': 'yorum ekledi',
  'comment.updated': 'yorumu düzenledi',
  'comment.deleted': 'yorumu sildi',
  'checklist.created': 'kontrol listesi ekledi',
  'checklist.item_added': 'kontrol listesine madde ekledi',
  'checklist.item_removed': 'kontrol listesinden madde kaldırdı',
  'checklist.item_completed': 'bir maddeyi tamamladı',
  'checklist.item_unchecked': 'bir maddenin işaretini kaldırdı',
  'attachment.added': 'dosya ekledi',
  'attachment.removed': 'dosya kaldırdı',
};

/** Aktivite tipi → Türkçe etiket; bilinmeyen tip için genel ifade. */
export function activityLabel(type: string): string {
  return ACTIVITY_LABELS[type] ?? 'bir işlem yaptı';
}
