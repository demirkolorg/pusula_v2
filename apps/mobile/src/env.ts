import { z } from 'zod';

/**
 * Mobil runtime env. Yalnız `EXPO_PUBLIC_*` anahtarları uygulama bundle'ına
 * girer (gizli değildir). Expo bunları derleme anında statik olarak inline
 * ettiği için `process.env.EXPO_PUBLIC_*` açıkça yazılır — dinamik index'leme
 * çalışmaz. Web `apps/web/src/env.ts` ile simetrik.
 */
const envSchema = z.object({
  // tRPC/HTTP API kökü. Dev varsayılanı `apps/api` (port 3001).
  // Üretim sertleştirmesi: prod yapılarında `https://` zorunlu — oturum
  // cookie'si (`Cookie` başlığı) cleartext gitmesin (api `env.ts`
  // `assertProductionHardening` disiplinine paralel).
  // Dev'de gerçek host `src/lib/api-url.ts` ile Expo Metro `hostUri`'sinden
  // türetilir — emulator ve fiziksel cihaz tek değerle çalışır, `.env`'i elle
  // LAN IP'ye çekmek gerekmez. Üretim build'inde (`__DEV__` false) bu değer
  // (https URL) doğrudan kullanılır.
  EXPO_PUBLIC_API_URL: z
    .url()
    .default('http://localhost:3001')
    .refine(
      (url) => process.env.NODE_ENV !== 'production' || url.startsWith('https://'),
      'Üretim yapılarında EXPO_PUBLIC_API_URL https:// ile başlamalı.',
    ),
  // Sentry `pusula-mobile` projesinin DSN'i. DSN gizli değildir; boş/eksikse
  // `Sentry.init` no-op olur (lokal dev/test Sentry'siz çalışır).
  EXPO_PUBLIC_SENTRY_DSN: z
    .string()
    .optional()
    .transform((value) => value || undefined),
});

export const env = envSchema.parse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
});

export type Env = typeof env;
