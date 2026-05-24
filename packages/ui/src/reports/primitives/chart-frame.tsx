import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface ChartFrameProps {
  /** Görsel başlık (recharts kendi başlığı yok). */
  titleKey?: string;
  t?: (key: string, params?: Record<string, unknown>) => string;
  /** Print mode → animasyon kapalı + sabit boyut + page-break disipliniyle. */
  mode: 'panel' | 'print';
  /** Yükseklik px — recharts ResponsiveContainer'ın altındaki sabit alan. */
  height?: number;
  /**
   * Erişilebilirlik adı (DEM-262 a11y S-1+S-2). recharts SVG'sinin
   * accessible name'i için. Çağıran component her zaman geçirmeli;
   * `titleKey` `t` ile verilirse otomatik kullanılır.
   */
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Chart wrapper — recharts `<ResponsiveContainer>` etrafında stabil
 * yükseklik + print-aware container. Child component recharts
 * primitif'lerini bekler (BarChart / PieChart / LineChart vb).
 *
 * Print mode'da `responsive={false}` kullanmak yerine sabit width/height
 * inline style ile geçirilir (recharts SSR limit'i; Puppeteer pdf
 * `waitForFunction('window.__reportReady === true')` ile snapshot alır).
 */
export function ChartFrame({
  titleKey,
  t,
  mode,
  height = 280,
  ariaLabel,
  children,
  className,
}: ChartFrameProps) {
  const title = titleKey && t ? t(titleKey) : null;
  const labelId = useId();
  const computedLabel = ariaLabel ?? title ?? undefined;
  return (
    <div
      data-slot="chart-frame"
      data-mode={mode}
      className={cn(
        'chart-container flex flex-col gap-2',
        mode === 'print' && 'transition-none',
        className,
      )}
    >
      {title ? (
        <p id={labelId} className="text-xs font-medium text-muted-foreground">
          {title}
        </p>
      ) : null}
      {/*
       * A11y S-1+S-2 (DEM-262): recharts SVG default'unda role/name yok.
       * Wrapper'a `role="img"` + accessible name ekliyoruz. recharts kendi
       * `accessibilityLayer` prop'u BarChart/PieChart'a caller tarafında
       * geçirilir (keyboard nav + announce).
       */}
      <div
        role="img"
        aria-label={!title ? computedLabel : undefined}
        aria-labelledby={title ? labelId : undefined}
        className="relative w-full"
        style={{ height }}
      >
        {children}
      </div>
    </div>
  );
}
