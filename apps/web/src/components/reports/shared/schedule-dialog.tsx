/**
 * Faz 13G (DEM-263) — schedule dialog iskeleti.
 *
 * Bu fazda UI hazır ama 13J (DEM-266) Resend + scheduler worker'ı
 * tamamlanmadan tam çalışmaz. Mutation `report.schedule.create` 13D'de
 * mevcut — DB'ye row eklenir, ama worker tick olmadığı için email
 * gönderilmez. UI'da "13J bekleniyor" notu yer.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.1 + §10.5.5.
 */
'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from '@pusula/ui';
import type { CadenceConfig } from '@pusula/domain';
import { useTRPC } from '@/trpc/client';
import { useReportI18n } from '../hooks/use-report-i18n';

export interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saved report id — schedule bir saved report'a bağlanır. */
  savedReportId: string;
  /** Workspace timezone — schedule.timezone alanına gider. */
  defaultTimezone?: string;
  /** Onay sonrası composer veya panel listesi invalidate. */
  onCreated?: () => void;
}

type CadenceKind = CadenceConfig['cadence'];

export function ScheduleDialog({
  open,
  onOpenChange,
  savedReportId,
  defaultTimezone = 'Europe/Istanbul',
  onCreated,
}: ScheduleDialogProps) {
  const { t } = useReportI18n();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [cadence, setCadence] = useState<CadenceKind>('weekly');
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const [dayOfWeek, setDayOfWeek] = useState('1'); // 0-6, 1=Mon
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [isActive, setIsActive] = useState(true);

  const createMutation = useMutation(
    trpc.report.schedule.create.mutationOptions({
      onSuccess: () => {
        toast.success(t('reports.schedule.successToast'));
        void queryClient.invalidateQueries(trpc.report.schedule.list.queryFilter({ savedReportId }));
        onCreated?.();
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(err.message || t('reports.schedule.errorToast'));
      },
    }),
  );

  function handleSubmit() {
    const cadenceConfig: CadenceConfig =
      cadence === 'daily'
        ? { cadence: 'daily', hour: Number(hour), minute: Number(minute) }
        : cadence === 'weekly'
          ? {
              cadence: 'weekly',
              dayOfWeek: Number(dayOfWeek) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
              hour: Number(hour),
              minute: Number(minute),
            }
          : {
              cadence: 'monthly',
              dayOfMonth: dayOfMonth === 'last' ? 'last' : (Number(dayOfMonth) as 1),
              hour: Number(hour),
              minute: Number(minute),
            };

    createMutation.mutate({
      savedReportId,
      cadenceConfig,
      timezone: defaultTimezone,
      recipientUserIds: [],
      recipientEmails: [],
      isActive,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('reports.schedule.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('reports.schedule.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <Alert>
          <AlertDescription className="text-xs">
            <Badge variant="outline" className="mr-1">
              13J
            </Badge>
            {t('reports.schedule.pendingPhaseNote')}
          </AlertDescription>
        </Alert>
        <div className="space-y-4 py-2">
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('reports.schedule.cadenceLabel')}
            </legend>
            <RadioGroup
              value={cadence}
              onValueChange={(next) => setCadence(next as CadenceKind)}
              className="flex gap-4"
            >
              {(['daily', 'weekly', 'monthly'] as const).map((c) => (
                <label key={c} className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
                  <RadioGroupItem value={c} />
                  {t(`reports.schedule.cadence.${c}`)}
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-hour">{t('reports.schedule.hour')}</Label>
              <Input
                id="schedule-hour"
                value={hour}
                onChange={(e) => setHour(e.target.value)}
                inputMode="numeric"
                maxLength={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-minute">{t('reports.schedule.minute')}</Label>
              <Input
                id="schedule-minute"
                value={minute}
                onChange={(e) => setMinute(e.target.value)}
                inputMode="numeric"
                maxLength={2}
              />
            </div>
          </div>

          {cadence === 'weekly' && (
            <div className="space-y-1.5">
              <Label>{t('reports.schedule.dayOfWeek')}</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {t(`reports.schedule.weekday.${d}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {cadence === 'monthly' && (
            <div className="space-y-1.5">
              <Label htmlFor="schedule-dom">{t('reports.schedule.dayOfMonth')}</Label>
              <Input
                id="schedule-dom"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {t('reports.schedule.dayOfMonthHint')}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <Switch
              id="schedule-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor="schedule-active" className="flex-1 cursor-pointer text-sm">
              {t('reports.schedule.activeLabel')}
            </Label>
          </div>

          <Alert>
            <AlertDescription className="text-xs">
              <Checkbox id="schedule-recipients-placeholder" disabled className="mr-2" />
              {t('reports.schedule.recipientsComingSoon')}
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('reports.actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending
              ? t('reports.schedule.creating')
              : t('reports.schedule.createCta')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
