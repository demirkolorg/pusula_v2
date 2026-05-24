/**
 * Faz 13H (DEM-264) — destructive action confirmation dialog.
 *
 * Pusula konvansiyonu (code-review W1 fix): `window.confirm()` yerine
 * shadcn Dialog. `member-row.tsx`'teki private `ConfirmDialog` pattern'i
 * — destructive aksiyon için variant="destructive" + Vazgeç ile çift CTA.
 *
 * Reusable: saved-report-row, schedule-row, saved-report-actions üç yer
 * de aynı pattern; controlled `open`/`onOpenChange` (parent state).
 */
'use client';

import type { ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pusula/ui';
import { strings } from '@/lib/strings';

export interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending = false,
  onConfirm,
}: ConfirmActionDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent closeLabel={strings.common.close}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              {strings.common.cancel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            data-testid="confirm-action-confirm"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
