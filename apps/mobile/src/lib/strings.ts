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
  workspaces: {
    title: 'Çalışma Alanları',
    loadError: 'Çalışma alanları yüklenemedi.',
    boardCountSuffix: 'pano',
    memberCountSuffix: 'üye',
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
    commentsTitle: 'Yorumlar',
    noComments: 'Henüz yorum yok.',
    deletedComment: 'Bu yorum silindi.',
    activityTitle: 'Aktivite',
    noActivity: 'Henüz aktivite yok.',
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
    // Etiketler.
    labelsEmpty: 'Etiket eklenmemiş.',
    labelAdd: 'Etiket ekle',
    labelNoneAvailable: 'Eklenecek başka etiket yok.',
    labelUnnamed: 'İsimsiz etiket',
    // Üyeler.
    membersEmpty: 'Üye eklenmemiş.',
    memberAdd: 'Üye ekle',
    memberNoneAvailable: 'Eklenecek başka üye yok.',
    // Son tarih.
    dueEmpty: 'Son tarih belirlenmemiş.',
    dueToday: 'Bugün',
    dueTomorrow: 'Yarın',
    dueWeekend: 'Hafta sonu',
    dueNextWeek: 'Gelecek hafta',
    dueClear: 'Son tarihi kaldır',
    // Kontrol listeleri.
    checklistsEmpty: 'Bu kartta kontrol listesi yok.',
    checklistItemAdd: 'Madde ekle',
    checklistItemPlaceholder: 'Yeni madde…',
    // Yorum yazma.
    commentPlaceholder: 'Bir yorum yaz…',
    commentSubmit: 'Yorum gönder',
    commentSubmitting: 'Gönderiliyor…',
    // Başlık düzenleme + liste taşıma (Faz 7H).
    editTitleLabel: 'Kart başlığını düzenle',
    titlePlaceholder: 'Kart başlığı',
    moveAction: 'Listeyi değiştir',
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
    openSettings: 'Bildirim ayarları',
    loadErrorTitle: 'Bildirimler yüklenemedi',
    loadErrorBody: 'Bağlantını kontrol edip tekrar dene.',
    emptyTitle: 'Henüz bildirim yok',
    emptyBody: 'Sana yönelik aktiviteler burada görünecek.',
    loadMore: 'Daha fazla yükle',
    loadingMore: 'Yükleniyor…',
    unreadLabel: 'Okunmamış',
    systemBadge: 'Sistem',
    // Aktör adı / kart / board / workspace yedek metinleri.
    fallbackActorName: 'Bir kullanıcı',
    fallbackCardTitle: 'bu kart',
    fallbackBoardName: 'bu pano',
    fallbackWorkspaceName: 'bu çalışma alanı',
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
      commentMentioned: (cardTitle: string) =>
        `"${cardTitle}" kartındaki bir yorumda senden bahsetti`,
      commentCreated: (cardTitle: string) => `"${cardTitle}" kartında yorum bıraktı`,
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
      checklistItemCompleted: (cardTitle: string) =>
        `"${cardTitle}" kartındaki bir maddeyi tamamladı`,
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
      attachmentAdded: (cardTitle: string) => `"${cardTitle}" kartına bir dosya ekledi`,
      cardRenamed: (cardTitle: string) => `"${cardTitle}" kartının başlığını değiştirdi`,
      cardDescriptionChanged: (cardTitle: string) =>
        `"${cardTitle}" kartının açıklamasını güncelledi`,
      cardLabelAdded: (cardTitle: string) => `"${cardTitle}" kartına bir etiket ekledi`,
      cardLabelRemoved: (cardTitle: string) => `"${cardTitle}" kartından bir etiket kaldırdı`,
      commentUpdated: (cardTitle: string) => `"${cardTitle}" kartındaki bir yorumu düzenledi`,
      commentDeleted: (cardTitle: string) => `"${cardTitle}" kartındaki bir yorumu sildi`,
      checklistCreated: (cardTitle: string) =>
        `"${cardTitle}" kartına bir yapılacaklar listesi ekledi`,
      checklistItemAdded: (cardTitle: string) =>
        `"${cardTitle}" kartına bir yapılacaklar maddesi ekledi`,
      checklistItemRemoved: (cardTitle: string) =>
        `"${cardTitle}" kartından bir yapılacaklar maddesi sildi`,
      attachmentRemoved: (cardTitle: string) => `"${cardTitle}" kartından bir dosya kaldırdı`,
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
        boardInvitation: 'Pano daveti',
        workspaceInvitation: 'Çalışma alanı daveti',
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
    description: 'Hesap ayarları ve daha fazlası sonraki güncellemelerde gelecek.',
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
} as const;

export type Strings = typeof strings;
