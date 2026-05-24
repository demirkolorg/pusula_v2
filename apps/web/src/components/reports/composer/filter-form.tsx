/**
 * Faz 13G (DEM-263) — composer filter form.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.1.
 * Alt-bölümler: tarih aralığı / üyeler / etiketler / scope (durum + alt
 * entity'ler). Zod schema (`reportFiltersSchema`) ile validate edilir.
 *
 * Pusula form pattern (CLAUDE.md): react-hook-form YOK; `useState` +
 * controlled inputs + parent'a `onChange(next)` ile bildir. Validation
 * `reportFiltersSchema.safeParse` ile her change'te — invalid'se kırmızı
 * border + alt yazı; parent zaten Zod ile `report.preview` çağırırken
 * tRPC catch eder.
 */
'use client';

import { useId, useMemo, useState } from 'react';
import { ChevronDownIcon, XIcon } from 'lucide-react';
import {
  Badge,
  Checkbox,
  DatePickerInput,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  cn,
} from '@pusula/ui';
import {
  CARD_STATUS_FILTERS,
  MEMBER_RELATIONS,
  RANGE_PRESETS,
  type CardStatusFilter,
  type LabelFilterMode,
  type MemberRelation,
  type RangePreset,
  type ReportFilters,
  type ReportRange,
  type ReportScope,
} from '@pusula/domain';
import { useReportI18n } from '../hooks/use-report-i18n';

/**
 * Empty defaults — `reportFiltersSchema`'nın optional alanları (members,
 * labels, scopeFilter) `undefined`'tan ziyade boş objelerle başlar ki
 * controlled input'lar her zaman tanımlı değer alsın. `onChange` her
 * adımda `mergedFilters` döner; parent zaten `safeParse` ile validate
 * eder ve undefined alanları schema strip eder.
 */
const EMPTY_MEMBERS: NonNullable<ReportFilters['members']> = { userIds: [], relations: [] };
const EMPTY_LABELS: NonNullable<ReportFilters['labels']> = { labelIds: [], mode: 'or' };
const EMPTY_SCOPE_FILTER: NonNullable<ReportFilters['scopeFilter']> = {
  cardStatus: [],
  includeArchivedLists: false,
};

export interface FilterFormOptionItem {
  id: string;
  name: string;
}
export interface MemberOption {
  userId: string;
  name: string;
}
export interface LabelOption {
  labelId: string;
  name: string;
  color: string;
}

export interface FilterFormProps {
  scope: ReportScope;
  value: ReportFilters;
  onChange: (next: ReportFilters) => void;
  availableMembers?: MemberOption[];
  availableLabels?: LabelOption[];
  availableLists?: FilterFormOptionItem[];
  availableBoards?: FilterFormOptionItem[];
  disabled?: boolean;
}

export function FilterForm({
  scope,
  value,
  onChange,
  availableMembers = [],
  availableLabels = [],
  availableLists = [],
  availableBoards = [],
  disabled,
}: FilterFormProps) {
  const { t } = useReportI18n();

  // Optional alanlar undefined olabilir → boş default ile sar (controlled
  // input'lar her zaman tanımlı değer alsın). Çıktıda boş olanı temizleriz.
  const members = value.members ?? EMPTY_MEMBERS;
  const labels = value.labels ?? EMPTY_LABELS;
  const scopeFilter = value.scopeFilter ?? EMPTY_SCOPE_FILTER;

  return (
    <div className="space-y-4" data-testid="report-filter-form">
      <DateRangeSection
        value={value.range}
        onChange={(range) => onChange({ ...value, range })}
        disabled={disabled}
      />
      <Separator />
      <MemberSection
        value={members}
        options={availableMembers}
        onChange={(next) =>
          onChange({
            ...value,
            members: next.userIds.length === 0 && next.relations.length === 0 ? undefined : next,
          })
        }
        disabled={disabled}
      />
      <Separator />
      <LabelSection
        value={labels}
        options={availableLabels}
        onChange={(next) =>
          onChange({
            ...value,
            labels: next.labelIds.length === 0 ? undefined : next,
          })
        }
        disabled={disabled}
      />
      <Separator />
      <ScopeFilterSection
        scope={scope}
        value={scopeFilter}
        availableLists={availableLists}
        availableBoards={availableBoards}
        onChange={(next) =>
          onChange({
            ...value,
            scopeFilter:
              (next.cardStatus?.length ?? 0) === 0 &&
              !next.includeArchivedLists &&
              !next.listIds &&
              !next.boardIds
                ? undefined
                : next,
          })
        }
        disabled={disabled}
      />
      <p className="text-[11px] text-muted-foreground">
        {t('reports.composer.filter.helperHint')}
      </p>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** ISO 8601 (`2026-05-24T12:34:56Z`) → `YYYY-MM-DD` input formatı. */
function toDateInputString(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `YYYY-MM-DD` → ISO start-of-day (UTC). Geçersiz veya boş → null. */
function inputStringToIsoStart(input: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** `YYYY-MM-DD` → ISO end-of-day (UTC). */
function inputStringToIsoEnd(input: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// ─── Date Range ────────────────────────────────────────────────────────────

function DateRangeSection({
  value,
  onChange,
  disabled,
}: {
  value: ReportRange;
  onChange: (next: ReportRange) => void;
  disabled?: boolean;
}) {
  const { t } = useReportI18n();
  const id = useId();
  const isCustom = value.kind === 'custom';

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('reports.composer.filter.range.label')}
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          disabled={disabled}
          value={isCustom ? '__custom__' : value.preset}
          onValueChange={(next) => {
            if (next === '__custom__') {
              const today = new Date();
              const from = new Date(today);
              from.setDate(from.getDate() - 7);
              onChange({ kind: 'custom', from: from.toISOString(), to: today.toISOString() });
            } else {
              onChange({ kind: 'preset', preset: next as RangePreset });
            }
          }}
        >
          <SelectTrigger id={id} className="h-9 w-[200px]">
            <SelectValue placeholder={t('reports.composer.filter.range.selectPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {RANGE_PRESETS.map((preset) => (
              <SelectItem key={preset} value={preset}>
                {t(`reports.composer.range.preset.${preset}`)}
              </SelectItem>
            ))}
            <SelectItem value="__custom__">
              {t('reports.composer.range.custom')}
            </SelectItem>
          </SelectContent>
        </Select>
        {isCustom && (
          <div className="flex items-center gap-2" data-testid="report-filter-custom-range">
            <DatePickerInput
              value={toDateInputString(value.from)}
              onValueChange={(next) => {
                const iso = inputStringToIsoStart(next);
                if (iso) onChange({ ...value, from: iso });
              }}
              disabled={disabled}
              calendarButtonLabel={t('reports.composer.filter.range.fromLabel')}
            />
            <span className="text-sm text-muted-foreground">→</span>
            <DatePickerInput
              value={toDateInputString(value.to)}
              onValueChange={(next) => {
                const iso = inputStringToIsoEnd(next);
                if (iso) onChange({ ...value, to: iso });
              }}
              disabled={disabled}
              calendarButtonLabel={t('reports.composer.filter.range.toLabel')}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Members ──────────────────────────────────────────────────────────────

function MemberSection({
  value,
  options,
  onChange,
  disabled,
}: {
  value: NonNullable<ReportFilters['members']>;
  options: MemberOption[];
  onChange: (next: NonNullable<ReportFilters['members']>) => void;
  disabled?: boolean;
}) {
  const { t } = useReportI18n();
  const [open, setOpen] = useState(false);
  const selectedIds = new Set(value.userIds);
  const selectedNames = useMemo(
    () => options.filter((o) => selectedIds.has(o.userId)).map((o) => o.name),
    [options, value.userIds],
  );
  // Pusula domain: `relations` ARRAY — birden çok relation aynı anda
  // seçilebilir (örn. atanan + watcher). V1 UI tek seçim — Select tek-değer;
  // ileride multi-select için ayrı pattern (filter chip group).
  const currentRelation = value.relations[0] ?? 'assignee';

  const toggle = (userId: string) => {
    const next = selectedIds.has(userId)
      ? value.userIds.filter((id) => id !== userId)
      : [...value.userIds, userId];
    onChange({ ...value, userIds: next });
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('reports.composer.filter.members.label')}
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled || options.length === 0}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm',
                'hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              data-testid="report-filter-members-trigger"
            >
              {selectedNames.length === 0
                ? t('reports.composer.filter.members.allMembers')
                : t('reports.composer.filter.members.selectedCount', {
                    count: selectedNames.length,
                  })}
              <ChevronDownIcon className="size-3.5 opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            {options.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {t('reports.composer.filter.members.empty')}
              </p>
            ) : (
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {options.map((opt) => {
                  const checked = selectedIds.has(opt.userId);
                  return (
                    <li key={opt.userId}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(opt.userId)}
                          aria-label={opt.name}
                        />
                        <span className="text-sm">{opt.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </PopoverContent>
        </Popover>
        {selectedNames.length > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...value, userIds: [] })}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
            disabled={disabled}
          >
            <XIcon className="size-3" />
            {t('reports.composer.filter.clearSelection')}
          </button>
        )}
        <Select
          disabled={disabled || selectedNames.length === 0}
          value={currentRelation}
          onValueChange={(next) =>
            onChange({ ...value, relations: [next as MemberRelation] })
          }
        >
          <SelectTrigger className="h-9 w-[140px]" data-testid="report-filter-members-relation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEMBER_RELATIONS.map((rel) => (
              <SelectItem key={rel} value={rel}>
                {t(`reports.composer.filter.members.relations.${rel}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selectedNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedNames.map((name) => (
            <Badge key={name} variant="secondary" className="text-xs">
              {name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Labels ───────────────────────────────────────────────────────────────

function LabelSection({
  value,
  options,
  onChange,
  disabled,
}: {
  value: NonNullable<ReportFilters['labels']>;
  options: LabelOption[];
  onChange: (next: NonNullable<ReportFilters['labels']>) => void;
  disabled?: boolean;
}) {
  const { t } = useReportI18n();
  const [open, setOpen] = useState(false);
  const selectedIds = new Set(value.labelIds);
  const selectedLabels = options.filter((o) => selectedIds.has(o.labelId));

  const toggle = (labelId: string) => {
    const next = selectedIds.has(labelId)
      ? value.labelIds.filter((id) => id !== labelId)
      : [...value.labelIds, labelId];
    onChange({ ...value, labelIds: next });
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('reports.composer.filter.labels.label')}
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled || options.length === 0}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm',
                'hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              data-testid="report-filter-labels-trigger"
            >
              {selectedLabels.length === 0
                ? t('reports.composer.filter.labels.allLabels')
                : t('reports.composer.filter.labels.selectedCount', {
                    count: selectedLabels.length,
                  })}
              <ChevronDownIcon className="size-3.5 opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            {options.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {t('reports.composer.filter.labels.empty')}
              </p>
            ) : (
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {options.map((opt) => {
                  const checked = selectedIds.has(opt.labelId);
                  return (
                    <li key={opt.labelId}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(opt.labelId)}
                          aria-label={opt.name}
                        />
                        <span
                          aria-hidden
                          className="size-3 shrink-0 rounded-full"
                          style={{ backgroundColor: opt.color }}
                        />
                        <span className="text-sm">{opt.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </PopoverContent>
        </Popover>
        {selectedLabels.length > 1 && (
          <RadioGroup
            value={value.mode}
            onValueChange={(next) => onChange({ ...value, mode: next as LabelFilterMode })}
            disabled={disabled}
            className="flex items-center gap-3"
            data-testid="report-filter-labels-mode"
          >
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
              <RadioGroupItem value="and" id="report-label-mode-and" />
              <span>{t('reports.composer.filter.labels.mode.and')}</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
              <RadioGroupItem value="or" id="report-label-mode-or" />
              <span>{t('reports.composer.filter.labels.mode.or')}</span>
            </label>
          </RadioGroup>
        )}
        {selectedLabels.length > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...value, labelIds: [] })}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
            disabled={disabled}
          >
            <XIcon className="size-3" />
            {t('reports.composer.filter.clearSelection')}
          </button>
        )}
      </div>
      {selectedLabels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedLabels.map((label) => (
            <Badge key={label.labelId} variant="outline" className="text-xs">
              <span
                aria-hidden
                className="mr-1 size-2 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Scope (card status + list/board) ─────────────────────────────────────

function ScopeFilterSection({
  scope,
  value,
  availableLists,
  availableBoards,
  onChange,
  disabled,
}: {
  scope: ReportScope;
  value: NonNullable<ReportFilters['scopeFilter']>;
  availableLists: FilterFormOptionItem[];
  availableBoards: FilterFormOptionItem[];
  onChange: (next: NonNullable<ReportFilters['scopeFilter']>) => void;
  disabled?: boolean;
}) {
  const { t } = useReportI18n();
  const cardStatusList = value.cardStatus ?? [];
  const cardStatusSet = new Set<CardStatusFilter>(cardStatusList);

  const toggleCardStatus = (status: CardStatusFilter) => {
    const next = cardStatusSet.has(status)
      ? cardStatusList.filter((s) => s !== status)
      : [...cardStatusList, status];
    onChange({ ...value, cardStatus: next });
  };

  return (
    <div className="space-y-3">
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('reports.composer.filter.scope.label')}
      </Label>
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-xs text-muted-foreground">
          {t('reports.composer.filter.scope.cardStatus')}
        </legend>
        <div className="flex flex-wrap gap-3">
          {CARD_STATUS_FILTERS.map((status) => (
            <label
              key={status}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm"
            >
              <Checkbox
                checked={cardStatusSet.has(status)}
                onCheckedChange={() => toggleCardStatus(status)}
                disabled={disabled}
                data-testid={`report-filter-status-${status}`}
              />
              <span>{t(`reports.filters.scope.cardStatus.${status}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {scope.kind === 'board' && availableLists.length > 0 && (
        <ListSubFilter
          value={value.listIds ?? null}
          options={availableLists}
          onChange={(listIds) => onChange({ ...value, listIds: listIds ?? undefined })}
          disabled={disabled}
        />
      )}
      {scope.kind === 'workspace' && availableBoards.length > 0 && (
        <BoardSubFilter
          value={value.boardIds ?? null}
          options={availableBoards}
          onChange={(boardIds) => onChange({ ...value, boardIds: boardIds ?? undefined })}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function ListSubFilter({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string[] | null;
  options: FilterFormOptionItem[];
  onChange: (next: string[] | null) => void;
  disabled?: boolean;
}) {
  const { t } = useReportI18n();
  const selectedIds = new Set(value ?? []);

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-xs text-muted-foreground">
        {t('reports.composer.filter.scope.lists')}
      </legend>
      <div className="flex flex-wrap gap-3" data-testid="report-filter-list-subpicker">
        {options.map((opt) => {
          const checked = selectedIds.has(opt.id);
          return (
            <label
              key={opt.id}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => {
                  const next = checked
                    ? (value ?? []).filter((id) => id !== opt.id)
                    : [...(value ?? []), opt.id];
                  onChange(next.length > 0 ? next : null);
                }}
                disabled={disabled}
              />
              <span>{opt.name}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function BoardSubFilter({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string[] | null;
  options: FilterFormOptionItem[];
  onChange: (next: string[] | null) => void;
  disabled?: boolean;
}) {
  const { t } = useReportI18n();
  const selectedIds = new Set(value ?? []);

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-xs text-muted-foreground">
        {t('reports.composer.filter.scope.boards')}
      </legend>
      <div className="flex flex-wrap gap-3" data-testid="report-filter-board-subpicker">
        {options.map((opt) => {
          const checked = selectedIds.has(opt.id);
          return (
            <label
              key={opt.id}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => {
                  const next = checked
                    ? (value ?? []).filter((id) => id !== opt.id)
                    : [...(value ?? []), opt.id];
                  onChange(next.length > 0 ? next : null);
                }}
                disabled={disabled}
              />
              <span>{opt.name}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
