/**
 * Faz 13I (DEM-265) — print sayfası için Türkçe i18n stub map. Yumuşak
 * çözüm: 13Q (DEM-266) tam i18n provider gelene kadar print pipeline
 * server-side dataset'e gömüyor. UI `t(key) = dataset.i18n[key] ?? key`
 * resolver'ı ile çalışır (fallback olarak key string'i ekrana yansır).
 *
 * Eksik anahtar = key kendisi ekrana çıkar (kullanıcıya çirkin görünür
 * ama PDF üretilir). 13Q geldikte bu dosya silinir ve UI doğrudan
 * `next-intl` provider'a bağlanır.
 *
 * Anahtar kaynağı: `packages/ui/src/reports/**` `t('reports.*')` çağrıları
 * (49 çağrı, 44 benzersiz key — bu liste o setin Türkçe karşılığıdır).
 */
export const REPORT_PRINT_I18N_TR: Record<string, string> = Object.freeze({
  // Genel chart + tablo
  'reports.chart.title': 'Grafik',
  'reports.dataTable.empty': 'Bu rapor için veri yok.',
  'reports.dataTable.more': 've {{count}} satır daha',
  'reports.kpi.previousLabel': 'Önceki dönem:',
  'reports.delta.up': 'artış',

  // Print sayfası
  'reports.print.generatedAt': '{{at}} tarihinde üretildi',

  // Status filter
  'reports.filters.scope.cardStatus.open': 'Açık',
  'reports.filters.scope.cardStatus.completed': 'Tamamlanan',
  'reports.filters.scope.cardStatus.archived': 'Arşivli',

  // Activity timeline
  'reports.microReports.activityTimeline.title': 'Etkinlik Zaman Çizelgesi',
  'reports.microReports.activityTimeline.emptyState': 'Seçilen aralıkta etkinlik yok.',
  'reports.activity.types.card.created': 'kart oluşturdu',
  'reports.activity.types.card.completed': 'kartı tamamladı',

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
