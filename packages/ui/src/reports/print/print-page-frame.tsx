import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface PrintPageFrameProps {
  /** Print başlığı (rapor adı + scope adı). */
  title: string;
  /** Alt başlık (filtre özeti, tarih aralığı). */
  subtitle?: string;
  /** Üretildiği zaman (ISO) — footer'da `t('reports.print.generatedAt')`. */
  generatedAt: string;
  /** Workspace adı — header'da görünür. */
  workspaceName: string;
  t: (key: string, params?: Record<string, unknown>) => string;
  locale: string;
  children: ReactNode;
}

/**
 * Puppeteer'ın açacağı print sayfasının dış iskeleti — header (workspace +
 * rapor adı), footer (zaman + sayfa). Puppeteer `displayHeaderFooter:
 * true` kullanırken Chrome'un kendi header/footer template'i bunun yerine
 * geçer; bu component PDF'in **gövde sayfasında** rapor başlık şeridini
 * sağlar.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §16.8.
 */
export function PrintPageFrame({
  title,
  subtitle,
  generatedAt,
  workspaceName,
  t,
  locale,
  children,
}: PrintPageFrameProps) {
  const formattedDate = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(generatedAt));

  return (
    <div
      data-slot="print-page-frame"
      className={cn('flex min-h-screen flex-col bg-white text-foreground')}
    >
      <header className="border-b px-6 py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {workspaceName}
        </p>
        <h1 className="mt-1 text-xl font-semibold">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </header>
      <main className="flex-1 px-6 py-4">{children}</main>
      <footer className="mt-auto border-t px-6 py-3 text-xs text-muted-foreground">
        {t('reports.print.generatedAt', { at: formattedDate })}
      </footer>
    </div>
  );
}
