/**
 * Faz 13G (DEM-263) — yetki'ye göre disable/hide Button wrapper'ı.
 *
 * UI affordance gating'i (görünüm) için tek-amaçlı sarmalama: server-side
 * yetki kanonik kalmaya devam eder; bu component sadece düğmeyi disable
 * eder + tooltip ile reason'u açıklar. `hide=true` ile tamamen kaldırılır
 * (viewer için "Kaydet" butonu gibi).
 *
 * Pattern: shadcn Button + Tooltip — yeni primitive ekleme yok.
 */
'use client';

import { forwardRef } from 'react';
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  type ButtonProps,
} from '@pusula/ui';

export interface PermissionGatedButtonProps extends ButtonProps {
  /** İzin var mı? `false` ise buton disable veya hide. */
  can: boolean;
  /**
   * `hide=true` + `can=false` ise buton DOM'a girmez. Default `false`
   * (disable + tooltip). "Sadece yöneticiler kaydedebilir" gibi açıklayıcı
   * disable görünümü gerekirse `hide={false}`; tamamen gizleme gerekiyorsa
   * `hide={true}`.
   */
  hide?: boolean;
  /**
   * Disabled durumda tooltip mesajı. `can=true` veya `hide=true` ise
   * gösterilmez. i18n key resolve edilmiş string bekler (caller `t(...)`).
   */
  reason?: string;
}

/**
 * Pusula `Button` props'larını ileterek ek `can`/`hide`/`reason` davranışı
 * ekler. `disabled` doğrudan ezilmez — `can=false` → otomatik `disabled`.
 */
export const PermissionGatedButton = forwardRef<HTMLButtonElement, PermissionGatedButtonProps>(
  function PermissionGatedButton({ can, hide = false, reason, disabled, children, ...rest }, ref) {
    if (!can && hide) return null;

    // A11y S3 + code-review M3: `disabled` attribute klavye kullanıcıları
    // için focus alamaz → tooltip reason'a erişilemez. `aria-disabled` +
    // onClick guard ile button focusable kalır; tooltip Tab/Focus ile
    // açılır. `disabled` prop explicit verilirse onun davranışını da koru.
    const reasonAvailable = !can && Boolean(reason);

    if (!reasonAvailable) {
      return (
        <Button ref={ref} disabled={disabled || !can} {...rest}>
          {children}
        </Button>
      );
    }

    // Permission denied + reason var: aria-disabled pattern (klavye
    // erişilebilir disabled görünüm). Radix Tooltip kendi Provider'ı
    // sarsın diye `TooltipProvider` ile lokal sar — global provider
    // varsayımı yok.
    // Tooltip için `disabled` HTML attribute'unu kaldır (focusable kalsın),
    // `onClick` user-supplied'ı yutarak permission-denied'da no-op yap.
    const { onClick: _userOnClick, className: userClassName, ...passthrough } = rest;
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={ref}
              aria-disabled
              data-permission-denied
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className={[userClassName, 'opacity-60 hover:bg-transparent']
                .filter(Boolean)
                .join(' ')}
              {...passthrough}
            >
              {children}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);
