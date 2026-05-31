import * as React from 'react';
import { cn } from '../lib/utils';

type MetaVariant = 'card' | 'modal';
type MetaTone = 'default' | 'overdue' | 'soon' | 'complete';

export interface MetaRowProps extends React.ComponentProps<'div'> {
  /** `card` = dense `text-[10px]` row; `modal` = looser chip row. */
  variant?: MetaVariant;
}

/**
 * Container for a row of {@link MetaChip}s — used on cards (metadata strip) and
 * in the card modal (meta chips). Just a flex shell; chips carry their own
 * sizing per `variant`.
 */
function MetaRow({ variant = 'card', className, ...props }: MetaRowProps) {
  return (
    <div
      data-slot="meta-row"
      className={cn(
        'flex flex-wrap items-center',
        variant === 'card' ? 'gap-x-2 gap-y-1 text-xs text-muted-foreground' : 'gap-1',
        className,
      )}
      {...props}
    />
  );
}

type MetaChipOwnProps = {
  /** Leading icon — caller sizes it (e.g. `size-3`). */
  icon?: React.ReactNode;
  variant?: MetaVariant;
  tone?: MetaTone;
  /** Modal variant only — render as a hoverable `<button>`. */
  interactive?: boolean;
};

export type MetaChipProps = MetaChipOwnProps &
  Omit<React.ComponentProps<'button'>, keyof MetaChipOwnProps>;

const TONE_CLASS: Record<MetaTone, string> = {
  default: '',
  overdue: 'rounded-sm bg-destructive/12 px-1 py-px font-medium text-destructive',
  // `text-warning-foreground` warning'in semantik kontrast eşi — yumuşak amber
  // zemin (bg-warning/15) üzerinde okunabilirliği `text-warning`'tan yüksek;
  // warning token light mode'da lightness ≈ 0.78 olduğu için vivid metin
  // soluk zeminde silikleşir.
  soon: 'rounded-sm bg-warning/15 px-1 py-px font-medium text-warning-foreground',
  complete: 'rounded-sm bg-success/15 px-1 py-px font-medium text-success',
};

/**
 * A single metadata chip (icon + text). Shared shell for the card metadata
 * strip and the card-modal meta chips. `due` / `count` / `members` "variants"
 * are produced by callers passing the matching `icon` + content; `tone` handles
 * the overdue/soon emphasis. When `interactive` (modal only) it renders as a
 * `<button>`, otherwise a `<span>`.
 */
function MetaChip({
  icon,
  children,
  variant = 'card',
  tone = 'default',
  interactive = false,
  className,
  ...props
}: MetaChipProps) {
  const base =
    variant === 'card'
      ? 'inline-flex items-center gap-1 text-xs'
      : 'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground';
  const interactiveClass =
    interactive && variant === 'modal'
      ? 'cursor-pointer transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none'
      : '';
  const merged = cn(base, TONE_CLASS[tone], interactiveClass, className);

  if (interactive) {
    const { type = 'button', ...rest } = props;
    return (
      <button data-slot="meta-chip" type={type} className={merged} {...rest}>
        {icon}
        {children}
      </button>
    );
  }

  const { type: _type, disabled: _disabled, form: _form, ...rest } = props;
  return (
    <span data-slot="meta-chip" className={merged} {...(rest as React.ComponentProps<'span'>)}>
      {icon}
      {children}
    </span>
  );
}

export { MetaChip, MetaRow };
