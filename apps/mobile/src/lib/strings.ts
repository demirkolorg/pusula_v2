/**
 * Mobil UI metin katmanı (iskelet — Faz 7A).
 *
 * UI bileşenleri metni hardcode etmez; buradan okur (web
 * `apps/web/src/lib/strings.ts` simetrisi). Ekran/akış metinleri ilgili alt
 * işlerde (7B auth, 7C navigasyon, ekranlar …) bu nesneye eklenir.
 */
export const strings = {
  app: {
    name: 'Pusula',
    tagline: 'Panolarınız, her yerde.',
  },
  scaffold: {
    title: 'Mobil uygulama iskeleti hazır',
    description:
      'Giriş, navigasyon ve ekranlar sonraki alt işlerde gelir. Bu ekran yalnızca altyapı doğrulamasıdır.',
  },
  common: {
    loading: 'Yükleniyor…',
    retry: 'Tekrar dene',
    connectionLost: 'Bağlantı yok',
  },
} as const;

export type Strings = typeof strings;
