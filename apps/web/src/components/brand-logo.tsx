import type { CSSProperties } from 'react';
import { cn } from '@pusula/ui';
import { strings } from '@/lib/strings';

export const BRAND_LOGO_SRC = '/brand/compass.svg';

const compassMaskStyle = {
  WebkitMask: `url(${BRAND_LOGO_SRC}) center / contain no-repeat`,
  mask: `url(${BRAND_LOGO_SRC}) center / contain no-repeat`,
} satisfies CSSProperties;

type BrandLogoProps = {
  variant?: 'framed' | 'plain';
  showText?: boolean;
  className?: string;
  markClassName?: string;
  iconClassName?: string;
  textClassName?: string;
};

export function BrandLogo({
  variant = 'framed',
  showText = true,
  className,
  markClassName,
  iconClassName,
  textClassName,
}: BrandLogoProps) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      {variant === 'plain' ? (
        <span
          data-slot="brand-logo-mark"
          className={cn('inline-block size-5 shrink-0 bg-current', markClassName, iconClassName)}
          style={compassMaskStyle}
          aria-hidden
        />
      ) : (
        <span
          data-slot="brand-logo-mark"
          className={cn(
            'bg-primary inline-flex size-7 shrink-0 items-center justify-center rounded-md',
            markClassName,
          )}
          aria-hidden
        >
          <img
            src={BRAND_LOGO_SRC}
            alt=""
            className={cn('size-4 invert dark:invert', iconClassName)}
          />
        </span>
      )}
      {showText ? (
        <span className={cn('truncate font-semibold tracking-tight', textClassName)}>
          {strings.common.appName}
        </span>
      ) : null}
    </span>
  );
}
