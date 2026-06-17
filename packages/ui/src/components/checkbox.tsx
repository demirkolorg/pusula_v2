'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { CheckIcon } from 'lucide-react';
import { cn } from '../lib/utils';

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // Border rengi `--input` yerine `foreground/35` — shadcn default
        // `border-input` Pusula temalarının hepsinde (light: oklch 0.92, dark:
        // %14 alpha beyaz) zemin rengine çok yakın kalıp checkbox'ı görünmez
        // yapıyordu. `foreground` tema text rengine bağlı olduğu için her
        // palette otomatik adapt eder; %35 alpha okunabilirlik + form
        // sertliği dengesini tutar. Hover'da kontrast biraz artar.
        //
        // Dark mode yarı şeffaf zemin (`bg-input/30`) yalnızca `unchecked`
        // state ile sınırlıdır: yoksa Tailwind class generation sırasında
        // `data-[state=checked]:bg-primary` ile çakışıp checked durumda primary
        // arka planı silikleştiriyor → tik (text-primary-foreground) kayboluyor.
        'peer border-foreground/35 hover:border-foreground/55 dark:data-[state=unchecked]:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary aria-invalid:ring-destructive/20 aria-invalid:border-destructive size-4 shrink-0 cursor-pointer rounded-[4px] border shadow-xs transition-[color,box-shadow,transform] duration-(--duration-fast) ease-standard active:scale-90 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
