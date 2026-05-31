import * as React from 'react';
import { cn } from '../lib/utils';

export interface SectionHeaderProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  /** Leading icon (caller sizes it, e.g. `size-3.5`). */
  icon?: React.ReactNode;
  /** Section label — rendered uppercase. */
  children: React.ReactNode;
  /** Trailing action slot (button, link, mini progress, ...). */
  action?: React.ReactNode;
}

/**
 * Shared section header — small uppercase muted label with an optional leading
 * icon and a trailing action slot. Used by modal sections (AÇIKLAMA, KONTROL
 * LİSTESİ, ...) and settings panels.
 */
function SectionHeader({ icon, children, action, className, ...props }: SectionHeaderProps) {
  return (
    <div
      data-slot="section-header"
      className={cn('mb-1 flex items-center justify-between gap-2', className)}
      {...props}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-semibold tracking-wide uppercase">{children}</span>
      </div>
      {/* Action içindeki ghost icon button'lar default `size="icon"` ile 36px
          oluyor ve header yüksekliğini onlar belirliyor (label sadece ~14px).
          Descendant selector ile button'ları 28px'e sıkıştırıp başlık çubuğunu
          gerçekten daraltıyoruz; ikon boyutu (`size-4`) yine rahat oturur. */}
      {action ? (
        <div className="flex items-center gap-0.5 [&_button]:size-7">{action}</div>
      ) : null}
    </div>
  );
}

export { SectionHeader };
