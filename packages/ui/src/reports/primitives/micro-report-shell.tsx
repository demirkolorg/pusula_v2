import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface MicroReportShellProps {
  title: string;
  /** Tailwind grid `col-span-{1..4}` — manifest defaultLayout.colSpan. */
  colSpan: 1 | 2 | 3 | 4;
  minHeight?: number;
  mode: 'panel' | 'print';
  /**
   * Heading seviyesi. Spec §10 UI akışı: `/reports` sayfasında h1 workspace,
   * h2 rapor adı, h3 micro-report. Print mode `PrintPageFrame` h1 kullanır
   * → micro-report h2. Default `'h3'` (panel akışı). Caller print sayfası
   * için h2 verebilir (a11y heading hiyerarşi sıçramasını önler).
   */
  headingAs?: 'h2' | 'h3' | 'h4';
  /** Sadece panel mode'da görünen sağ üst aksiyonlar. */
  actions?: ReactNode;
  /** Restricted scope banner gibi başlık-altı uyarılar. */
  topNote?: ReactNode;
  children: ReactNode;
  className?: string;
}

const COL_SPAN_CLASS: Record<MicroReportShellProps['colSpan'], string> = {
  1: 'col-span-1',
  2: 'col-span-1 md:col-span-2',
  3: 'col-span-1 md:col-span-2 lg:col-span-3',
  4: 'col-span-1 md:col-span-2 lg:col-span-4',
};

/**
 * Tek micro-report widget'ı için ortak shell — başlık + min-height +
 * grid colSpan + print page-break disiplini (`break-inside: avoid`).
 *
 * Spec §16.5 (`MicroReportProps.mode='print'`) + §16.8 (Puppeteer
 * `page-break-inside: avoid`).
 */
export function MicroReportShell({
  title,
  colSpan,
  minHeight,
  mode,
  headingAs = 'h3',
  actions,
  topNote,
  children,
  className,
}: MicroReportShellProps) {
  // A11y C-1 (DEM-262): `aria-label` + visible `<h{2..4}>` aynı metni iki
  // kez SR'a verirdi (ve `<section>` `aria-label`'la landmark olur, 8 ws
  // rapor sayfasını çöplendirir). `aria-labelledby` ile heading'i tek
  // accessible name olarak bağla.
  const titleId = useId();
  const Heading = headingAs;
  return (
    <section
      data-slot="micro-report-shell"
      data-mode={mode}
      data-col-span={colSpan}
      className={cn(
        'micro-report-shell flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-sm',
        COL_SPAN_CLASS[colSpan],
        // Print: page-break-inside: avoid (print.css'te de tanımlı; element
        // class'ı seçici eşleşmesi için).
        mode === 'print' && 'break-inside-avoid',
        mode === 'panel' && 'transition-shadow hover:shadow-md',
        className,
      )}
      style={minHeight ? { minHeight } : undefined}
      aria-labelledby={titleId}
    >
      <header className="flex items-start justify-between gap-2">
        <Heading id={titleId} className="text-sm font-semibold text-foreground">
          {title}
        </Heading>
        {mode === 'panel' && actions ? (
          <div className="flex items-center gap-1 panel-only">{actions}</div>
        ) : null}
      </header>
      {topNote}
      <div className="flex-1">{children}</div>
    </section>
  );
}
