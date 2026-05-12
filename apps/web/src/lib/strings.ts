/**
 * User-facing copy for the web app, centralized in one place. This is a
 * placeholder for a real i18n layer (next-intl, etc.) — until then, components
 * read strings from here instead of inlining literals, so the eventual swap is a
 * single seam. Keep keys grouped by feature; values are plain Turkish strings.
 */
export const strings = {
  common: {
    appName: 'Pusula',
    loading: 'Yükleniyor…',
    cancel: 'İptal',
    retry: 'Tekrar dene',
    unknownError: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.',
  },
  auth: {
    emailLabel: 'E-posta',
    emailPlaceholder: 'ornek@eposta.com',
    passwordLabel: 'Parola',
    passwordPlaceholder: '••••••••',
    nameLabel: 'Ad',
    namePlaceholder: 'Adınız',
    signIn: {
      title: 'Giriş yap',
      description: 'Hesabınızla devam edin.',
      submit: 'Giriş yap',
      submitting: 'Giriş yapılıyor…',
      noAccount: 'Hesabın yok mu?',
      goToSignUp: 'Kayıt ol',
    },
    signUp: {
      title: 'Kayıt ol',
      description: 'Yeni bir hesap oluşturun.',
      submit: 'Kayıt ol',
      submitting: 'Kayıt olunuyor…',
      hasAccount: 'Zaten hesabın var mı?',
      goToSignIn: 'Giriş yap',
    },
  },
  shell: {
    signOut: 'Çıkış',
    signingOut: 'Çıkış yapılıyor…',
  },
  workspace: {
    listTitle: 'Workspace’lerin',
    loading: 'Workspace’ler yükleniyor…',
    loadErrorTitle: 'Workspace’ler yüklenemedi',
    empty: 'Henüz workspace yok — ilkini oluştur.',
    newButton: 'Yeni workspace',
    roleBadgePrefix: 'Rol:',
    create: {
      title: 'Yeni workspace',
      description: 'Bir ad verin; sahibi siz olursunuz.',
      nameLabel: 'Workspace adı',
      namePlaceholder: 'Örn. Pazarlama Ekibi',
      submit: 'Oluştur',
      submitting: 'Oluşturuluyor…',
    },
  },
} as const;
