'use client';

import type { ReactNode } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * Pusula web tarafının tema sağlayıcısı. Karar kaynakları:
 * docs/architecture/13-ui-tasarim-dili.md §13.7 ve
 * docs/architecture/02-teknoloji-kararlari.md (Karar kaydı 2026-05-14).
 *
 * Mod seti = light + dark ikili, default = light (Trello-vari palet light-first).
 * `system` algılaması kapalı; persistence localStorage, namespaced anahtar.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      themes={['light', 'dark']}
      storageKey="pusula-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
