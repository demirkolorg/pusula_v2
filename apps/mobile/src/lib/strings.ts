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
    comingSoonTitle: 'Arama yakında',
    comingSoonBody: 'Pano, liste, kart ve yorumlarda arama bir sonraki güncellemede gelecek.',
  },
  notifications: {
    comingSoonTitle: 'Bildirimler yakında',
    comingSoonBody: 'Bildirim merkezi bir sonraki güncellemede gelecek.',
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
