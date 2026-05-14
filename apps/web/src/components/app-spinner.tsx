'use client';

import Lottie from 'lottie-react';
import { cn } from '@pusula/ui';
import compassSpinnerAnimation from '@/assets/compass-spinner.json';
import { strings } from '@/lib/strings';

const spinnerSizes = {
  xs: 'size-4',
  sm: 'size-5',
  md: 'size-7',
  lg: 'size-10',
} as const;

type AppSpinnerProps = {
  label?: string;
  showLabel?: boolean;
  size?: keyof typeof spinnerSizes;
  className?: string;
  animationClassName?: string;
  labelClassName?: string;
};

export function AppSpinner({
  label = strings.common.loading,
  showLabel = false,
  size = 'md',
  className,
  animationClassName,
  labelClassName,
}: AppSpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        'text-muted-foreground inline-flex items-center justify-center gap-2 text-sm',
        className,
      )}
    >
      <Lottie
        animationData={compassSpinnerAnimation}
        autoplay
        loop
        aria-hidden="true"
        className={cn('shrink-0', spinnerSizes[size], animationClassName)}
      />
      <span className={cn(showLabel ? undefined : 'sr-only', labelClassName)}>{label}</span>
    </div>
  );
}
