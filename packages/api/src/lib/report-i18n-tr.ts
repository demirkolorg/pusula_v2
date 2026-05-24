/**
 * Faz 13I + 13K (DEM-265 + DEM-267) — print sayfası için Türkçe i18n stub map.
 * Yumuşak çözüm: 13Q (DEM-266) tam i18n provider gelene kadar print pipeline
 * server-side dataset'e gömüyor. UI `t(key) = dataset.i18n[key] ?? key`
 * resolver'ı ile çalışır (fallback olarak key string'i ekrana yansır).
 *
 * Eksik anahtar = key kendisi ekrana çıkar (kullanıcıya çirkin görünür
 * ama PDF üretilir). 13Q geldikte bu dosya silinir ve UI doğrudan
 * `next-intl` provider'a bağlanır.
 *
 * Anahtar kaynağı: `packages/ui/src/reports/**` `t('reports.*')` çağrıları;
 * 13K ile 30 micro-report tamamlandı.
 */
export const REPORT_PRINT_I18N_TR: Record<string, string> = Object.freeze({
  // Genel chart + tablo
  'reports.chart.title': 'Grafik',
  'reports.dataTable.empty': 'Bu rapor için veri yok.',
  'reports.dataTable.more': 've {{count}} satır daha',
  'reports.kpi.previousLabel': 'Önceki:',
  // Delta rozeti — `DeltaBadge` 4 yönü i18n key'le çağırır.
  'reports.delta.up': 'artış',
  'reports.delta.down': 'azalış',
  'reports.delta.neutral': 'değişim yok',
  'reports.delta.new': 'yeni',
  // Faz 13M (DEM-269) — comparison aktif chip/kolon/tooltip i18n
  'reports.composer.comparison.summary': 'Karşılaştırma açık',
  'reports.composer.comparison.rangeTooltip': 'Önceki dönem: {{from}} – {{to}}',
  'reports.comparison.activeBadge': 'Karşılaştırmalı',
  'reports.comparison.previousPeriodLabel': 'Önceki dönem',
  'reports.comparison.currentPeriodLabel': 'Mevcut dönem',
  'reports.comparison.deltaColumnHeader': 'Δ',
  // Faz 13M — micro-report-iç KPI / kolon başlıkları (print de gösterir)
  'reports.microReports.activityTimeline.totalEvents': 'Toplam etkinlik',
  'reports.microReports.memberContribution.columns.user': 'Üye',
  'reports.microReports.memberContribution.columns.count': 'Etkinlik',
  'reports.microReports.labelDistribution.columns.label': 'Etiket',
  'reports.microReports.labelDistribution.columns.count': 'Kart',

  // Print sayfası
  'reports.print.generatedAt': '{{at}} tarihinde üretildi',

  // Status filter
  'reports.filters.scope.cardStatus.open': 'Açık',
  'reports.filters.scope.cardStatus.completed': 'Tamamlanan',
  'reports.filters.scope.cardStatus.archived': 'Arşivli',

  // Activity timeline
  'reports.microReports.activityTimeline.title': 'Etkinlik Zaman Çizelgesi',
  'reports.microReports.activityTimeline.emptyState': 'Seçilen aralıkta etkinlik yok.',

  // Activity event types (13K — `reports.activity.types.<type>` dynamic resolve)
  'reports.activity.types.board.created': 'pano oluşturdu',
  'reports.activity.types.board.updated': 'panoyu güncelledi',
  'reports.activity.types.board.renamed': 'panoyu yeniden adlandırdı',
  'reports.activity.types.board.archived': 'panoyu arşivledi',
  'reports.activity.types.board.member_added': 'panoya üye ekledi',
  'reports.activity.types.board.member_removed': 'panodan üye çıkardı',
  'reports.activity.types.board.member_role_changed': 'üye rolünü değiştirdi',
  'reports.activity.types.board.member_invited': 'panoya davet gönderdi',
  'reports.activity.types.board.invitation_revoked': 'daveti iptal etti',
  'reports.activity.types.board.background_changed': 'pano arka planını değiştirdi',
  'reports.activity.types.board.background_cleared': 'pano arka planını temizledi',
  'reports.activity.types.board.access_requested': 'panoya erişim istedi',
  'reports.activity.types.list.created': 'liste oluşturdu',
  'reports.activity.types.list.updated': 'listeyi güncelledi',
  'reports.activity.types.list.moved': 'listeyi taşıdı',
  'reports.activity.types.list.archived': 'listeyi arşivledi',
  'reports.activity.types.list.renamed': 'listeyi yeniden adlandırdı',
  'reports.activity.types.list.color_changed': 'liste rengini değiştirdi',
  'reports.activity.types.list.color_cleared': 'liste rengini temizledi',
  'reports.activity.types.list.icon_changed': 'liste simgesini değiştirdi',
  'reports.activity.types.list.icon_cleared': 'liste simgesini temizledi',
  'reports.activity.types.card.created': 'kart oluşturdu',
  'reports.activity.types.card.updated': 'kartı güncelledi',
  'reports.activity.types.card.moved': 'kartı taşıdı',
  'reports.activity.types.card.archived': 'kartı arşivledi',
  'reports.activity.types.card.completed': 'kartı tamamladı',
  'reports.activity.types.card.uncompleted': 'tamamlanmayı geri aldı',
  'reports.activity.types.card.renamed': 'kartı yeniden adlandırdı',
  'reports.activity.types.card.description_changed': 'açıklamayı değiştirdi',
  'reports.activity.types.card.member_added': 'karta üye ekledi',
  'reports.activity.types.card.member_removed': 'karttan üye çıkardı',
  'reports.activity.types.card.label_added': 'karta etiket ekledi',
  'reports.activity.types.card.label_removed': 'karttan etiket çıkardı',
  'reports.activity.types.card.due_set': 'vade tarihi ayarladı',
  'reports.activity.types.card.due_cleared': 'vade tarihini temizledi',
  'reports.activity.types.card.cover_changed': 'kapak rengini değiştirdi',
  'reports.activity.types.card.cover_cleared': 'kapak rengini temizledi',
  'reports.activity.types.card.cover_image_changed': 'kapak görselini değiştirdi',
  'reports.activity.types.card.cover_image_cleared': 'kapak görselini temizledi',
  'reports.activity.types.comment.created': 'yorum ekledi',
  'reports.activity.types.comment.updated': 'yorumu güncelledi',
  'reports.activity.types.comment.deleted': 'yorumu sildi',
  'reports.activity.types.comment.mentioned': 'birinden bahsetti',
  'reports.activity.types.checklist.created': 'kontrol listesi oluşturdu',
  'reports.activity.types.checklist.item_added': 'kontrol listesi öğesi ekledi',
  'reports.activity.types.checklist.item_completed': 'öğeyi tamamladı',
  'reports.activity.types.checklist.item_checked': 'öğeyi işaretledi',
  'reports.activity.types.checklist.item_unchecked': 'işareti kaldırdı',
  'reports.activity.types.checklist.item_removed': 'öğeyi sildi',
  'reports.activity.types.attachment.added': 'ek ekledi',
  'reports.activity.types.attachment.removed': 'eki sildi',

  // Checklist progress
  'reports.microReports.checklistProgress.title': 'Kontrol Listesi İlerlemesi',
  'reports.microReports.checklistProgress.emptyState': 'Kontrol listesi yok.',
  'reports.microReports.checklistProgress.ratio': '{{completed}} / {{total}} tamamlandı',
  'reports.microReports.checklistProgress.celebrate': 'Tüm öğeler tamamlandı.',

  // Due date overview
  'reports.microReports.dueDateOverview.title': 'Vade Durumu',
  'reports.microReports.dueDateOverview.emptyState': 'Vadeli kart yok.',
  'reports.microReports.dueDateOverview.barAriaLabel': 'Vade gruplarına göre kart dağılımı',

  // Entity summary
  'reports.microReports.entitySummary.title': 'Genel Bakış',
  'reports.microReports.entitySummary.noDescription': 'Açıklama eklenmemiş.',
  'reports.microReports.entitySummary.metaHeading': 'Özet',
  'reports.microReports.entitySummary.cards': '{{count}} kart',
  'reports.microReports.entitySummary.lists': '{{count}} liste',
  'reports.microReports.entitySummary.boards': '{{count}} pano',
  'reports.microReports.entitySummary.members': '{{count}} üye',
  'reports.microReports.entitySummary.labels': '{{count}} etiket',
  'reports.microReports.entitySummary.archived': 'Arşivli',

  // Label distribution
  'reports.microReports.labelDistribution.title': 'Etiket Dağılımı',
  'reports.microReports.labelDistribution.emptyState': 'Bu raporda etiket yok.',
  'reports.microReports.labelDistribution.chartAriaLabel': 'Etiketlere göre kart dağılımı',

  // Member contribution
  'reports.microReports.memberContribution.title': 'Üye Katkıları',
  'reports.microReports.memberContribution.emptyState': 'Aralıkta üye etkinliği yok.',
  'reports.microReports.memberContribution.chartAriaLabel': 'Üyelere göre etkinlik sayısı',

  // Status breakdown
  'reports.microReports.statusBreakdown.title': 'Durum Dağılımı',
  'reports.microReports.statusBreakdown.emptyState': 'Bu rapor için kart yok.',
  'reports.microReports.statusBreakdown.chartAriaLabel': 'Kart durumlarına göre dağılım',

  // 13K (22 yeni micro-report) — title + emptyState + chart-specific keys
  'reports.microReports.activityBreakdown.title': 'Etkinlik Türü Dağılımı',
  'reports.microReports.activityBreakdown.emptyState': 'Aralıkta etkinlik yok.',
  'reports.microReports.activityBreakdown.other': 'Diğer',
  'reports.microReports.activityHeatmap.title': 'Etkinlik Isı Haritası',
  'reports.microReports.activityHeatmap.emptyState': 'Aralıkta etkinlik yok.',
  'reports.microReports.activityHeatmap.chartAriaLabel':
    'Gün ve saate göre etkinlik yoğunluğu',
  'reports.microReports.agingReport.title': 'Yaşlanma Raporu',
  'reports.microReports.agingReport.emptyState': 'Açık kart yok.',
  'reports.microReports.agingReport.oldestLabel': 'En eski açık kartlar',
  'reports.microReports.agingReport.daysAgo': '{{days}} gün önce',
  'reports.microReports.attachmentSummary.title': 'Ek Özeti',
  'reports.microReports.attachmentSummary.emptyState': 'Ek yok.',
  'reports.microReports.attachmentTypeBreakdown.title': 'Ek Tür Dağılımı',
  'reports.microReports.attachmentTypeBreakdown.emptyState': 'Ek yok.',
  'reports.microReports.attachmentTypeBreakdown.count': 'Adet',
  'reports.microReports.attachmentTypeBreakdown.avg': 'Ort. boyut',
  'reports.microReports.boardHealthScore.title': 'Pano Sağlık Skoru',
  'reports.microReports.boardHealthScore.emptyState': 'Açık kart yok.',
  'reports.microReports.boardHealthScore.scoreLabel': 'Sağlık skoru (0-100)',
  'reports.microReports.boardHealthScore.formulaHint':
    'Ortalama yaş %30, WIP yoğunluğu %30, kararlılık %20, gecikme %20.',
  'reports.microReports.boardHealthScore.days': 'gün',
  'reports.microReports.boardHealthScore.components.avgAge': 'Ortalama yaş',
  'reports.microReports.boardHealthScore.components.wipOverload':
    'En yoğun liste kart sayısı',
  'reports.microReports.boardHealthScore.components.stale':
    '30 günden eski oranı',
  'reports.microReports.boardHealthScore.components.overdue': 'Gecikme oranı',
  'reports.microReports.burndown.title': 'Burndown',
  'reports.microReports.burndown.emptyState': 'Aralıkta açık kart yok.',
  'reports.microReports.burndown.remaining': 'Kalan',
  'reports.microReports.burndown.ideal': 'İdeal',
  'reports.microReports.commentVolume.title': 'Yorum Hacmi',
  'reports.microReports.commentVolume.emptyState': 'Aralıkta yorum yok.',
  'reports.microReports.completionRate.title': 'Tamamlanma Oranı',
  'reports.microReports.completionRate.emptyState':
    'Aralıkta tamamlanan kart yok.',
  'reports.microReports.completionRate.avgPerDay': 'Ortalama / gün',
  'reports.microReports.cycleTime.title': 'Cycle Time',
  'reports.microReports.cycleTime.emptyState':
    'Tamamlanmış kart yok (henüz).',
  'reports.microReports.descriptionCoverage.title': 'Açıklama Kapsamı',
  'reports.microReports.descriptionCoverage.emptyState': 'Kart yok.',
  'reports.microReports.descriptionCoverage.ratio':
    '{{withDescription}} / {{total}} kartta açıklama var',
  'reports.microReports.dueTrend.title': 'Vade Eğilimi',
  'reports.microReports.dueTrend.emptyState':
    'Önümüzdeki 30 günde vadeli kart yok.',
  'reports.microReports.dueTrend.next30Days': 'Önümüzdeki 30 gün',
  'reports.microReports.labelCooccurrence.title': 'Etiket Birlikteliği',
  'reports.microReports.labelCooccurrence.emptyState':
    'Birlikte kullanılan etiket çifti yok.',
  'reports.microReports.labelTrend.title': 'Etiket Eğilimi',
  'reports.microReports.labelTrend.emptyState':
    'Aralıkta etiketli kart hareketi yok.',
  'reports.microReports.listBalance.title': 'Liste Dengesi',
  'reports.microReports.listBalance.emptyState': 'Liste yok.',
  'reports.microReports.listBalance.balanced': 'Dengeli',
  'reports.microReports.listBalance.imbalanced': 'Dengesiz',
  'reports.microReports.listFlow.title': 'Kart Akışı (Liste→Liste)',
  'reports.microReports.listFlow.emptyState': 'Aralıkta liste değişimi yok.',
  'reports.microReports.listFlow.unknownSource': 'Bilinmeyen liste',
  'reports.microReports.memberPresence.title': 'Üye Mevcudiyeti',
  'reports.microReports.memberPresence.emptyState': 'Üye yok.',
  'reports.microReports.memberPresence.never': 'Hiç etkinlik yok',
  'reports.microReports.memberWorkload.title': 'Üye İş Yükü',
  'reports.microReports.memberWorkload.emptyState': 'Atanmış kart yok.',
  'reports.microReports.memberWorkload.column.member': 'Üye',
  'reports.microReports.memberWorkload.column.open': 'Açık',
  'reports.microReports.memberWorkload.column.completed': 'Tamamlanan',
  'reports.microReports.memberWorkload.column.overdue': 'Gecikmiş',
  'reports.microReports.memberWorkload.column.total': 'Toplam',
  'reports.microReports.mentionGraph.title': 'Mention Ağı',
  'reports.microReports.mentionGraph.emptyState':
    'Aralıkta mention içeren yorum yok.',
  'reports.microReports.recentChanges.title': 'Son Değişiklikler',
  'reports.microReports.recentChanges.emptyState':
    'Son 7 günde değişiklik yok.',
  'reports.microReports.timeInList.title': 'Listede Geçen Süre',
  'reports.microReports.timeInList.emptyState':
    'Listede ölçülecek hareket yok.',
  'reports.microReports.wipCount.title': 'WIP (Liste Bazında)',
  'reports.microReports.wipCount.emptyState': 'Açık kart yok.',

  // KPI variant fallback (status-breakdown gibi micro-reports'ta yedek)
  'reports.x.count': '{{count}}',
  'reports.x.desc': '',
  'reports.x.empty': 'Veri yok.',
  'reports.x.extra': '+{{extra}}',
  'reports.x.name': '{{name}}',
  'reports.x.none': '—',

  // Print sayfası — scope + preset + error fallback (13I özel)
  'reports.scope.workspace': 'Çalışma Alanı',
  'reports.scope.board': 'Pano',
  'reports.scope.list': 'Liste',
  'reports.scope.card': 'Kart',
  'reports.errors.widgetUnavailable': 'Bu rapor parçası şu anda yüklenemedi.',
  // Faz 13I render error kategorileri — `report_renders.error_message`
  // i18n key olarak yazılır (kod tarafında resolve edilmez, kullanıcı
  // arabirimi `payload.i18n[key]` ile çevirir; locale-bağımsız).
  'reports.errors.unsupported_format': 'Bu format desteklenmiyor.',
  'reports.errors.print_token_failed': 'Yazdırma için yetkilendirme alınamadı.',
  'reports.errors.pdf_render_failed': 'PDF oluşturulurken bir hata oluştu.',
  // Faz 13L (DEM-268) — xlsx + png + svg render hata kategorileri.
  'reports.errors.xlsx_render_failed': 'Excel oluşturulurken bir hata oluştu.',
  'reports.errors.png_render_failed': 'Görsel oluşturulurken bir hata oluştu.',
  'reports.errors.svg_render_failed': 'SVG oluşturulurken bir hata oluştu.',
  'reports.errors.storage_upload_failed': 'Rapor depolamaya yüklenemedi.',
  'reports.errors.manifestMissing': 'Bu rapor bileşeni şu anda gösterilemiyor.',
  // Preset başlıkları — `presets.ts` `i18nKey` ile uyumlu (`reports.presets.
  // <id>.title`; nokta dot `toI18nSegment` ile dönüştürülmez — düz id).
  'reports.presets.card.overview.title': 'Kart Genel Bakış',
  'reports.presets.card.activity.title': 'Kart Etkinlikleri',
  'reports.presets.card.checklist.title': 'Kontrol Listesi',
  'reports.presets.card.due-and-aging.title': 'Vade & Yaşlanma',
  'reports.presets.list.wip-and-health.title': 'Liste WIP & Sağlık',
  'reports.presets.list.member-workload.title': 'Liste Üye İş Yükü',
  'reports.presets.list.due-overview.title': 'Liste Vade Özeti',
  'reports.presets.list.activity.title': 'Liste Etkinlikleri',
  'reports.presets.board.health.title': 'Pano Sağlık',
  'reports.presets.board.sprint-summary.title': 'Sprint Özeti',
  'reports.presets.board.member-performance.title': 'Üye Performansı',
  'reports.presets.board.due-and-risk.title': 'Vade & Risk',
  'reports.presets.board.flow.title': 'Pano Akışı',
  'reports.presets.board.label-distribution.title': 'Etiket Dağılımı',
  'reports.presets.workspace.executive-summary.title': 'Yönetici Özeti',
  'reports.presets.workspace.board-comparison.title': 'Pano Karşılaştırma',
  'reports.presets.workspace.team-performance.title': 'Takım Performansı',
  'reports.presets.workspace.due-and-risk.title': 'Çalışma Alanı Vade & Risk',
  'reports.presets.workspace.activity-heatmap.title': 'Çalışma Alanı Etkinlik Isı Haritası',
});
