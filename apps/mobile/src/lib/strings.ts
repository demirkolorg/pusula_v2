/**
 * Mobil UI metin katmanı.
 *
 * UI bileşenleri metni hardcode etmez; buradan okur (web
 * `apps/web/src/lib/strings.ts` simetrisi). Ekran/akış metinleri ilgili alt
 * işlerde bu nesneye eklenir.
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
  },
  home: {
    title: 'Pusula',
    signedInAs: 'Giriş yapıldı:',
    description:
      'Kimlik doğrulama hazır. Pano listesi ve navigasyon sonraki alt işlerde gelir.',
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
