import * as React from 'react';
import { CheckIcon } from 'lucide-react';
import { cn } from '../lib/utils';

type ToggleSize = 'sm' | 'md';

const SIZE_CLASS: Record<ToggleSize, string> = {
  sm: 'size-4',
  md: 'size-5',
};

type CardCompleteToggleOwnProps = {
  checked: boolean;
  onCheckedChange?: (value: boolean) => void;
  size?: ToggleSize;
  /**
   * When false (default) the toggle is hidden until the card is hovered, but
   * stays visible once checked. When true it's always visible (e.g. in the modal).
   */
  alwaysVisible?: boolean;
};

export type CardCompleteToggleProps = CardCompleteToggleOwnProps &
  Omit<React.ComponentProps<'button'>, keyof CardCompleteToggleOwnProps | 'role' | 'aria-checked'>;

/**
 * Round "card done" checkbox. Empty: outlined ring; checked: filled with the
 * success colour and a check mark. Designed to live inside a `group/kart` so it
 * can fade in on hover unless already checked.
 */
function CardCompleteToggle({
  checked,
  onCheckedChange,
  size = 'sm',
  alwaysVisible = false,
  className,
  onClick,
  disabled,
  ...props
}: CardCompleteToggleProps) {
  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    onCheckedChange?.(!checked);
  }

  return (
    <button
      data-slot="card-complete-toggle"
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={handleClick}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        SIZE_CLASS[size],
        checked
          ? 'border-success bg-success text-success-foreground'
          : 'border-muted-foreground/40 hover:border-foreground',
        !alwaysVisible &&
          'opacity-0 group-hover/kart:opacity-100 aria-checked:opacity-100',
        className,
      )}
      {...props}
    >
      {checked ? <CheckIcon className="size-3" /> : null}
    </button>
  );
}

export { CardCompleteToggle };
