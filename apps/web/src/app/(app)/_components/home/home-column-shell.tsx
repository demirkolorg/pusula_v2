'use client';

import { type ReactNode } from 'react';
import { ChevronLeftIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle, cn } from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { strings } from '@/lib/strings';

type HomeColumnShellProps = {
  /** Section landmark label for screen readers. */
  ariaLabel: string;
  eyebrow: string;
  count: string;
  /**
   * Sütun başlığındaki dekoratif ikon rozeti (hero CompassIcon'un minyatürü).
   * Primary tonlu glass kutucuk içinde render edilir.
   */
  icon?: ReactNode;
  /** Right-aligned header action (typically the `+` add button). */
  action?: ReactNode;
  /** Accordion-mode back affordance; hidden on `lg` and above (4-column view). */
  onBack?: () => void;
  backLabel?: string;
  isPending?: boolean;
  isError?: boolean;
  errorTitle?: string;
  errorMessage?: string;
  className?: string;
  children?: ReactNode;
};

/**
 * Shared shell for the four Gezgin columns (§13.11). Glass panel: `bg-card/60
 * backdrop-blur-md`, soft `border-border/60`, rounded-xl. Üst kenarda ince
 * `--primary` gradient highlight çizgisi (hero ile aynı tasarım dili). Header
 * sol blokta opsiyonel ikon rozeti + eyebrow + sayaç; sağ blokta `+` action ve
 * accordion-mode geri butonu. Pending/error/empty content `children`'da gelir.
 */
export function HomeColumnShell({
  ariaLabel,
  eyebrow,
  count,
  icon,
  action,
  onBack,
  backLabel,
  isPending = false,
  isError = false,
  errorTitle,
  errorMessage,
  className,
  children,
}: HomeColumnShellProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        'border-border/60 bg-card/60 relative isolate flex min-h-0 flex-col overflow-hidden rounded-xl border shadow-sm backdrop-blur-md',
        className,
      )}
    >
      {/* Üst highlight gradient çizgisi — hero ile aynı dil. */}
      <div
        aria-hidden
        className="from-primary/0 via-primary/40 to-primary/0 pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r"
      />

      <header className="border-border/40 flex items-center gap-3 border-b px-4 py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel ?? strings.home.shell.back}
            className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 inline-flex size-7 shrink-0 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2 lg:hidden"
          >
            <ChevronLeftIcon className="size-4" aria-hidden />
          </button>
        )}
        {icon && (
          <div
            aria-hidden
            className="bg-primary/10 text-primary border-primary/20 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border backdrop-blur-sm"
          >
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-primary text-[10px] font-bold uppercase tracking-[0.18em]">
            {eyebrow}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">{count}</p>
        </div>
        {action}
      </header>
      <div className="pusula-scrollbar relative min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <AppSpinner showLabel={false} className="justify-center py-6" />
        ) : isError ? (
          <div className="p-3">
            <Alert variant="destructive">
              <AlertTitle>{errorTitle ?? strings.home.shell.errorTitle}</AlertTitle>
              <AlertDescription>
                {errorMessage ?? strings.common.unknownError}
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

type HomeColumnEmptyProps = {
  icon: ReactNode;
  title: string;
  description: string;
  cta?: ReactNode;
};

/**
 * Empty-state atom shared by all four columns — small icon bubble, two lines of
 * copy, optional CTA below. Centered in the column body.
 */
export function HomeColumnEmpty({ icon, title, description, cta }: HomeColumnEmptyProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div
        aria-hidden
        className="bg-muted/40 text-muted-foreground inline-flex size-12 items-center justify-center rounded-full"
      >
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      {cta}
    </div>
  );
}
