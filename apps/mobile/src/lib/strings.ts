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
    summary: {
      cardMemberAdded: (cardTitle: string) => `sana "${cardTitle}" kartını atadı`,
      commentMentioned: (cardTitle: string, commentPreview?: string) =>
        commentPreview
          ? `"${cardTitle}" kartında senden bahsetti: "${commentPreview}"`
          : `"${cardTitle}" kartındaki bir yorumda senden bahsetti`,
      commentCreated: (cardTitle: string, commentPreview?: string) =>
        commentPreview
          ? `"${cardTitle}" kartında yorum bıraktı: "${commentPreview}"`
          : `"${cardTitle}" kartında yorum bıraktı`,
      dueApproaching: (cardTitle: string) => `"${cardTitle}" kartının teslim tarihi yaklaşıyor`,
      dueReminder1d: (cardTitle: string) => `"${cardTitle}" kartı yarın teslim ediliyor`,
      dueReminder1h: (cardTitle: string) => `"${cardTitle}" kartı 1 saat sonra teslim ediliyor`,
      dueOverdue: (cardTitle: string) => `"${cardTitle}" kartının teslim tarihi geçti`,
      boardMemberInvited: (boardName: string) => `seni "${boardName}" panosuna davet etti`,
      boardMemberAdded: (boardName: string) => `seni "${boardName}" panosuna ekledi`,
      workspaceMemberInvited: (workspaceName: string) =>
        `seni "${workspaceName}" çalışma alanına davet etti`,
      boardAccessRequested: (boardName: string) => `"${boardName}" panosuna erişim istedi`,
      watchedActivity: (cardTitle: string) => `"${cardTitle}" kartında değişiklik yaptı`,
      checklistItemCompleted: (cardTitle: string, itemContent?: string) =>
        itemContent
          ? `"${itemContent}" maddesini tamamladı`
          : `"${cardTitle}" kartındaki bir maddeyi tamamladı`,
      cardArchived: (cardTitle: string) => `"${cardTitle}" kartını arşivledi`,
      cardCompleted: (cardTitle: string) => `"${cardTitle}" kartını tamamlandı işaretledi`,
      cardMoved: (cardTitle: string) => `"${cardTitle}" kartını taşıdı`,
      cardUncompleted: (cardTitle: string) =>
        `"${cardTitle}" kartının tamamlandı işaretini kaldırdı`,
      cardDueSet: (cardTitle: string) => `"${cardTitle}" kartı için teslim tarihi belirledi`,
      cardDueCleared: (cardTitle: string) => `"${cardTitle}" kartının teslim tarihini kaldırdı`,
      cardCoverChanged: (cardTitle: string) => `"${cardTitle}" kartının kapağını değiştirdi`,
      cardMemberRemoved: (cardTitle: string) => `seni "${cardTitle}" kartından çıkardı`,
      memberRemoved: (boardName: string) => `seni "${boardName}" panosundan çıkardı`,
      memberRoleChanged: (boardName: string) => `"${boardName}" panosundaki rolünü değiştirdi`,
      attachmentAdded: (cardTitle: string, fileName?: string) =>
        fileName
          ? `"${cardTitle}" kartına "${fileName}" ekledi`
          : `"${cardTitle}" kartına bir dosya ekledi`,
      cardRenamed: (cardTitle: string) => `"${cardTitle}" kartının başlığını değiştirdi`,
      cardDescriptionChanged: (cardTitle: string) =>
        `"${cardTitle}" kartının açıklamasını güncelledi`,
      cardLabelAdded: (cardTitle: string) => `"${cardTitle}" kartına bir etiket ekledi`,
      cardLabelRemoved: (cardTitle: string) => `"${cardTitle}" kartından bir etiket kaldırdı`,
      commentUpdated: (cardTitle: string) => `"${cardTitle}" kartındaki bir yorumu düzenledi`,
      commentDeleted: (cardTitle: string) => `"${cardTitle}" kartındaki bir yorumu sildi`,
      checklistCreated: (cardTitle: string) =>
        `"${cardTitle}" kartına bir yapılacaklar listesi ekledi`,
      checklistItemAdded: (cardTitle: string, itemContent?: string) =>
        itemContent
          ? `"${itemContent}" maddesini ekledi`
          : `"${cardTitle}" kartına bir yapılacaklar maddesi ekledi`,
      checklistItemRemoved: (cardTitle: string, itemContent?: string) =>
        itemContent
          ? `"${itemContent}" maddesini sildi`
          : `"${cardTitle}" kartından bir yapılacaklar maddesi sildi`,
      attachmentRemoved: (cardTitle: string, fileName?: string) =>
        fileName
          ? `"${cardTitle}" kartından "${fileName}" kaldırdı`
          : `"${cardTitle}" kartından bir dosya kaldırdı`,
      // Bildirim kapsamı genişletme — Faz 2 (granular tipler, 2026-06-03).
      cardCreated: (cardTitle: string) => `"${cardTitle}" kartını oluşturdu`,
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
  },
  notificationSettings: {
    // Bildirim ayarları ekranı (pushed route — Faz 7K).
    title: 'Bildirim ayarları',
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
    theme: {
      light: 'Açık',
      dark: 'Koyu',
      system: 'Sistem',
    },
    // Bölüm başlıkları + satırları (DEM-208).
    notificationsTitle: 'Bildirimler',
    notificationSettingsRow: 'Bildirim ayarları',
    securityTitle: 'Hesap ve güvenlik',
    changePasswordRow: 'Şifre değiştir',
    deleteAccountRow: 'Hesabı sil',
    aboutTitle: 'Hakkında',
    aboutRow: 'Hakkında',
    versionRow: 'Sürüm',
    privacyPolicyRow: 'Gizlilik Politikası',
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
