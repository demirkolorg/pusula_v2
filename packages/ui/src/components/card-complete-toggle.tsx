'use client';

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

/** How long the one-shot completion action runs before the burst node is removed. */
const CELEBRATE_MS = 760;

/**
 * Round "card done" checkbox. Empty: outlined ring; checked: filled with the
 * success colour and a check mark. Designed to live inside a `group/kart` so it
 * can fade in on hover unless already checked.
 *
 * Completion is an *action*, not an instant colour swap (Trello-style): when
 * `checked` flips false -> true the ring pops, a burst ring radiates out and
 * the check mark springs in. It is driven off `checked` (not the click) so
 * optimistic and realtime completions both animate, while an already-complete
 * card never animates on mount. Honours `prefers-reduced-motion`.
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
  const [celebrating, setCelebrating] = React.useState(false);
  const wasChecked = React.useRef(checked);

  React.useEffect(() => {
    if (checked && !wasChecked.current) {
      setCelebrating(true);
      const timer = window.setTimeout(() => setCelebrating(false), CELEBRATE_MS);
      wasChecked.current = checked;
      return () => window.clearTimeout(timer);
    }
    wasChecked.current = checked;
  }, [checked]);

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
        'relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border-2 outline-none',
        'transition-[background-color,border-color,transform] duration-150 ease-out',
        'focus-visible:ring-2 focus-visible:ring-ring/60',
        'active:scale-90 disabled:cursor-not-allowed disabled:opacity-50',
        'motion-reduce:transition-none motion-reduce:active:scale-100',
        SIZE_CLASS[size],
        checked
          ? 'border-success bg-success text-success-foreground'
          : 'border-muted-foreground/40 hover:scale-110 hover:border-foreground motion-reduce:hover:scale-100',
        celebrating && 'motion-safe:animate-card-complete-pop',
        !alwaysVisible && 'opacity-0 group-hover/kart:opacity-100 aria-checked:opacity-100',
        className,
      )}
      {...props}
    >
      {/* Radiating ring — only mounted while celebrating a fresh completion. */}
      {celebrating ? (
        <span
          aria-hidden
          data-slot="card-complete-burst"
          className="pointer-events-none absolute inset-[-2px] rounded-full border-2 border-success motion-safe:animate-card-complete-burst motion-reduce:hidden"
        />
      ) : null}
      {checked ? (
        <CheckIcon
          className={cn('size-3', celebrating && 'motion-safe:animate-card-complete-check')}
        />
      ) : null}
    </button>
  );
}

export { CardCompleteToggle };
