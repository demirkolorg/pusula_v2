'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';

/**
 * App-shell header'ında light/dark arası geçişi sağlayan basit toggle.
 *
 * Karar kaynakları: docs/architecture/13-ui-tasarim-dili.md §13.7 ve
 * docs/architecture/02-teknoloji-kararlari.md (Karar kaydı 2026-05-14).
 *
 * Mod seti ikili olduğu için DropdownMenu yok; tıklayınca diğer moda flip.
 * `mounted` guard: SSR'da `light` ile gelen ilk render ile client'taki gerçek
 * tema arasındaki hidrasyon mismatch'inden kaçınmak için ikon mount sonrası
 * çizilir. Mount öncesinde boyutu koruyan placeholder kalır (CLS yok).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';
  const ariaLabel = isDark ? strings.shell.themeToggleToLight : strings.shell.themeToggleToDark;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={() => setTheme(nextTheme)}
      className={cn('size-9', className)}
    >
      {/* Mount öncesi boş bir alan tutuyoruz — flash önleme. */}
      {mounted ? (
        isDark ? (
          <MoonIcon className="size-4" aria-hidden />
        ) : (
          <SunIcon className="size-4" aria-hidden />
        )
      ) : (
        <span className="size-4" aria-hidden />
      )}
    </Button>
  );
}
