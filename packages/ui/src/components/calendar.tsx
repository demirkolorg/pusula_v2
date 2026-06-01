'use client';

import * as React from 'react';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { DayPicker, getDefaultClassNames, type DayPickerProps } from 'react-day-picker';
import { buttonVariants } from './button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';
import { cn } from '../lib/utils';

function Calendar({
  className,
  classNames,
  components,
  showOutsideDays = true,
  ...props
}: DayPickerProps) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      data-slot="calendar"
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        root: cn(defaultClassNames.root),
        months: cn('flex flex-col gap-4 sm:flex-row', defaultClassNames.months),
        month: cn('flex flex-col gap-4', defaultClassNames.month),
        // `nav` üst alanı absolute kaplıyor; default'ta dropdown'ların click
        // target'ini yutar. Container'ı pointer-events-none yap, prev/next
        // butonlarını pointer-events-auto ile geri aktif et — orta alandaki
        // dropdown'lar artık tıklanabilir.
        nav: cn(
          'pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between',
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: 'outline' }),
          'pointer-events-auto size-7 bg-transparent p-0 opacity-60 hover:opacity-100',
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline' }),
          'pointer-events-auto size-7 bg-transparent p-0 opacity-60 hover:opacity-100',
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          'flex h-7 items-center justify-center px-8',
          defaultClassNames.month_caption,
        ),
        caption_label: cn('text-sm font-medium', defaultClassNames.caption_label),
        dropdowns: cn('flex items-center justify-center gap-1.5', defaultClassNames.dropdowns),
        // Dropdown component'i shadcn Select ile override edildiği için
        // react-day-picker'ın "native <select>'i görünmez yap" trick'ine
        // gerek yok — opacity-0 absolute hack'i çıkarıldı.
        dropdown_root: cn(defaultClassNames.dropdown_root),
        dropdown: cn(defaultClassNames.dropdown),
        month_grid: cn('w-full border-collapse', defaultClassNames.month_grid),
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn(
          'text-muted-foreground w-8 rounded-md text-[0.8rem] font-normal',
          defaultClassNames.weekday,
        ),
        week: cn('mt-2 flex w-full', defaultClassNames.week),
        day: cn(
          'relative size-8 p-0 text-center text-sm',
          '[&:has([aria-selected])]:bg-accent',
          'first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md',
          defaultClassNames.day,
        ),
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-8 p-0 font-normal aria-selected:opacity-100',
          defaultClassNames.day_button,
        ),
        selected: cn(
          '[&>button]:bg-primary [&>button]:text-primary-foreground',
          '[&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground',
          '[&>button]:focus:bg-primary [&>button]:focus:text-primary-foreground',
          defaultClassNames.selected,
        ),
        today: cn(
          '[&>button]:bg-accent [&>button]:text-accent-foreground',
          defaultClassNames.today,
        ),
        outside: cn(
          'text-muted-foreground opacity-50 aria-selected:opacity-30',
          defaultClassNames.outside,
        ),
        disabled: cn('text-muted-foreground opacity-50', defaultClassNames.disabled),
        hidden: cn('invisible', defaultClassNames.hidden),
        range_start: cn('rounded-l-md', defaultClassNames.range_start),
        range_middle: cn(
          '[&>button]:rounded-none [&>button]:bg-accent [&>button]:text-accent-foreground',
          defaultClassNames.range_middle,
        ),
        range_end: cn('rounded-r-md', defaultClassNames.range_end),
        ...classNames,
      }}
      components={{
        Chevron: ({ className: iconClassName, orientation, ...iconProps }) => {
          const Icon =
            orientation === 'left'
              ? ChevronLeftIcon
              : orientation === 'right'
                ? ChevronRightIcon
                : ChevronDownIcon;

          return <Icon className={cn('size-4', iconClassName)} aria-hidden {...iconProps} />;
        },
        // `captionLayout="dropdown"` veya "dropdown-months"/"dropdown-years"
        // kullanıldığında ay/yıl seçicileri OS-native <select> yerine shadcn
        // Select ile render edilir — tema, klavye odak halkası ve popover
        // davranışı diğer Select'lerle aynı kalır. react-day-picker `onChange`
        // beklediği için sentetik bir `ChangeEvent` üretip pas geçiyoruz.
        Dropdown: ({ value, onChange, options, 'aria-label': ariaLabel }) => {
          const selected = options?.find((option) => option.value === value);
          const handleValueChange = (next: string) => {
            if (!onChange) return;
            onChange({
              target: { value: next },
            } as unknown as React.ChangeEvent<HTMLSelectElement>);
          };
          return (
            <Select
              value={value?.toString()}
              onValueChange={handleValueChange}
            >
              <SelectTrigger
                size="sm"
                aria-label={ariaLabel}
                className="h-7 gap-1 px-2 py-0 text-sm font-medium"
              >
                <SelectValue>{selected?.label ?? value}</SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {options?.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value.toString()}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

export { Calendar, type DayPickerProps as CalendarProps };
