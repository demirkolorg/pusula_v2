'use client';

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { tr } from 'react-day-picker/locale';
import { Button } from './button';
import { Calendar } from './calendar';
import { Input } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn } from '../lib/utils';

type DatePickerInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'className' | 'onChange' | 'type' | 'value'
> & {
  value: string;
  onValueChange: (value: string) => void;
  calendarButtonLabel: string;
  className?: string;
  inputClassName?: string;
  popoverContentClassName?: string;
};

function toInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromInputValue(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(parsed.getTime())) return undefined;
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) {
    return undefined;
  }

  return parsed;
}

function DatePickerInput({
  value,
  onValueChange,
  calendarButtonLabel,
  className,
  inputClassName,
  popoverContentClassName,
  disabled,
  ...inputProps
}: DatePickerInputProps) {
  const [open, setOpen] = React.useState(false);
  const selected = fromInputValue(value);

  return (
    <div className={cn('flex w-full max-w-xs items-center gap-2', className)}>
      <Input
        type="text"
        inputMode="numeric"
        pattern="\d{4}-\d{2}-\d{2}"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        disabled={disabled}
        className={cn('font-mono tabular-nums', inputClassName)}
        {...inputProps}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label={calendarButtonLabel}
            disabled={disabled}
          >
            <CalendarIcon className="size-4" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className={cn('w-auto p-0', popoverContentClassName)}>
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            locale={tr}
            onSelect={(date) => {
              if (!date) return;
              onValueChange(toInputValue(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { DatePickerInput, type DatePickerInputProps };
