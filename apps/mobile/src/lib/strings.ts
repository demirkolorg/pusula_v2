/**
 * Mobil UI metin katmanı.
 *
 * UI bileşenleri metni hardcode etmez; buradan okur (web
 * `apps/web/src/lib/strings.ts` simetrisi). Sayılar Türkçe çoğul almadığı
 * için `${n} pano` gibi birleştirmeler bileşende yapılır.
 */
export const strings = {
  app: {
    name: 'Pusula',
    tagline: 'Panolarınız, her yerde.',
  },
  common: {
    loading: 'Yükleniyor…',
    retry: 'Tekrar dene',
    connectionLost: 'Bağlantı yok',
    unknownError: 'Bir şeyler ters gitti. Lütfen tekrar dene.',
    comingSoon: 'Yakında',
    cancel: 'Vazgeç',
    save: 'Kaydet',
    close: 'Kapat',
    errorTitle: 'Hata',
    actionError: 'İşlem tamamlanamadı. Lütfen tekrar dene.',
  },
  tabs: {
    boards: 'Panolar',
    search: 'Arama',
    notifications: 'Bildirimler',
    account: 'Hesap',
  },
  // Merkezi "Ekle" butonu + oluşturma menüsü (DEM-203).
  create: {
    // Yükseltilmiş tab bar butonu — dokunma Hızlı Notlar'a gider, uzun basış
    // oluşturma menüsünü açar.
    buttonLabel: 'Ekle',
    buttonHint: 'Dokun: Hızlı Notlar · Uzun bas: oluşturma menüsü',
    // Uzun basışta açılan oluşturma menüsü (bottom sheet) başlığı + satırları.
    menuTitle: 'Ne oluşturmak istersin?',
    menuCard: 'Kart oluştur',
    menuList: 'Liste oluştur',
    menuBoard: 'Pano oluştur',
    menuWorkspace: 'Workspace oluştur',
  },
  // Hızlı Notlar ekranı (DEM-203 — WP3/WP4: CRUD + not→kart dönüşümü).
  quickNotes: {
    title: 'Hızlı Notlar',
    // Hızlı-ekleme composer'ı.
    addPlaceholder: 'Hızlı bir not yaz…',
    addSubmit: 'Ekle',
    // Dock-içi send butonu sonrası kısa görsel onay (DEM-236 2. tur, 2026-05-21).
    saved: 'Kaydedildi',
    // Boş durum.
    emptyTitle: 'Henüz not yok',
    emptyDescription: 'Aklına geleni hızlıca buraya yaz, sonra bir karta dönüştür.',
    // Yükleniyor / hata.
    loadError: 'Notlar yüklenemedi.',
    // Not satırı aksiyonları. `editShort`/`convertShort` kaydırmalı satır
    // aksiyonu (DEM-231 `SwipeRow`) kısa etiketleri; `editAction`/`deleteAction`/
    // `convertAction` erişilebilirlik etiketleri.
    editAction: 'Notu düzenle',
    editShort: 'Düzenle',
    convertShort: 'Taşı',
    editPlaceholder: 'Notu düzenle',
    editSubmit: 'Kaydet',
    deleteAction: 'Notu sil',
    deleteConfirmTitle: 'Notu sil',
    deleteConfirmBody: 'Bu not silinecek. Bu işlem geri alınamaz.',
    deleteConfirmAction: 'Sil',
    // Not → kart dönüşümü ("Panoya taşı").
    convertAction: 'Panoya taşı',
    convertSheetTitle: 'Notu panoya taşı',
    convertDescription: 'Notun karta dönüşeceği listeyi seç.',
    convertSubmit: 'Karta dönüştür',
    convertError: 'Not karta dönüştürülemedi. Lütfen tekrar dene.',
  },
  // Kart oluşturma ekranı (DEM-203 WP5 — oluşturma menüsünden açılır).
  createCard: {
    title: 'Kart oluştur',
    // Konum seçici (workspace→pano→liste) bölüm başlığı.
    locationLabel: 'Konum',
    // Kart başlığı girişi.
    titleLabel: 'Kart başlığı',
    titlePlaceholder: 'Ne yapılacak?',
    // Katlanan opsiyonel "son tarih" bölümü tetikleyici satırı.
    dueSectionLabel: 'Son tarih',
    dueEmpty: 'Son tarih seçilmedi.',
    // Seçilen tarih satırı — `formatDueDate` çıktısı araya konur.
    dueSelected: (date: string) => `Son tarih: ${date}`,
    // Etiket/üye burada düzenlenmez — kart oluşup detayına geçilince eklenir.
    detailNote: 'Etiket ve üyeleri kart oluştuktan sonra kart detayından ekleyebilirsin.',
    // "Oluştur" butonu + hata.
    submit: 'Kartı oluştur',
    // `card.create` başarısız — kart hiç oluşmadı.
    error: 'Kart oluşturulamadı. Lütfen tekrar dene.',
    // `card.create` başarılı ama ardışık `card.update({ dueAt })` başarısız —
    // kart oluştu, yalnız son tarih kaydedilemedi (yanıltıcı olmayan mesaj).
    dueError: 'Kart oluşturuldu ama son tarih kaydedilemedi. Detaydan ekleyebilirsin.',
  },
  // Liste oluşturma ekranı (DEM-203 WP5 — oluşturma menüsünden açılır).
  createList: {
    title: 'Liste oluştur',
    // Konum seçici (workspace→pano) bölüm başlığı.
    locationLabel: 'Konum',
    // Liste başlığı girişi.
    titleLabel: 'Liste başlığı',
    titlePlaceholder: 'Liste adı',
    // "Oluştur" butonu + hata.
    submit: 'Listeyi oluştur',
    error: 'Liste oluşturulamadı. Lütfen tekrar dene.',
  },
  // Pano oluşturma ekranı (DEM-203 WP6).
  createBoard: {
    title: 'Pano oluştur',
    // Hedef çalışma alanı seçimi (LocationPicker `depth='workspace'`).
    workspaceLabel: 'Çalışma alanı',
    // Pano başlığı girişi.
    titleLabel: 'Pano başlığı',
    titlePlaceholder: 'Pano başlığını gir',
    // İkon seçimi tetikleyici satırı.
    iconLabel: 'İkon',
    // Oluştur butonu.
    submit: 'Pano oluştur',
    // `board.create` başarısız olduğunda gösterilen Alert gövdesi.
    error: 'Pano oluşturulamadı. Lütfen tekrar dene.',
  },
  // Workspace oluşturma ekranı (DEM-203 WP6).
  createWorkspace: {
    title: 'Workspace oluştur',
    // Workspace adı girişi.
    nameLabel: 'Çalışma alanı adı',
    namePlaceholder: 'Çalışma alanı adını gir',
    // İkon seçimi tetikleyici satırı.
    iconLabel: 'İkon',
    // Oluştur butonu.
    submit: 'Çalışma alanı oluştur',
    // `workspace.create` başarısız olduğunda gösterilen Alert gövdesi.
    error: 'Çalışma alanı oluşturulamadı. Lütfen tekrar dene.',
  },
  // Entity ikon seçici grid'i (pano / workspace oluşturma — DEM-203 WP6).
  entityIconPicker: {
    title: 'İkon seç',
    // Tetikleyici satırın metni — dokununca ikon grid'i açılır.
    changeAction: 'İkon değiştir',
  },
  // Kademeli konum seçici — workspace → pano → liste (DEM-203 ortak bileşen).
  locationPicker: {
    // Adım başlıkları (Sheet title).
    workspaceTitle: 'Çalışma alanı seç',
    boardTitle: 'Pano seç',
    listTitle: 'Liste seç',
    // Seçili değer gösterilmediğinde tetikleyici satırın etiketi.
    workspaceEmpty: 'Çalışma alanı seç',
    boardEmpty: 'Pano seç',
    listEmpty: 'Liste seç',
    // Bir önceki adım seçilmeden sonraki adım kilitli.
    boardLocked: 'Önce çalışma alanı seç',
    listLocked: 'Önce pano seç',
    // Yükleniyor / boş / hata durumları.
    loading: 'Yükleniyor…',
    workspaceEmptyList: 'Çalışma alanı bulunamadı.',
    boardEmptyList: 'Bu çalışma alanında pano yok.',
    listEmptyList: 'Bu panoda liste yok.',
    loadError: 'Liste yüklenemedi.',
  },
  workspaces: {
    title: 'Çalışma Alanları',
    loadError: 'Çalışma alanları yüklenemedi.',
    boardCountSuffix: 'pano',
    memberCountSuffix: 'üye',
    // Faz 15C (DEM-303) — tablet master-detail sağ pane: kullanıcı henüz
    // workspace seçmediğinde gösterilen ipucu.
    detailEmptyTitle: 'Bir çalışma alanı seç',
    detailEmptyDescription: 'Soldaki listeden bir çalışma alanı seçerek panolarını gör.',
  },
  boards: {
    loadError: 'Panolar yüklenemedi.',
    emptyTitle: 'Bu çalışma alanında pano yok',
    emptyDescription: 'Panolar oluşturuldukça burada listelenir.',
    archivedBadge: 'Arşiv',
    openSuffix: 'açık',
    doneSuffix: 'tamamlandı',
  },
  board: {
    fallbackTitle: 'Pano',
    loadError: 'Pano yüklenemedi.',
    emptyTitle: 'Bu panoda liste yok',
    emptyDescription: 'Listeler oluşturuldukça pano burada görünür.',
    emptyList: 'Kart yok',
    // Kart oluşturma composer'ı (Faz 7H — board kolonu).
    addCard: 'Kart ekle',
    addCardPlaceholder: 'Kart başlığı gir',
    addCardSubmit: 'Ekle',
    // Liste oluşturma (board şeridinin sonundaki kolon).
    addList: 'Liste ekle',
    addListPlaceholder: 'Liste başlığı gir',
    // Liste ⋮ menüsü (yeniden adlandır / arşivle).
    listActions: 'Liste işlemleri',
    renameList: 'Yeniden adlandır',
    renameListPlaceholder: 'Yeni liste başlığı',
    archiveList: 'Listeyi arşivle',
    // Kart taşıma (long-press → "move to list").
    moveCardAction: 'Kartı taşı',
    // Board ⋮ menüsü — board-seviyesi işlemler (DEM-211).
    boardActions: 'Pano işlemleri',
    boardActionsLabel: 'Pano işlemleri',
    renameBoard: 'Yeniden adlandır',
    renameBoardPlaceholder: 'Yeni pano başlığı',
    archiveBoard: 'Panoyu arşivle',
    archiveBoardConfirmTitle: 'Panoyu arşivle',
    archiveBoardConfirmBody:
      'Bu pano arşivlenecek ve salt-okunur olacak. Arşivden geri yükleyebilirsin.',
    archiveBoardConfirmAction: 'Arşivle',
    archiveBoardError: 'Pano arşivlenemedi. Lütfen tekrar dene.',
    // Klasik PDF rapor indirme (Faz 14F — DEM-296). Web ile paralel akış;
    // Faz 13S `FileSystem.downloadAsync` + `Sharing.shareAsync` deseni reuse.
    downloadReport: 'Rapor indir',
    downloadReportBusy: 'İndiriliyor…',
    downloadReportErrorTitle: 'Rapor indirilemedi',
    downloadReportErrorBody: 'Lütfen birkaç saniye sonra tekrar dene.',
    // Görünüm modu geçişi (DEM-233 — kanban kolon / dikey liste görünümü).
    // Header'a sığan ikon-only segmented control; metinler yalnız erişilebilirlik
    // etiketi olarak kullanılır.
    view: {
      kanban: 'Pano görünümü',
      list: 'Liste görünümü',
    },
  },
  // Board etiket filtresi (Faz 7E-2 — DEM-200).
  boardFilter: {
    headerLabel: 'Etikete göre filtrele',
    title: 'Etikete göre filtrele',
    description: 'Seçili etiketlerden en az birini taşıyan kartlar gösterilir.',
    clear: 'Tümünü temizle',
    empty: 'Bu panoda etiket yok.',
  },
  cardDetail: {
    fallbackTitle: 'Kart',
    loadError: 'Kart yüklenemedi.',
    completedBadge: 'Tamamlandı',
    // Kapak görseli görünüm modu (web kart modalı çift-tık paritesi) — kapağa
    // çift dokununca fit↔banner geçer. Erişilebilirlik ipucu sıradaki eylemi
    // anlatır (mevcut moda göre).
    coverViewToBanner: 'Kapağı tam kapla (çift dokun)',
    coverViewToFit: 'Kapağı sığdır (çift dokun)',
    descriptionTitle: 'Açıklama',
    noDescription: 'Açıklama eklenmemiş.',
    labelsTitle: 'Etiketler',
    membersTitle: 'Üyeler',
    dueTitle: 'Son tarih',
    checklistsTitle: 'Kontrol listeleri',
    // Faz 15C.9 (2026-05-31) — iPad'de `DescriptionChecklistTabs`'in üçüncü
    // (default) sekmesi: açıklama + kontrol listeleri yan-yana. Web kart
    // modalindeki iki-kolon layout'unun mobil iPad karşılığı.
    bothTabLabel: 'Tümü',
    commentsTitle: 'Yorumlar',
    noComments: 'Henüz yorum yok.',
    deletedComment: 'Bu yorum silindi.',
    activityTitle: 'Aktivite',
    noActivity: 'Henüz aktivite yok.',
    // Aktivite "son N + tümünü gör" genişleticisi (DEM-204).
    activityShowAll: 'Tüm aktiviteyi gör',
    activityShowLess: 'Daha az göster',
    sectionError: 'Bu bölüm yüklenemedi.',
    unknownUser: 'Bir kullanıcı',
    editedSuffix: 'düzenlendi',
    // Ortak etkileşim metinleri (Faz 7G — tam etkileşim).
    save: 'Kaydet',
    saving: 'Kaydediliyor…',
    cancel: 'Vazgeç',
    remove: 'Kaldır',
    actionError: 'İşlem tamamlanamadı. Lütfen tekrar dene.',
    // Açıklama düzenleme.
    descriptionEdit: 'Düzenle',
    descriptionPlaceholder: 'Bu karta bir açıklama ekle…',
    descriptionShowMore: 'Daha fazla göster',
    descriptionShowLess: 'Daha az göster',
    // Etiketler.
    labelsEmpty: 'Etiket eklenmemiş.',
    labelAdd: 'Etiket ekle',
    labelNoneAvailable: 'Eklenecek başka etiket yok.',
    labelUnnamed: 'İsimsiz etiket',
    // Üyeler.
    membersEmpty: 'Üye eklenmemiş.',
    memberAdd: 'Üye ekle',
    memberNoneAvailable: 'Eklenecek başka üye yok.',
    memberRemoveConfirmTitle: 'Üyeyi çıkar',
    memberRemoveConfirmBody: 'Bu üyeyi karttan çıkarmak istediğine emin misin?',
    memberRemoveAction: 'Çıkar',
    // Son tarih.
    dueEmpty: 'Son tarih belirlenmemiş.',
    dueToday: 'Bugün',
    dueTomorrow: 'Yarın',
    dueWeekend: 'Hafta sonu',
    dueNextWeek: 'Gelecek hafta',
    dueClear: 'Son tarihi kaldır',
    duePresetsLabel: 'Hazır ayarlar',
    dueCalendarLabel: 'Tarih seç',
    dueCalendarPrevMonth: 'Önceki ay',
    dueCalendarNextMonth: 'Sonraki ay',
    // Kontrol listeleri.
    checklistsEmpty: 'Bu kartta kontrol listesi yok.',
    checklistItemAdd: 'Madde ekle',
    checklistItemPlaceholder: 'Yeni madde…',
    checklistItemEdit: 'Maddeyi düzenle',
    checklistItemDelete: 'Maddeyi sil',
    // Madde sürükle-bırak sıralama (manuel reanimated sortable) erişilebilirlik
    // ipucu — satıra uzun basıp dikey sürükleyerek sırayı değiştirme.
    checklistItemReorderHint: 'Sırayı değiştirmek için uzun basıp sürükle',
    checklistAdd: 'Kontrol listesi ekle',
    checklistTitlePlaceholder: 'Liste başlığı…',
    checklistDelete: 'Kontrol listesini sil',
    checklistDeleteConfirmTitle: 'Kontrol listesini sil',
    checklistDeleteConfirmBody:
      'Bu kontrol listesi ve içindeki tüm maddeler silinecek. Bu işlem geri alınamaz.',
    checklistDeleteAction: 'Sil',
    // Yorum yazma.
    commentPlaceholder: 'Bir yorum yaz…',
    commentSubmit: 'Yorum gönder',
    commentSubmitting: 'Gönderiliyor…',
    // Yorum düzenleme / silme (Faz 7G-4).
    commentEdit: 'Düzenle',
    commentDelete: 'Sil',
    commentDeleteConfirmTitle: 'Yorumu sil',
    commentDeleteConfirmBody: 'Bu yorum silinecek. Bu işlem geri alınamaz.',
    // Kontrol listesi maddesi yorum thread'i (yapılacaklar maddesine yorum).
    // Madde satırındaki rozet + alttan açılan thread sheet'i.
    itemCommentsOpen: 'Madde yorumlarını aç',
    itemCommentsTitle: 'Madde yorumları',
    itemCommentsCountLabel: (count: number) => `${count} yorum`,
    itemCommentsEmpty: 'Bu maddeye henüz yorum yapılmadı.',
    // Başlık düzenleme + liste taşıma (Faz 7H).
    editTitleLabel: 'Kart başlığını düzenle',
    titlePlaceholder: 'Kart başlığı',
    moveAction: 'Listeyi değiştir',
    // Meta çubuğu chip'leri — değer atanmamış (placeholder) durumlar (Faz 7G-2).
    metaMembersEmpty: 'Üye',
    metaDueEmpty: 'Son tarih',
    metaLabelsEmpty: 'Etiket',
    metaListUnknown: 'Liste',
    // Tamamla / geri al toggle'ı (Faz 7G-2 — DEM-195).
    markComplete: 'Kartı tamamlandı işaretle',
    markIncomplete: 'Tamamlandı işaretini kaldır',
    // Kart işlemleri menüsü — başlık yanı ⋮ (DEM-196).
    cardActions: 'Kart işlemleri',
    cardActionsTitle: 'Kart işlemleri',
    archiveAction: 'Kartı arşivle',
    archiveConfirmTitle: 'Kartı arşivle',
    archiveConfirmBody: 'Bu kart panodan kaldırılacak. Arşivden geri yükleyebilirsin.',
    archiveConfirmAction: 'Arşivle',
    archiveError: 'Kart arşivlenemedi. Lütfen tekrar dene.',
    // Kart kapak rengi seçici (DEM-201).
    metaCoverEmpty: 'Kapak',
    coverTitle: 'Kapak rengi',
    coverEmpty: 'Kapak rengi seçilmemiş.',
    coverClear: 'Rengi kaldır',
    coverColorNames: {
      kirmizi: 'Kırmızı',
      turuncu: 'Turuncu',
      sari: 'Sarı',
      lime: 'Lime',
      yesil: 'Yeşil',
      sky: 'Gök mavisi',
      mavi: 'Mavi',
      indigo: 'İndigo',
      mor: 'Mor',
      pembe: 'Pembe',
      gri: 'Gri',
      siyah: 'Siyah',
    },
  },
  attachments: {
    // Kart eki "Ekler" bölümü (Faz 7J).
    title: 'Ekler',
    loadError: 'Ekler yüklenemedi.',
    empty: 'Henüz ek yok.',
    addAction: 'Ek ekle',
    sheetTitle: 'Ek nereden eklensin?',
    sourceCamera: 'Kamera',
    sourceGallery: 'Galeriden seç',
    sourceFiles: 'Dosya seç',
    uploading: 'Yükleniyor…',
    // Bekleyen tile'da yüzde göstergesinin önüne gelir: "Yükleniyor %42".
    uploadingProgress: 'Yükleniyor',
    uploadError: 'Dosya yüklenemedi. Lütfen tekrar dene.',
    downloadError: 'Dosya indirilemedi. Lütfen tekrar dene.',
    deleteError: 'Ek silinemedi. Lütfen tekrar dene.',
    previewError: 'Önizleme yüklenemedi.',
    actionPreview: 'Önizle',
    actionDownload: 'İndir',
    actionDelete: 'Sil',
    actionMore: 'Diğer işlemler',
    coverBadge: 'Kapak',
    confirmDeleteTitle: 'Eki sil',
    // Onay mesajında dosya adının ardına eklenir.
    confirmDeleteBody: 'kalıcı olarak silinecek. Bu işlem geri alınamaz.',
    // Yükleme öncesi opsiyonel açıklama girişi (Faz 7P).
    descriptionSheetTitle: 'Açıklama ekle',
    descriptionPlaceholder: 'Açıklama (opsiyonel)',
    descriptionUploadAction: 'Yükle',
    // Yükleme sonrası satır-içi açıklama düzenleme (Faz 7P).
    actionEditDescription: 'Açıklamayı düzenle',
    descriptionEditPlaceholder: 'Açıklama',
    descriptionEditError: 'Açıklama güncellenemedi. Lütfen tekrar dene.',
    // Ek işlemler menüsü (kebab) — Faz 7P.
    actionsSheetTitle: 'Ek işlemleri',
    // Kapak görseli işlemleri (Faz 7P) — yalnız resim ekleri.
    actionMakeCover: 'Kapak yap',
    actionRemoveCover: 'Kapağı kaldır',
    coverError: 'Kapak görseli güncellenemedi. Lütfen tekrar dene.',
    // Yükleme öncesi istemci doğrulaması (backend allowlist + 50 MiB ile aynı).
    rejectTitle: 'Dosya eklenemedi',
    rejectMime: 'Yalnızca resim, PDF ve Office dosyaları eklenebilir.',
    rejectSize: 'Dosya 50 MB boyut sınırını aşıyor.',
    rejectEmpty: 'Dosya okunamadı veya boş görünüyor.',
    // Kamera/galeri izin akışı (permission priming).
    permissionCameraTitle: 'Kamera izni gerekli',
    permissionCameraBody: 'Karta fotoğraf çekip eklemek için kamera erişimine izin ver.',
    permissionGalleryTitle: 'Galeri izni gerekli',
    permissionGalleryBody: 'Galeriden görsel eklemek için fotoğraf erişimine izin ver.',
    openSettings: 'Ayarları aç',
  },
  moveToList: {
    title: 'Kartı taşı',
    description: 'Kartın taşınacağı listeyi seç.',
    currentBadge: 'Şu an burada',
    empty: 'Taşınacak başka liste yok.',
  },
  members: {
    workspaceTitle: 'Üyeler',
    boardTitle: 'Pano üyeleri',
    loadError: 'Üyeler yüklenemedi.',
    emptyTitle: 'Üye yok',
    emptyDescription: 'Çalışma alanına üye eklendikçe burada listelenir.',
    inheritedBadge: 'Devralındı',
    // Workspace rol etiketleri (owner / admin / member / guest).
    roleOwner: 'Sahip',
    roleAdmin: 'Yönetici',
    roleMember: 'Üye',
    roleGuest: 'Misafir',
    // Board rol etiketleri (admin / member / viewer).
    boardRoleAdmin: 'Yönetici',
    boardRoleMember: 'Üye',
    boardRoleViewer: 'İzleyici',
    // Satır-içi davet formu.
    inviteToggle: 'Üye davet et',
    inviteCancel: 'Vazgeç',
    inviteEmailLabel: 'E-posta',
    inviteEmailPlaceholder: 'ornek@eposta.com',
    inviteRoleLabel: 'Rol',
    inviteSubmit: 'Davet gönder',
    inviteSubmitting: 'Gönderiliyor…',
    inviteSuccess: 'Davet gönderildi.',
    // `board.members.add` hesabı olan kullanıcıyı doğrudan ekler (davet yok).
    memberAdded: 'Üye eklendi.',
    inviteEmailRequired: 'Lütfen bir e-posta adresi gir.',
    inviteEmailInvalid: 'Geçerli bir e-posta adresi gir.',
    // "Sen" rozeti — çağıranın kendi satırını işaretler.
    youBadge: 'Sen',
    // Üye satırı aksiyon menüsü (DEM-210).
    actionsLabel: 'Üye işlemleri',
    actionsSheetTitle: 'Üye işlemleri',
    changeRoleTitle: 'Rolü değiştir',
    changeRoleSubmit: 'Rolü güncelle',
    changeRoleSubmitting: 'Güncelleniyor…',
    removeMember: 'Üyeyi çıkar',
    removing: 'Çıkarılıyor…',
    removeConfirmTitle: 'Üyeyi çıkar',
    removeConfirmMessage: 'Bu üyeyi çıkarmak istediğine emin misin?',
    removeConfirm: 'Çıkar',
    actionError: 'İşlem tamamlanamadı. Lütfen tekrar dene.',
  },
  invitations: {
    sectionTitle: 'Bekleyen davetler',
    workspaceKind: 'Çalışma alanı',
    boardKind: 'Pano',
    invitedByPrefix: 'Davet eden:',
    accept: 'Kabul et',
    decline: 'Reddet',
    accepting: 'Kabul ediliyor…',
    declining: 'Reddediliyor…',
    actionError: 'İşlem tamamlanamadı. Lütfen tekrar dene.',
    accepted: 'Davet kabul edildi.',
    declined: 'Davet reddedildi.',
    // Gönderilen davetler bölümü + iptal (DEM-210).
    sentSectionTitle: 'Gönderilen davetler',
    cancel: 'Daveti iptal et',
    cancelling: 'İptal ediliyor…',
    cancelConfirmTitle: 'Daveti iptal et',
    cancelConfirmMessage: 'Bu daveti iptal etmek istediğine emin misin?',
    cancelConfirm: 'İptal et',
    actionsLabel: 'Davet işlemleri',
  },
  onboarding: {
    title: "Pusula'ya hoş geldin",
    description:
      'Çalışma alanların ve panoların burada görünecek. Bir çalışma alanına eklendiğinde ya da oluşturduğunda bu ekran panolarınla dolacak.',
  },
  search: {
    // Global arama sekmesi başlığı (native header yok — ekran içi başlık).
    globalTitle: 'Arama',
    // Board içi arama ekranı (native header) başlığı.
    boardTitle: 'Pano içinde ara',
    inputPlaceholderGlobal: 'Pano, liste, kart, yorum ara…',
    inputPlaceholderBoard: 'Bu panoda ara…',
    inputAccessibilityLabel: 'Arama',
    clear: 'Aramayı temizle',
    promptTitle: 'Aramaya başla',
    promptBody: 'Aramak için en az 2 karakter yaz.',
    loading: 'Aranıyor…',
    emptyTitle: 'Sonuç bulunamadı',
    emptyBody: 'Farklı bir anahtar kelime dene.',
    errorTitle: 'Arama yapılamadı',
    errorBody: 'Sonuçlar getirilemedi. Lütfen tekrar dene.',
    // Board içi arama ekranı geçersiz/eksik `boardId` ile açıldığında.
    unavailableTitle: 'Arama açılamadı',
    // Sonuç grubu başlıkları (entity tipi → çoğul Türkçe etiket).
    entityTypes: {
      board: 'Panolar',
      list: 'Listeler',
      card: 'Kartlar',
      comment: 'Yorumlar',
      attachment: 'Ekler',
      label: 'Etiketler',
    },
  },
  notifications: {
    // Bildirim merkezi ekranı (Faz 7K).
    title: 'Bildirimler',
    markAllRead: 'Tümünü okundu işaretle',
    /** Tek bildirim satırını sola kaydırınca çıkan "okundu" aksiyonu. */
    markReadAction: 'Okundu',
    openSettings: 'Bildirim ayarları',
    loadErrorTitle: 'Bildirimler yüklenemedi',
    loadErrorBody: 'Bağlantını kontrol edip tekrar dene.',
    emptyTitle: 'Henüz bildirim yok',
    emptyBody: 'Sana yönelik aktiviteler burada görünecek.',
    loadMore: 'Daha fazla yükle',
    loadingMore: 'Yükleniyor…',
    unreadLabel: 'Okunmamış',
    /** Başlık altı okunmamış sayısı özeti: `${n} okunmamış`. */
    unreadSummary: (n: number) => `${n} okunmamış`,
    systemBadge: 'Sistem',
    // Aktör adı / kart / board / workspace yedek metinleri.
    fallbackActorName: 'Bir kullanıcı',
    fallbackCardTitle: 'bu kart',
    fallbackBoardName: 'bu pano',
    fallbackWorkspaceName: 'bu çalışma alanı',
    fallbackListName: 'bir liste',
    fallbackLabelName: 'bir etiket',
    // Tarih grup başlıkları (web bildirim merkezi simetrisi).
    groups: {
      today: 'Bugün',
      yesterday: 'Dün',
      thisWeek: 'Bu hafta',
      earlier: 'Daha eski',
    },
    // Aktör-prefixsiz özet metinleri (web `activity-summary.ts` ile aynı).
    //
    // İçerik sözleşmesi (2026-06-20, `docs/domain/04-bildirim-kurallari.md`):
    // "takip ettiğin" ön eki yok; karta/listeye/etikete ilişkin metinler
    // mümkünse **pano bağlamı** taşır. Pano bağlamı ek-güvenli kalıpla
    // (`"<pano>" panosunda `) jenerik "pano" kelimesine ek getirir — board adı
    // boşsa `boardCtx` boş string döner, cümle graceful kalır. Worker
    // `renderNotificationPush` ile simetrik.
    summary: {
      /**
       * Ek-güvenli pano bağlamı öneki. Doluysa `"<pano>" panosunda ` döner
       * (locative ek jenerik "pano" kelimesine gelir → ek-uyumu hep doğru);
       * boşsa boş string (pano kısmı düşer). Worker `boardContextPrefix` eşleniği.
       */
      boardCtx: (boardName?: string) =>
        boardName && boardName.trim().length > 0 ? `"${boardName}" panosunda ` : '',
      cardMemberAdded: (cardTitle: string, boardCtx = '') =>
        `sana ${boardCtx}"${cardTitle}" kartını atadı`,
      commentMentioned: (cardTitle: string, commentPreview?: string, boardCtx = '') =>
        commentPreview
          ? `${boardCtx}"${cardTitle}" kartında senden bahsetti: "${commentPreview}"`
          : `${boardCtx}"${cardTitle}" kartındaki bir yorumda senden bahsetti`,
      commentCreated: (cardTitle: string, commentPreview?: string, boardCtx = '') =>
        commentPreview
          ? `${boardCtx}"${cardTitle}" kartında yorum bıraktı: "${commentPreview}"`
          : `${boardCtx}"${cardTitle}" kartında yorum bıraktı`,
      dueApproaching: (cardTitle: string) => `"${cardTitle}" kartının teslim tarihi yaklaşıyor`,
      dueReminder1d: (cardTitle: string) => `"${cardTitle}" kartı yarın teslim ediliyor`,
      dueReminder1h: (cardTitle: string) => `"${cardTitle}" kartı 1 saat sonra teslim ediliyor`,
      dueOverdue: (cardTitle: string) => `"${cardTitle}" kartının teslim tarihi geçti`,
      boardMemberInvited: (boardName: string) => `seni "${boardName}" panosuna davet etti`,
      boardMemberAdded: (boardName: string) => `seni "${boardName}" panosuna ekledi`,
      workspaceMemberInvited: (workspaceName: string) =>
        `seni "${workspaceName}" çalışma alanına davet etti`,
      boardAccessRequested: (boardName: string) => `"${boardName}" panosuna erişim istedi`,
      watchedActivity: (cardTitle: string, boardCtx = '') =>
        `${boardCtx}"${cardTitle}" kartında değişiklik yaptı`,
      checklistItemCompleted: (cardTitle: string, itemContent?: string, boardCtx = '') =>
        itemContent
          ? `"${itemContent}" maddesini tamamladı`
          : `${boardCtx}"${cardTitle}" kartındaki bir maddeyi tamamladı`,
      cardArchived: (cardTitle: string, boardCtx = '') =>
        `${boardCtx}"${cardTitle}" kartını arşivledi`,
      cardCompleted: (cardTitle: string, boardCtx = '') =>
        `${boardCtx}"${cardTitle}" kartını tamamlandı işaretledi`,
      /**
       * card_moved — liste geçişi: kaynak + hedef liste adı varsa
       * "'Yapılacak' listesinden 'Devam Eden' listesine taşıdı"; yalnız hedef
       * varsa "'Devam Eden' listesine taşıdı"; ikisi de yoksa düz "taşıdı".
       * Worker `card_moved` push gövdesi ile simetrik.
       */
      cardMoved: (cardTitle: string, fromList?: string, toList?: string, boardCtx = '') => {
        const move =
          fromList && toList
            ? `"${fromList}" listesinden "${toList}" listesine taşıdı`
            : toList
              ? `"${toList}" listesine taşıdı`
              : 'taşıdı';
        return `${boardCtx}"${cardTitle}" kartını ${move}`;
      },
      cardUncompleted: (cardTitle: string, boardCtx = '') =>
        `${boardCtx}"${cardTitle}" kartının tamamlandı işaretini kaldırdı`,
      /**
       * card_due_changed (set) — yeni teslim tarihi cihaz-yerel kısa TR formatta
       * ("25 Haz Cmt" / saatliyse "25 Haz 14:00"). Tarih çözülemezse bağlamsız
       * yedek metne düşer. Worker `formatDueTr` eşleniği (cihaz TZ farkıyla).
       */
      cardDueSet: (cardTitle: string, dueLabel?: string, boardCtx = '') =>
        dueLabel
          ? `${boardCtx}"${cardTitle}" kartının teslim tarihini ${dueLabel} olarak ayarladı`
          : `${boardCtx}"${cardTitle}" kartı için teslim tarihi belirledi`,
      cardDueCleared: (cardTitle: string, boardCtx = '') =>
        `${boardCtx}"${cardTitle}" kartının teslim tarihini kaldırdı`,
      cardCoverChanged: (cardTitle: string, boardCtx = '') =>
        `${boardCtx}"${cardTitle}" kartının kapağını değiştirdi`,
      cardMemberRemoved: (cardTitle: string) => `seni "${cardTitle}" kartından çıkardı`,
      memberRemoved: (boardName: string) => `seni "${boardName}" panosundan çıkardı`,
      /**
       * member_role_changed — rol geçişi: eski + yeni rol varsa
       * "rolünü 'üye'den 'yönetici'e değiştirdi"; yalnız yeni rol varsa
       * "rolünü 'yönetici' yaptı"; hiçbiri yoksa "rolünü değiştirdi". Rol
       * etiketleri TR (`roleLabel`). Worker `member_role_changed` ile simetrik.
       */
      memberRoleChanged: (boardName: string, fromRole?: string, toRole?: string) => {
        const change = toRole
          ? fromRole
            ? `rolünü "${fromRole}" rolünden "${toRole}" rolüne değiştirdi`
            : `rolünü "${toRole}" rolüne değiştirdi`
          : 'rolünü değiştirdi';
        return `"${boardName}" panosundaki ${change}`;
      },
      attachmentAdded: (cardTitle: string, fileName?: string, boardCtx = '') =>
        fileName
          ? `${boardCtx}"${cardTitle}" kartına "${fileName}" ekledi`
          : `${boardCtx}"${cardTitle}" kartına bir dosya ekledi`,
      cardRenamed: (cardTitle: string, boardCtx = '') =>
        `${boardCtx}"${cardTitle}" kartının başlığını değiştirdi`,
      cardDescriptionChanged: (cardTitle: string, boardCtx = '') =>
        `${boardCtx}"${cardTitle}" kartının açıklamasını güncelledi`,
      /**
       * card_label_added / removed — etiket adı taşınır ("'Acil' etiketini
       * ekledi"); ad yoksa jenerik "bir etiket". Worker `card_label_*` eşleniği.
       */
      cardLabelAdded: (cardTitle: string, labelName?: string, boardCtx = '') =>
        labelName
          ? `${boardCtx}"${cardTitle}" kartına "${labelName}" etiketini ekledi`
          : `${boardCtx}"${cardTitle}" kartına bir etiket ekledi`,
      cardLabelRemoved: (cardTitle: string, labelName?: string, boardCtx = '') =>
        labelName
          ? `${boardCtx}"${cardTitle}" kartından "${labelName}" etiketini kaldırdı`
          : `${boardCtx}"${cardTitle}" kartından bir etiket kaldırdı`,
      commentUpdated: (cardTitle: string, boardCtx = '') =>
        `${boardCtx}"${cardTitle}" kartındaki bir yorumu düzenledi`,
      commentDeleted: (cardTitle: string, boardCtx = '') =>
        `${boardCtx}"${cardTitle}" kartındaki bir yorumu sildi`,
      checklistCreated: (cardTitle: string, boardCtx = '') =>
        `${boardCtx}"${cardTitle}" kartına bir yapılacaklar listesi ekledi`,
      checklistItemAdded: (cardTitle: string, itemContent?: string, boardCtx = '') =>
        itemContent
          ? `"${itemContent}" maddesini ekledi`
          : `${boardCtx}"${cardTitle}" kartına bir yapılacaklar maddesi ekledi`,
      checklistItemRemoved: (cardTitle: string, itemContent?: string, boardCtx = '') =>
        itemContent
          ? `"${itemContent}" maddesini sildi`
          : `${boardCtx}"${cardTitle}" kartından bir yapılacaklar maddesi sildi`,
      attachmentRemoved: (cardTitle: string, fileName?: string, boardCtx = '') =>
        fileName
          ? `${boardCtx}"${cardTitle}" kartından "${fileName}" kaldırdı`
          : `${boardCtx}"${cardTitle}" kartından bir dosya kaldırdı`,
      // Bildirim kapsamı genişletme — Faz 2 (granular tipler, 2026-06-03).
      cardCreated: (cardTitle: string, boardCtx = '') =>
        `${boardCtx}"${cardTitle}" kartını oluşturdu`,
      listCreated: (listName: string) => `"${listName}" listesini oluşturdu`,
      listRenamed: (listName: string) => `bir listenin adını "${listName}" yaptı`,
      listMoved: (listName: string) => `"${listName}" listesini taşıdı`,
      listArchived: (listName: string) => `"${listName}" listesini arşivledi`,
      listUnarchived: (listName: string) => `"${listName}" listesini arşivden çıkardı`,
      listDeleted: (listName: string) => `"${listName}" listesini sildi`,
      boardCreated: (boardName: string) => `"${boardName}" panosunu oluşturdu`,
      boardRenamed: (boardName: string) => `bir panonun adını "${boardName}" yaptı`,
      boardArchived: (boardName: string) => `"${boardName}" panosunu arşivledi`,
      boardUnarchived: (boardName: string) => `"${boardName}" panosunu arşivden çıkardı`,
      boardBackgroundChanged: (boardName: string) =>
        `"${boardName}" panosunun arka planını değiştirdi`,
      labelCreated: (labelName: string) => `"${labelName}" etiketini oluşturdu`,
      labelUpdated: (labelName: string) => `"${labelName}" etiketini güncelledi`,
      labelDeleted: (labelName: string) => `"${labelName}" etiketini sildi`,
      default: 'bir işlem yaptı',
    },
    // Bildirim detay / audit ekranı (Faz 5+6 — 2026-06-21). Bir bildirime
    // dokununca açılan tam dökümün metinleri. Sözleşme:
    // `docs/architecture/06-bildirim-altyapisi.md` + `docs/domain/04-bildirim-kurallari.md`.
    detail: {
      title: 'Bildirim',
      loadErrorTitle: 'Bildirim yüklenemedi',
      loadErrorBody: 'Bağlantını kontrol edip tekrar dene.',
      /** Tablet master-detail sağ pane'i — henüz bir bildirim seçilmedi. */
      emptyTitle: 'Bir bildirim seç',
      emptyBody: 'Soldaki listeden bir bildirime dokun, ayrıntıları burada görünsün.',
      /** "Ne yaptı" bölüm başlığı (aktör + özet). */
      whatHappened: 'Ne oldu',
      /** Sistem (aktörsüz) bildirim rozeti — satırdaki ile aynı. */
      systemActor: 'Sistem bildirimi',
      /** Tip etiketi başlığı (örn. "Kart taşındı"). */
      typeLabel: 'Bildirim tipi',
      /** Tip kategori etiketleri (web `activityCategoryLabel` simetriği). */
      categories: {
        workspace: 'Çalışma alanı',
        board: 'Pano',
        list: 'Liste',
        card: 'Kart',
        comment: 'Yorum',
        checklist: 'Yapılacaklar',
        attachment: 'Ek dosya',
        dueDate: 'Teslim tarihi',
        membership: 'Üyelik',
        other: 'Diğer',
      },
      /** "Değişiklikler" (before/after) bölüm başlığı. */
      changesTitle: 'Değişiklikler',
      /** Önce/sonra verisi olmayan (eski) bildirimlerde. */
      changesEmpty: 'Bu bildirim için önce/sonra verisi yok.',
      /** Diff satırında önce → sonra etiketleri (erişilebilirlik + dar ekran). */
      changeFrom: 'Önce',
      changeTo: 'Sonra',
      /** 2KB sınırını aşıp kırpılan metin alanı işareti. */
      truncated: '(kırpıldı)',
      /** Boş/temizlenmiş değer (örn. son tarih kaldırıldı). */
      emptyValue: '—',
      /** Katlanır ham JSON bölümü başlığı (varsayılan kapalı). */
      rawTitle: 'Ham veriyi göster',
      rawHide: 'Ham veriyi gizle',
      /** Ham JSON alt başlıkları — activity event payload + bildirim payload. */
      rawEventPayload: 'Olay verisi (activity event)',
      rawNotificationPayload: 'Bildirim verisi',
      rawNone: 'Ham veri yok.',
      /** "Karta git" butonu — kart yoksa pano/çalışma alanı hedefine gider. */
      goToCard: 'Karta git',
      goToBoard: 'Panoya git',
      goToWorkspace: 'Çalışma alanına git',
      /** Bildirimin oluşturulma zamanı tam damga başlığı. */
      receivedAt: 'Ulaştığı zaman',
    },
    // Bildirim detayı "Değişiklikler" alan etiketleri (audit diff). Web
    // `activity-detail.ts` FIELD_LABELS/VALUE_LABELS simetriği — `@pusula/domain`
    // `buildActivityChanges`'e enjekte edilir.
    audit: {
      // `from*`/`to*` (veya `old*`/`new*`) çiftinin alan etiketi (suffix → başlık).
      fields: {
        '': 'Değer',
        title: 'Başlık',
        name: 'Ad',
        slug: 'Slug',
        color: 'Renk',
        icon: 'Simge',
        iconcolor: 'Simge rengi',
        background: 'Arka plan',
        position: 'Konum',
        listid: 'Liste',
        list: 'Liste',
        due: 'Son tarih',
        dueat: 'Son tarih',
        description: 'Açıklama',
        content: 'İçerik',
        body: 'Metin',
        text: 'Metin',
        role: 'Rol',
      } as Record<string, string>,
      // Tekil skaler alanların etiketi (key → başlık).
      values: {
        title: 'Başlık',
        content: 'İçerik',
        body: 'Metin',
        text: 'Metin',
        filename: 'Dosya',
        mimetype: 'Dosya türü',
        sizebytes: 'Boyut',
        role: 'Rol',
        archived: 'Arşiv durumu',
        hasdescription: 'Açıklama',
        email: 'E-posta',
        labelname: 'Etiket',
      } as Record<string, string>,
      // Skaler hücre Türkçeleştirme (boolean / rol değerleri).
      archivedYes: 'Arşivlendi',
      archivedNo: 'Geri yüklendi',
      booleanYes: 'Evet',
      booleanNo: 'Hayır',
      roleAssignee: 'Sorumlu',
      roleWatcher: 'İzleyen',
    },
  },
  notificationSettings: {
    // Bildirim ayarları ekranı (pushed route — Faz 7K).
    title: 'Bildirim ayarları',
    // Hero alt açıklaması (2026-06-21 tasarım çizgisi).
    subtitle: 'Hangi bildirimleri, hangi kanaldan ve ne zaman alacağını yönet.',
    loadError: 'Bildirim ayarları yüklenemedi.',
    actionError: 'İşlem tamamlanamadı. Lütfen tekrar dene.',
    // Genel kanallar bölümü.
    channels: {
      title: 'Genel kanallar',
      description: 'Bildirimlerin hangi kanallardan ulaşacağını belirle.',
      inApp: 'Uygulama içi',
      inAppHint: 'Her zaman açık',
      email: 'E-posta',
      push: 'Anlık bildirim',
    },
    // Mute (sustur) seviyesi.
    mute: {
      title: 'Sustur seviyesi',
      none: 'Tüm bildirimler',
      mentionsOnly: 'Yalnızca bahsetmeler',
      all: 'Tümünü sustur',
      bypassNote:
        'Davetler ve senden bahsedilen yorumlar sustur ayarından etkilenmez; her durumda ulaşır.',
    },
    // Tip × kanal matrisi.
    matrix: {
      title: 'Bildirim tipleri',
      description:
        'Her tipin hangi kanaldan geleceği. Tip-bazlı ayar yakında; şimdilik genel kanal ayarı geçerli.',
      channelInApp: 'Uygulama içi',
      channelEmail: 'E-posta',
      channelPush: 'Anlık',
      cellOn: 'Açık',
      cellOff: 'Kapalı',
      cellBypass: 'Her zaman',
      cellUnavailable: 'Yok',
      groups: {
        mentions: 'Atama & bahsetme',
        comment: 'Yorum',
        dueDate: 'Teslim tarihi',
        lifecycle: 'Kart aktivitesi',
        boardLifecycle: 'Pano & liste aktivitesi',
        label: 'Etiketler',
        membership: 'Üyelik',
        invitations: 'Davetler',
      },
      types: {
        cardAssigned: 'Kart atandı',
        mention: 'Senden bahsedildi',
        commentReply: 'Yorum yanıtı',
        commentUpdated: 'Yorum düzenlendi',
        commentDeleted: 'Yorum silindi',
        dueApproaching: 'Teslim tarihi yaklaşıyor',
        dueOverdue: 'Teslim tarihi geçti',
        dueChanged: 'Teslim tarihi değişti',
        cardMoved: 'Kart taşındı',
        cardArchived: 'Kart arşivlendi',
        cardCompleted: 'Kart tamamlandı',
        cardCoverChanged: 'Kart kapağı değişti',
        attachmentAdded: 'Dosya eklendi',
        cardRenamed: 'Kart adı değişti',
        cardDescriptionChanged: 'Kart açıklaması değişti',
        cardLabelAdded: 'Etiket eklendi',
        cardLabelRemoved: 'Etiket kaldırıldı',
        checklistCreated: 'Kontrol listesi eklendi',
        checklistItemAdded: 'Kontrol maddesi eklendi',
        checklistItemRemoved: 'Kontrol maddesi kaldırıldı',
        attachmentRemoved: 'Dosya kaldırıldı',
        checklistItemCompleted: 'Kontrol maddesi tamamlandı',
        cardMemberRemoved: 'Karttan çıkarıldın',
        memberRemoved: 'Üyelikten çıkarıldın',
        memberRoleChanged: 'Rol değişti',
        boardMemberAdded: 'Panoya eklendin',
        boardAccessRequested: 'Pano erişim talebi',
        boardInvitation: 'Pano daveti',
        workspaceInvitation: 'Çalışma alanı daveti',
        // Bildirim kapsamı genişletme — Faz 2 (granular tipler, 2026-06-03).
        cardCreated: 'Kart oluşturuldu',
        listCreated: 'Liste oluşturuldu',
        listRenamed: 'Liste yeniden adlandırıldı',
        listMoved: 'Liste taşındı',
        listArchived: 'Liste arşivlendi',
        listDeleted: 'Liste silindi',
        boardCreated: 'Pano oluşturuldu',
        boardRenamed: 'Pano yeniden adlandırıldı',
        boardArchived: 'Pano arşivlendi',
        boardBackgroundChanged: 'Pano arka planı değişti',
        labelCreated: 'Etiket oluşturuldu',
        labelUpdated: 'Etiket güncellendi',
        labelDeleted: 'Etiket silindi',
      },
    },
    // Scope override bölümü.
    scopes: {
      title: 'Kapsam ayarları',
      description: 'Belirli çalışma alanı veya panolar için ayrı sustur seviyesi.',
      empty: 'Henüz kapsam ayarı yok.',
      loadError: 'Kapsam ayarları yüklenemedi.',
      kindWorkspace: 'Çalışma alanı',
      kindBoard: 'Pano',
      kindCard: 'Kart',
      remove: 'Kaldır',
      removing: 'Kaldırılıyor…',
    },
    // Sessiz saatler bölümü.
    quiet: {
      title: 'Sessiz saatler',
      description: 'Bu aralıkta e-posta ve anlık bildirimler susturulur.',
      toggleLabel: 'Sessiz saatler açık',
      from: 'Başlangıç',
      to: 'Bitiş',
      timezone: 'Zaman dilimi',
      timePlaceholder: 'SS:DD',
      invalidTime: 'Saat SS:DD biçiminde olmalı (örn. 23:00).',
      invalidWindow: 'Başlangıç ve bitiş saati aynı olamaz.',
      preview: (from: string, to: string) => `${from} – ${to} arası sessiz`,
      bypassNote: 'Davetler ve bahsetmeler sessiz saatlerde de ulaşır.',
    },
    // Cihazlar bölümü.
    devices: {
      title: 'Cihazlar',
      description: 'Anlık bildirim alan cihazların.',
      empty: 'Kayıtlı cihaz yok.',
      loadError: 'Cihazlar yüklenemedi.',
      lastUsed: (relative: string) => `Son kullanım ${relative}`,
      platformIos: 'iOS',
      platformAndroid: 'Android',
      platformWeb: 'Web',
      unnamedDevice: 'İsimsiz cihaz',
    },
  },
  push: {
    // Bildirim izni priming (pre-prompt) Sheet'i — Faz 7L. OS izin dialog'u
    // doğrudan açılmadan önce neden bildirim istendiğini anlatır.
    primerTitle: 'Bildirimleri aç',
    primerBody:
      'Sana atanan kartlar, yorumlar, senden bahsedilen mesajlar ve yaklaşan son tarihler için anlık bildirim al.',
    primerAllow: 'İzin ver',
    primerDismiss: 'Şimdi değil',
  },
  account: {
    title: 'Hesap',
    // Görünüm / tema seçici (DEM-207).
    appearanceTitle: 'Görünüm',
    // Hero alt açıklaması + bölüm etiketleri (2026-06-21 tasarım çizgisi).
    appearanceSubtitle: 'Uygulamanın temasını ve renk paletini kişiselleştir.',
    appearanceModeLabel: 'Tema',
    theme: {
      light: 'Açık',
      dark: 'Koyu',
      system: 'Sistem',
    },
    // Renk paleti seçici (§13.7.7) — 15 palet swatch grid'i. Etiketler web
    // (`apps/web` strings.shell.colorTheme.themes) ile hizalı tutulur.
    colorThemeTitle: 'Renk teması',
    colorThemes: {
      emerald: 'Varsayılan',
      slate: 'Arduvaz',
      zinc: 'Çinko',
      stone: 'Taş',
      neutral: 'Doğal',
      rose: 'Gül',
      red: 'Kırmızı',
      orange: 'Turuncu',
      amber: 'Kehribar',
      green: 'Yeşil',
      blue: 'Mavi',
      cyan: 'Turkuaz',
      violet: 'Menekşe',
      whatsapp: 'WhatsApp',
      discord: 'Discord',
    },
    // Yazı tipi ailesi seçici (§13.7.7, Faz 3) — 8 seçenek; etiketler web
    // (`apps/web` strings.shell.fontFamily.options) ile hizalı.
    fontFamilyTitle: 'Yazı tipi',
    fontFamilies: {
      poppins: 'Poppins',
      inter: 'Inter',
      system: 'Sistem yazı tipi',
      lora: 'Lora',
      manrope: 'Manrope',
      'dm-sans': 'DM Sans',
      'jetbrains-mono': 'JetBrains Mono',
      atkinson: 'Atkinson Hyperlegible',
    },
    // Yazı boyutu seçici (§13.7.7, Faz 4) — %90-120, adım %5.
    fontSizeTitle: 'Yazı boyutu',
    fontSizeDecrease: 'Yazıyı küçült',
    fontSizeIncrease: 'Yazıyı büyüt',
    fontSizeReset: 'Sıfırla',
    // Önizleme satırı — seçili aile + boyutla render edilir.
    fontPreview: 'Aa Pusula',
    // Bölüm başlıkları + satırları (DEM-208).
    notificationsTitle: 'Bildirimler',
    notificationSettingsRow: 'Bildirim ayarları',
    securityTitle: 'Hesap ve güvenlik',
    // Tek "Güvenlik" sayfası (şifre değiştir + hesabı sil tek ekranda) — sol
    // liste satırı + sayfa/pane başlığı. Alt bölüm başlıkları için
    // `changePasswordRow` / `deleteAccountRow` kullanılır.
    securityRow: 'Güvenlik',
    // Güvenlik sayfası hero alt açıklaması (2026-06-21 tasarım çizgisi).
    securitySubtitle: 'Şifreni değiştir veya hesabını kalıcı olarak sil.',
    changePasswordRow: 'Şifre değiştir',
    deleteAccountRow: 'Hesabı sil',
    aboutTitle: 'Hakkında',
    aboutRow: 'Hakkında',
    versionRow: 'Sürüm',
    privacyPolicyRow: 'Gizlilik Politikası',
    termsRow: 'Kullanım Koşulları',
    // Faz 15C (DEM-303) — tablet master-detail sağ pane empty state.
    detailEmptyTitle: 'Bir ayar seç',
    detailEmptyDescription: 'Soldaki listeden bir ayar başlığına dokunarak detayını aç.',
  },
  // "Hakkında" görünümü — uygulama kimliği + ürün anlatımı + öne çıkanlar +
  // bilgi/bağlantılar. Metinler web landing (`apps/web` strings.signIn.landing
  // + home.hero) anlatımıyla hizalıdır.
  about: {
    title: 'Hakkında',
    intro:
      'Pusula; çalışma alanı, pano ve kartlarınızı akıcı sürükle-bırak ' +
      'deneyimiyle yönetmenizi sağlar. İşleriniz web, mobil ve masaüstünde her an ' +
      'birbiriyle senkron.',
    featuresTitle: 'Öne çıkanlar',
    features: {
      boards: {
        title: 'Akıcı kanban panoları',
        text: 'Kartları sürükle-bırak ile saniyeler içinde düzenleyin.',
      },
      permissions: {
        title: 'Çalışma alanı ve yetki',
        text: 'Her ekip için rol ve erişim düzeni net, sunucu tarafında denetimli.',
      },
      notifications: {
        title: 'Anlık bildirimler',
        text: 'Önemli her değişiklik bildirim ve aktivite geçmişiyle gelir.',
      },
      sync: {
        title: 'Her yerde senkron',
        text: 'Panolarınız web, mobil ve masaüstünde aynı anda güncel kalır.',
      },
    },
    infoTitle: 'Bilgi',
    versionLabel: 'Sürüm',
    websiteRow: 'Web sitesi',
    termsRow: 'Kullanım Şartları',
    copyright: '© 2026 Pusula · Tüm hakları saklıdır.',
  },
  // "Gizlilik Politikası" görünümü — kimlik + özet güvenceler + ayrıntılı
  // bölümler + iletişim. İçerik web `apps/web/src/app/gizlilik/page.tsx` ile
  // birebir hizalıdır (App Store gizlilik beyanıyla tutarlı). Mobilde WebView
  // yerine native, i18n uyumlu zengin görünüm (`about` ile simetrik).
  privacy: {
    title: 'Gizlilik Politikası',
    // Politikanın yürürlük/son güncelleme tarihi (web sayfasıyla aynı).
    lastUpdated: '19 Mayıs 2026',
    lastUpdatedLabel: (date: string) => `Son güncelleme: ${date}`,
    intro:
      'Pusula; ekiplerin işlerini pano, liste ve kartlarla yönettiği bir görev ' +
      'yönetim uygulamasıdır. Bu politika, Pusula’yı web ve mobilde kullandığında ' +
      'hangi kişisel verilerin işlendiğini, neden işlendiğini ve haklarını açıklar.',
    // Özet güvenceler — üst kart (about "öne çıkanlar" simetrisi).
    assurancesTitle: 'Kısaca',
    assurances: {
      noAds: {
        title: 'Reklam ve izleme yok',
        text: 'Üçüncü taraf reklam ağı kullanmaz, seni uygulamalar arası izlemeyiz.',
      },
      noSell: {
        title: 'Satılmaz, kiralanmaz',
        text: 'Verilerin pazarlama amacıyla üçüncü taraflara satılmaz veya kiralanmaz.',
      },
      secured: {
        title: 'Şifreli ve denetimli',
        text: 'Veriler TLS ile aktarılır; erişim yetkisi her istekte sunucuda denetlenir.',
      },
      deletable: {
        title: 'İstediğin an sil',
        text: 'Hesabını uygulama içinden silebilir, verilerinin kaldırılmasını isteyebilirsin.',
      },
    },
    // Ayrıntılı bölümler — web `gizlilik/page.tsx` Section'larıyla birebir.
    // `key` → ikon eşlemesi view'da (`SECTION_ICONS`); metin framework-bağımsız.
    sectionsTitle: 'Ayrıntılar',
    sections: [
      {
        key: 'controller',
        title: '1. Veri Sorumlusu',
        intro:
          'Pusula, Abdullah Demirkol tarafından bağımsız bir geliştirici olarak ' +
          'sunulur. Veri sorumlusuyla iletişim için aşağıdaki “İletişim” bölümündeki ' +
          'e-posta adresini kullanabilirsin.',
      },
      {
        key: 'data',
        title: '2. İşlenen Veriler',
        bullets: [
          'Hesap bilgileri: ad, e-posta ve şifre (şifreler geri döndürülemez biçimde saklanır).',
          'İçerik verileri: oluşturduğun pano, liste, kart, açıklama, yorum, kontrol listesi ve etiketler.',
          'Yüklenen dosyalar: kartlara eklediğin görsel ve belgeler.',
          'Bildirim verileri: anlık bildirim gönderebilmek için cihaz bildirim jetonu.',
          'Teşhis verileri: uygulama çökme ve hata kayıtları.',
          'Kullanım verileri: hizmetin çalışması için gereken oturum ve etkinlik kayıtları.',
        ],
      },
      {
        key: 'purpose',
        title: '3. Verilerin İşlenme Amaçları',
        bullets: [
          'Hesabını oluşturmak ve kimliğini doğrulamak.',
          'Pano, kart ve içeriklerini saklamak ve sana göstermek.',
          'Ekip üyeleriyle gerçek zamanlı iş birliğini sağlamak.',
          'Atama, yaklaşan son tarih ve yorum bildirimleri göndermek.',
          'Hataları teşhis etmek ve hizmeti iyileştirmek.',
        ],
      },
      {
        key: 'legal',
        title: '4. Hukuki Sebep',
        intro:
          'Kişisel verilerin, hizmeti sunabilmek için sözleşmenin ifası ve meşru ' +
          'menfaat hukuki sebeplerine dayanılarak işlenir.',
      },
      {
        key: 'providers',
        title: '5. Hizmet Sağlayıcılar ve Aktarım',
        intro: 'Pusula, hizmeti sunmak için sınırlı sayıda hizmet sağlayıcı kullanır:',
        bullets: [
          'E-posta gönderimi (Resend)',
          'Anlık bildirim teslimi (Expo)',
          'Hata ve çökme izleme (Sentry)',
          'Sunucu ve dosya depolama altyapısı (barındırma sağlayıcısı)',
        ],
        outro:
          'Bu sağlayıcılar verilerine yalnızca hizmeti sunmak için gereken ölçüde ' +
          'erişir. Pusula verilerini pazarlama amacıyla üçüncü taraflara satmaz veya kiralamaz.',
      },
      {
        key: 'ads',
        title: '6. Reklam ve İzleme',
        intro:
          'Pusula üçüncü taraf reklam ağı kullanmaz ve seni uygulamalar veya ' +
          'siteler arasında izlemez.',
      },
      {
        key: 'retention',
        title: '7. Veri Saklama ve Silme',
        intro:
          'Verilerin hesabın aktif olduğu sürece saklanır. Hesabını uygulama ' +
          'içinden silebilirsin; hesap silindiğinde kişisel verilerin ve içeriklerin ' +
          'makul süre içinde kalıcı olarak silinir (yasal saklama yükümlülükleri saklıdır).',
      },
      {
        key: 'security',
        title: '8. Veri Güvenliği',
        intro:
          'Veriler aktarım sırasında HTTPS/TLS ile şifrelenir; şifreler geri ' +
          'döndürülemez biçimde saklanır; içeriklere erişim yetkisi sunucu tarafında ' +
          'her istekte denetlenir.',
      },
      {
        key: 'rights',
        title: '9. Haklarınız (KVKK m. 11)',
        intro:
          'Kişisel verilerinin işlenip işlenmediğini öğrenme, bilgi talep etme, ' +
          'düzeltilmesini veya silinmesini isteme ve işlenmesine itiraz etme haklarına ' +
          'sahipsin. Taleplerini aşağıdaki “İletişim” bölümündeki e-posta adresine iletebilirsin.',
      },
      {
        key: 'children',
        title: '10. Çocukların Gizliliği',
        intro: 'Pusula 13 yaşın altındaki kullanıcılara yönelik değildir.',
      },
      {
        key: 'changes',
        title: '11. Değişiklikler',
        intro:
          'Bu politika zaman zaman güncellenebilir; önemli değişiklikler uygulama ' +
          'üzerinden duyurulur. Güncel sürüm her zaman web sitesindeki bu sayfada yer alır.',
      },
    ],
    // İletişim + tam metin bağlantısı.
    contactTitle: 'İletişim',
    contactRow: 'E-posta gönder',
    contactEmail: 'pusulaportal@gmail.com',
    fullPolicyRow: 'Tam politikayı web’de aç',
    copyright: '© 2026 Pusula · Tüm hakları saklıdır.',
  },
  // "Kullanım Koşulları" görünümü — kimlik + özet + ayrıntılı bölümler +
  // iletişim. İçerik web `apps/web/src/app/terms/page.tsx` ile birebir hizalıdır.
  // Mobilde WebView yerine native, i18n uyumlu zengin görünüm (`privacy` ile simetrik).
  terms: {
    title: 'Kullanım Koşulları',
    // Koşulların yürürlük/son güncelleme tarihi (web sayfasıyla aynı).
    lastUpdated: '1 Haziran 2026',
    lastUpdatedLabel: (date: string) => `Son güncelleme: ${date}`,
    intro:
      'Aşağıdaki koşullar, Pusula görev yönetim uygulamasını (“Hizmet”) web ve ' +
      'mobilde kullanımını düzenler. Hizmet’i kullanarak bu koşulları kabul etmiş ' +
      'sayılırsın. Koşulları kabul etmiyorsan Hizmet’i kullanma.',
    // Özet — üst kart (privacy "güvenceler" simetrisi).
    summaryTitle: 'Kısaca',
    summary: {
      ownContent: {
        title: 'İçeriğin senin',
        text: 'Oluşturduğun pano, liste, kart ve dosyalar sana aittir.',
      },
      free: {
        title: 'Şu an ücretsiz',
        text: 'Pusula şu anda ücretsiz sunulur; ücretli plan eklenirse açıkça gösterilir.',
      },
      fairUse: {
        title: 'Adil kullanım',
        text: 'Yasalara ve diğer kullanıcıların haklarına saygılı bir kullanım beklenir.',
      },
      leaveAnytime: {
        title: 'İstediğin an ayrıl',
        text: 'Hesabını dilediğin zaman uygulama içinden silebilirsin.',
      },
    },
    // Ayrıntılı bölümler — web `terms/page.tsx` Section'larıyla birebir.
    // `key` → ikon eşlemesi view'da (`SECTION_ICONS`); metin framework-bağımsız.
    sectionsTitle: 'Ayrıntılar',
    sections: [
      {
        key: 'provider',
        title: '1. Hizmet Sağlayıcı',
        intro:
          'Pusula, Abdullah Demirkol tarafından bağımsız bir geliştirici olarak ' +
          'sunulmaktadır. İletişim için aşağıdaki “İletişim” bölümündeki e-posta adresini kullanabilirsin.',
      },
      {
        key: 'account',
        title: '2. Hesap ve Güvenlik',
        bullets: [
          'Hizmet’i kullanmak için doğru ve güncel bilgilerle bir hesap oluşturmalısın.',
          'Hesap kimlik bilgilerinin gizliliğinden ve hesabın üzerinden yapılan tüm işlemlerden sen sorumlusun.',
          'Yetkisiz bir erişim fark ettiğinde derhal aşağıdaki iletişim adresine bildirmelisin.',
          '13 yaşın altındaki kullanıcılar Hizmet’i kullanamaz.',
        ],
      },
      {
        key: 'ownership',
        title: '3. İçerik Mülkiyeti',
        intro:
          'Hizmet üzerinde oluşturduğun panolar, listeler, kartlar, açıklamalar, ' +
          'yorumlar, kontrol listeleri ve yüklediğin dosyalar (“Kullanıcı İçeriği”) ' +
          'sana aittir. Pusula; Hizmet’i işletmek, sana sunmak, ekip üyelerinle ' +
          'paylaşmak ve teknik olarak işlemek (yedekleme, görüntüleme, dağıtım) ' +
          'amacıyla Kullanıcı İçeriği üzerinde gerekli sınırlı bir kullanım hakkına sahiptir.',
        outro:
          'Yüklediğin içeriğin gerekli haklarına sahip olduğunu ve üçüncü kişilerin ' +
          'haklarını ihlal etmediğini taahhüt edersin.',
      },
      {
        key: 'acceptableUse',
        title: '4. Kabul Edilebilir Kullanım',
        intro: 'Hizmet’i kullanırken aşağıdakileri yapmamayı kabul edersin:',
        bullets: [
          'Yürürlükteki mevzuata veya üçüncü kişi haklarına aykırı içerik yüklemek.',
          'Yasadışı, taciz edici, nefret söylemi içeren, müstehcen, şiddet içeren veya yanıltıcı içerik paylaşmak.',
          'Hizmet’in altyapısına aşırı yük bindirmek, otomatik araçlarla kötüye kullanmak veya güvenlik mekanizmalarını aşmaya çalışmak.',
          'Başka kullanıcıların hesaplarına yetkisiz erişim sağlamaya çalışmak.',
          'Zararlı yazılım, virüs veya benzeri kodları yüklemek veya iletmek.',
          'Hizmet’i izinsiz olarak yeniden satmak veya üçüncü kişilere kiralamak.',
        ],
        outro:
          'Bu kurallara aykırı kullanım, hesabının askıya alınması veya sonlandırılmasına yol açabilir.',
      },
      {
        key: 'pricing',
        title: '5. Ücretlendirme',
        intro:
          'Pusula şu anda ücretsiz olarak sunulmaktadır. İleride ücretli planlar veya ' +
          'özellikler eklenirse, ücretlendirme ayrı bir sözleşme veya satın alma akışıyla ' +
          'açıkça gösterilecektir. Ücretsiz kalan özellikler bu koşullara tabi olmaya devam eder.',
      },
      {
        key: 'availability',
        title: '6. Hizmet Değişiklikleri ve Kullanılabilirlik',
        intro:
          'Hizmet’i geliştirmek, değiştirmek veya bazı özellikleri sonlandırmak hakkımız ' +
          'saklıdır. Önemli değişiklikler uygulama içinden veya e-posta ile makul süre önce duyurulur.',
        outro:
          'Hizmet’in kesintisiz veya hatasız çalışacağı garanti edilmez; planlı bakım, ' +
          'üçüncü taraf sağlayıcı kesintileri veya öngörülemeyen teknik sorunlar nedeniyle ' +
          'erişimin geçici olarak kısıtlanabileceğini kabul edersin.',
      },
      {
        key: 'termination',
        title: '7. Hesap Sonlandırma',
        intro:
          'Hesabını dilediğin zaman uygulama içinden silebilirsin. Hesap silindiğinde ' +
          'verilerin Gizlilik Politikası’nda açıklanan şekilde silinir. Bu koşullara aykırılık ' +
          'veya kötüye kullanım hâlinde Pusula, hesabını önceden bildirimde bulunarak veya ' +
          'açıkça aykırı durumlarda derhal askıya alma ya da sonlandırma hakkını saklı tutar.',
      },
      {
        key: 'liability',
        title: '8. Sorumluluk Sınırlaması',
        intro:
          'Hizmet “olduğu gibi” ve “kullanılabilir olduğu sürece” sunulur. Yasal olarak ' +
          'izin verilen azami ölçüde, Pusula; veri kaybı, kâr kaybı, iş kesintisi veya dolaylı ' +
          'zararlar dâhil olmak üzere Hizmet’in kullanımı veya kullanılamamasından doğan ' +
          'zararlardan sorumlu tutulamaz.',
        outro: 'Bu sınırlama, sorumluluğun yasal olarak sınırlanamayacağı durumlarda uygulanmaz.',
      },
      {
        key: 'thirdParty',
        title: '9. Üçüncü Taraf Hizmetleri',
        intro:
          'Pusula; e-posta gönderimi, anlık bildirim teslimi, hata izleme ve sunucu/dosya ' +
          'depolama altyapısı için üçüncü taraf hizmet sağlayıcılar kullanır. Bu sağlayıcıların ' +
          'kendi koşulları ve gizlilik uygulamaları geçerlidir. Ayrıntı için Gizlilik Politikası’na bakabilirsin.',
      },
      {
        key: 'ip',
        title: '10. Fikri Mülkiyet',
        intro:
          'Pusula markası, logosu, arayüz tasarımı, kaynak kodu ve dokümantasyonu ' +
          'üzerindeki tüm haklar Pusula’ya aittir. Bu koşullar sana Hizmet’i kullanma ' +
          'konusunda sınırlı, devredilemez ve münhasır olmayan bir lisans verir; bunun ' +
          'ötesinde herhangi bir hak devri öngörmez.',
      },
      {
        key: 'changes',
        title: '11. Koşullarda Değişiklik',
        intro:
          'Bu koşullar zaman zaman güncellenebilir. Önemli değişiklikler uygulama üzerinden ' +
          'duyurulur ve güncel sürüm her zaman web sitesindeki bu sayfada yer alır. ' +
          'Değişikliklerin yayımlanmasının ardından Hizmet’i kullanmaya devam etmen, ' +
          'güncel koşulları kabul ettiğin anlamına gelir.',
      },
      {
        key: 'law',
        title: '12. Uygulanacak Hukuk',
        intro:
          'Bu koşullar Türkiye Cumhuriyeti hukukuna tabidir. Koşullardan kaynaklanan ' +
          'uyuşmazlıklarda Türkiye Cumhuriyeti mahkemeleri yetkilidir; tüketici mevzuatından ' +
          'doğan zorunlu yetki kuralları saklıdır.',
      },
    ],
    // İletişim + tam metin bağlantısı.
    contactTitle: 'İletişim',
    contactRow: 'E-posta gönder',
    contactEmail: 'pusulaportal@gmail.com',
    fullTermsRow: 'Tam metni web’de aç',
    copyright: '© 2026 Pusula · Tüm hakları saklıdır.',
  },
  // Profil düzenleme ekranı (DEM-208 + DEM-212 avatar).
  profileEdit: {
    title: 'Profili düzenle',
    description: 'Adın panolarda ve etkinlik akışında görünür.',
    nameLabel: 'Ad',
    namePlaceholder: 'Adın',
    emailHint: 'E-posta şu an değiştirilemez.',
    save: 'Kaydet',
    // Avatar bölümü (DEM-212).
    avatarLabel: 'Profil fotoğrafı',
    avatarChange: 'Fotoğraf değiştir',
    avatarAdd: 'Fotoğraf ekle',
    avatarRemove: 'Fotoğrafı kaldır',
    // Kaynak seçici bottom sheet.
    avatarSheetTitle: 'Fotoğraf nereden eklensin?',
    avatarSourceCamera: 'Kamera',
    avatarSourceGallery: 'Galeriden seç',
    // Yükleme durumu — yüzde araya konur: "Yükleniyor %42".
    avatarUploading: 'Yükleniyor',
    avatarUploadError: 'Fotoğraf yüklenemedi. Lütfen tekrar dene.',
    // İstemci-tarafı doğrulama (backend allowlist + 10 MB ile aynı).
    avatarRejectTitle: 'Fotoğraf eklenemedi',
    avatarRejectMime: 'Yalnızca JPEG, PNG ve WebP görselleri kullanılabilir.',
    avatarRejectSize: 'Görsel 10 MB boyut sınırını aşıyor.',
    avatarRejectEmpty: 'Görsel okunamadı veya boş görünüyor.',
    // Kamera/galeri izin akışı (permission priming) — avatara özel gövde.
    avatarPermissionCameraBody: 'Profil fotoğrafı çekmek için kamera erişimine izin ver.',
    avatarPermissionGalleryBody:
      'Galeriden profil fotoğrafı seçmek için fotoğraf erişimine izin ver.',
  },
  // Hesap silme ekranı (DEM-212).
  deleteAccount: {
    title: 'Hesabı sil',
    // "Hesap ve güvenlik" grubundaki yıkıcı satır etiketi.
    row: 'Hesabı sil',
    // Geri-alınamaz uyarısı.
    warningTitle: 'Bu işlem geri alınamaz',
    warningBody: 'Hesabın ve tüm verilerin kalıcı olarak silinecek. Bu işlemi geri alamazsın.',
    // Parola doğrulama alanı.
    passwordLabel: 'Parola',
    passwordPlaceholder: 'Parolanı gir',
    // Yıkıcı buton + son onay diyaloğu (Alert).
    deleteAction: 'Hesabımı sil',
    confirmTitle: 'Hesabını sil',
    confirmBody: 'Hesabın kalıcı olarak silinecek. Devam etmek istediğine emin misin?',
    confirmAction: 'Hesabı sil',
  },
  // Şifre değiştir ekranı (DEM-208).
  changePassword: {
    title: 'Şifre değiştir',
    description: 'Yeni şifren en az 8 karakter olmalı.',
    currentLabel: 'Mevcut şifre',
    currentPlaceholder: 'Mevcut şifren',
    newLabel: 'Yeni şifre',
    newPlaceholder: 'Yeni şifren',
    confirmLabel: 'Yeni şifre (tekrar)',
    confirmPlaceholder: 'Yeni şifreni tekrar gir',
    mismatch: 'Yeni şifreler eşleşmiyor',
    save: 'Şifreyi güncelle',
    success: 'Şifren güncellendi.',
  },
  auth: {
    emailLabel: 'E-posta',
    emailPlaceholder: 'ornek@eposta.com',
    passwordLabel: 'Parola',
    passwordPlaceholder: '••••••••',
    nameLabel: 'Ad',
    namePlaceholder: 'Adınız',
    signOut: 'Çıkış yap',
    signIn: {
      title: 'Tekrar hoş geldiniz',
      description: 'Hesabınızla giriş yapın ve panolarınıza devam edin.',
      submit: 'Giriş yap',
      submitting: 'Giriş yapılıyor…',
      forgotPassword: 'Şifreni mi unuttun?',
      noAccount: 'Hesabınız yok mu?',
      goToSignUp: 'Kayıt ol',
    },
    signUp: {
      title: 'Hesap oluşturun',
      description: 'Yeni bir Pusula hesabı oluşturun ve panolarınızı yönetmeye başlayın.',
      submit: 'Kayıt ol',
      submitting: 'Kayıt olunuyor…',
      hasAccount: 'Zaten hesabınız var mı?',
      goToSignIn: 'Giriş yap',
    },
    forgotPassword: {
      title: 'Şifreni mi unuttun?',
      description: 'E-posta adresini gir; sana bir sıfırlama bağlantısı gönderelim.',
      submit: 'Sıfırlama bağlantısı gönder',
      submitting: 'Gönderiliyor…',
      successTitle: 'Bağlantı yolda',
      // E-posta adresi araya konur — hesap kayıtlı mı belli edilmez (kullanıcı
      // listesi sızdırılmaz); kayıt yoksa Better Auth da sessizce başarı döner.
      successBody:
        'Eğer bu adrese bağlı bir hesap varsa, bir parola sıfırlama bağlantısı gönderdik. Gelen kutunu (ve spam klasörünü) kontrol et.',
      backToSignIn: 'Giriş ekranına dön',
    },
    resetPassword: {
      title: 'Yeni parola belirle',
      description: 'Hesabın için yeni bir parola gir.',
      newPasswordLabel: 'Yeni parola',
      confirmPasswordLabel: 'Yeni parola (tekrar)',
      passwordMismatch: 'Parolalar eşleşmiyor.',
      submit: 'Parolayı güncelle',
      submitting: 'Güncelleniyor…',
      successTitle: 'Parolan güncellendi',
      successBody: 'Yeni parolanla giriş yapabilirsin.',
      missingTokenTitle: 'Bağlantı geçersiz veya eksik',
      missingTokenBody:
        'Bu sıfırlama bağlantısı eksik ya da bozuk görünüyor. Yeni bir bağlantı isteyebilirsin.',
      requestNewLink: 'Yeni bağlantı iste',
      backToSignIn: 'Giriş ekranına dön',
    },
    // Giriş ekranı (`/sign-in`) landing görselleri — web `apps/web` strings
    // `auth.landing` ile birebir hizalı. Tümü dekoratif/sahte örnek içerik
    // (entity-bağımsız, gerçek veri DEĞİL); yalnızca giriş ekranı vitrini için.
    landing: {
      heroEyebrow: 'Pusula ile tanışın',
      // Hero başlık — sabit ön/son metin + dönen kelime listesi. Görünen kelime
      // değişir; ekran okuyucuya `heroHeadlineFull` sabit tam metin sunulur.
      heroHeadline: {
        prefix: 'Ekibinizin',
        rotatingWords: ['işleri', 'planları', 'kartları', 'panoları'],
        suffix: 'tek pusulada.',
      },
      heroHeadlineFull: 'Ekibinizin işleri tek pusulada.',
      // Dekoratif (a11y-gizli) mini kanban önizlemesi içeriği.
      boardMockup: {
        columns: {
          todo: {
            title: 'Yapılacaklar',
            cards: {
              first: 'Çeyrek planını ekiple paylaş',
              second: 'Yeni başvuruları değerlendir',
            },
          },
          inProgress: {
            title: 'Devam Edenler',
            cards: {
              first: 'Açılış sayfası tasarımını hazırla',
              second: 'Müşteri geri bildirimlerini derle',
              third: 'Haftalık rapor taslağı',
            },
          },
          done: {
            title: 'Tamamlananlar',
            cards: {
              first: 'Sprint toplantısı notlarını yaz',
              second: 'Bütçe onayını al',
            },
          },
        },
      },
      // Board mockup çevresinde yüzen dekoratif (a11y-gizli) mini aktivite kartları.
      floatingActivity: {
        cardMoved: 'kartı "Tamamlananlar"a taşıdı',
        newComment: 'yeni bir yorum ekledi',
        dueSoon: 'son tarih yaklaşıyor',
        timeMovedAgo: '2 dk önce',
        timeCommentAgo: '5 dk önce',
        timeDueAgo: 'Bugün',
      },
      // Cam kartın altındaki sosyal-proof şeridi — sahte/örnek metin.
      socialProof: {
        text: 'Yüzlerce ekip işlerini Pusula ile yönetiyor.',
        // Üst üste binmiş avatarlarda gösterilen örnek ekip üyeleri — renk +
        // baş harf bu adlardan deterministik türetilir (dekoratif, a11y-gizli).
        members: ['Ayşe Yılmaz', 'Mehmet Demir', 'Zeynep Kaya', 'Can Aydın', 'Elif Şahin'],
      },
    },
  },
  // Faz 13S (DEM-275) — mobil rapor entegrasyonu (saved + scheduled liste,
  // WebView detay, PDF share). View + indir; oluştur/zamanla web'de.
  reports: {
    workspaceLinkLabel: 'Raporlar',
    list: {
      title: 'Raporlar',
      tabs: {
        saved: 'Kaydedilmiş',
        scheduled: 'Zamanlanmış',
      },
      emptySavedTitle: 'Henüz kayıtlı raporun yok',
      emptySavedDescription: 'Web üzerinden rapor oluşturup kaydedebilirsin.',
      emptyScheduledTitle: 'Hiç zamanlanmış rapor yok',
      emptyScheduledDescription: 'Web üzerinden bir rapora zamanlama ekleyebilirsin.',
      loadError: 'Raporlar yüklenemedi.',
      scheduledStatusActive: 'Aktif',
      scheduledStatusPaused: 'Duraklatıldı',
    },
    scope: {
      card: 'Kart',
      list: 'Liste',
      board: 'Pano',
      workspace: 'Çalışma alanı',
    },
    detail: {
      headerTitle: 'Rapor',
      pdfDownloadButton: 'PDF indir',
      pdfDownloading: 'Hazırlanıyor…',
      pdfErrorTitle: 'PDF hazırlanamadı',
      pdfErrorBody: 'Bir şeyler ters gitti. Lütfen birazdan tekrar dene.',
      pdfShareUnavailable: 'Bu cihazda paylaşım kullanılamıyor.',
      pdfTimeoutBody: 'Rapor üretimi beklenenden uzun sürdü. Lütfen daha sonra tekrar dene.',
      loadError: 'Rapor yüklenemedi.',
    },
  },
} as const;

export type Strings = typeof strings;
