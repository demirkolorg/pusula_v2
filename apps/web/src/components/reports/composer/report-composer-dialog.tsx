/**
 * Faz 13G (DEM-263) — composer dialog (top-level).
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.1.
 * Layout: shadcn Dialog, max-w-5xl, scrollable. İçeride:
 *  - <PresetPicker>
 *  - <FilterForm>
 *  - <ComparisonToggle>
 *  - <ReportPanel> (preview canlı)
 *  - <ActionBar>
 *
 * `embedded` prop: Dialog wrapper olmadan render (board/card sayfasında
 * inline gösterim — entity-tab/card-reports-button alternatif kullanım).
 * Default `false`.
 *
 * Pusula form pattern: `useState` (react-hook-form yok). State
 * `useComposerState` hook'unda — Zod validation `report.preview` /
 * `report.save` mutation'larında server-side.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pusula/ui';
import type {
  ComparisonConfig,
  ReportFilters,
  ReportScope,
} from '@pusula/domain';
import { useTRPC } from '@/trpc/client';
import { useReportI18n } from '../hooks/use-report-i18n';
import { ActionBar } from './action-bar';
import { ComparisonToggle } from './comparison-toggle';
import {
  FilterForm,
  type FilterFormOptionItem,
  type LabelOption,
  type MemberOption,
} from './filter-form';
import { PresetPicker } from './preset-picker';
import { useComposerState } from './use-composer-state';
import { ReportPanel } from '../panel/report-panel';

export interface ReportComposerDialogProps {
  scope: ReportScope;
  initialPresetId?: string;
  initialFilters?: ReportFilters;
  initialComparison?: ComparisonConfig;
  /**
   * Dialog kontrol modu. `embedded=true` ise `open`/`onOpenChange`
   * yoksayılır ve dialog yerine düz container render edilir (sayfa
   * gömülü pattern).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Inline embed — Dialog wrapper olmadan. */
  embedded?: boolean;
  /** Saved report düzenleme — Action bar mode farklı (update vs create). */
  savedReportId?: string;
  /** Composer açık tutulurken Kaydet'te kapatma callback'i. */
  onSavedSuccess?: (savedReportId: string) => void;
}

/**
 * Composer dialog'unun ana iskeleti — embedded modu için body'i ayrı
 * fonksiyona ayrılır (Dialog wrapper olmadan render gerekli).
 */
export function ReportComposerDialog(props: ReportComposerDialogProps) {
  const { embedded, open, onOpenChange } = props;
  const { t } = useReportI18n();
  const body = <ComposerBody {...props} />;

  if (embedded) {
    return (
      <div className="space-y-0" data-testid="report-composer-embedded">
        {body}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-5xl overflow-hidden p-0"
        data-testid="report-composer-dialog"
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>
            {t(props.savedReportId ? 'reports.composer.title.edit' : 'reports.composer.title.create')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t(`reports.composer.scopeLabel.${props.scope.kind}`)}
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function ComposerBody({
  scope,
  initialPresetId,
  initialFilters,
  initialComparison,
  savedReportId,
  onSavedSuccess,
}: ReportComposerDialogProps) {
  const trpc = useTRPC();
  const state = useComposerState({
    scope,
    initialPresetId,
    initialFilters,
    initialComparison,
  });

  // Member/label/list/board options — sadece composer açıkken çekilir.
  // Board scope için board.members + board.labels + board.lists.
  // Workspace scope için workspace.members + workspace.boards.
  // Card/list scope: board context'inden devam, ek özel çağrı yok.
  const memberOptions = useMemberOptionsForScope(scope);
  const labelOptions = useLabelOptionsForScope(scope);
  const listOptions = useListOptionsForScope(scope);
  const boardOptions = useBoardOptionsForScope(scope);

  void trpc; // tüm tRPC çağrıları hook'lar içinde — kullanmıyoruz burada

  const dataset = state.previewQuery.data ?? null;
  const previewError = state.previewQuery.error
    ? state.previewQuery.error.message
    : null;

  return (
    <div className="flex max-h-[78vh] flex-col">
      <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-5">
          <PresetPicker
            scopeKind={scope.kind}
            value={state.presetId}
            onChange={state.setPresetId}
          />
          {state.presetId && (
            <FilterForm
              scope={scope}
              value={state.filters}
              onChange={state.setFilters}
              availableMembers={memberOptions}
              availableLabels={labelOptions}
              availableLists={listOptions}
              availableBoards={boardOptions}
            />
          )}
          {state.presetId && (
            <ComparisonToggle
              value={state.comparison}
              onChange={state.setComparison}
              range={state.filters.range}
            />
          )}
        </div>
        <div className="min-h-0 space-y-3">
          <ReportPanel
            dataset={dataset}
            loading={state.previewQuery.isFetching}
            errorMessage={previewError}
            onRefresh={() => void state.previewQuery.refetch()}
            compact
          />
        </div>
      </div>
      <ActionBar
        scope={scope}
        state={state}
        savedReportId={savedReportId}
        onSaveSuccess={onSavedSuccess}
      />
    </div>
  );
}

// ─── Option fetchers — minimal tRPC çağrıları (cache reuse) ─────────────────

function useMemberOptionsForScope(scope: ReportScope): MemberOption[] {
  const trpc = useTRPC();
  // Board scope (card/list/board): board.members
  const boardId =
    scope.kind === 'board'
      ? scope.boardId
      : scope.kind === 'card' || scope.kind === 'list'
        ? scope.boardId
        : null;
  const boardMembersQuery = useQuery({
    ...trpc.board.members.list.queryOptions(boardId ? { boardId } : (undefined as never)),
    enabled: Boolean(boardId),
    staleTime: 60_000,
  });
  const wsMembersQuery = useQuery({
    ...trpc.workspace.members.list.queryOptions({ workspaceId: scope.workspaceId }),
    enabled: scope.kind === 'workspace',
    staleTime: 60_000,
  });
  if (boardId) {
    return (
      boardMembersQuery.data?.map((m) => ({
        userId: m.userId,
        name: m.name ?? m.email ?? m.userId,
      })) ?? []
    );
  }
  return (
    wsMembersQuery.data?.map((m) => ({
      userId: m.userId,
      name: m.name ?? m.email ?? m.userId,
    })) ?? []
  );
}

function useLabelOptionsForScope(scope: ReportScope): LabelOption[] {
  const trpc = useTRPC();
  const boardId =
    scope.kind === 'board'
      ? scope.boardId
      : scope.kind === 'card' || scope.kind === 'list'
        ? scope.boardId
        : null;
  const labelsQuery = useQuery({
    ...trpc.label.list.queryOptions(boardId ? { boardId } : (undefined as never)),
    enabled: Boolean(boardId),
    staleTime: 60_000,
  });
  return (
    labelsQuery.data?.map((l) => ({
      labelId: l.id,
      name: l.name || l.color,
      color: l.color,
    })) ?? []
  );
}

function useListOptionsForScope(scope: ReportScope): FilterFormOptionItem[] {
  const trpc = useTRPC();
  const boardId = scope.kind === 'board' ? scope.boardId : null;
  const boardQuery = useQuery({
    ...trpc.board.get.queryOptions(boardId ? { boardId } : (undefined as never)),
    enabled: Boolean(boardId),
    staleTime: 60_000,
  });
  return (
    boardQuery.data?.lists?.map((l) => ({ id: l.id, name: l.title })) ?? []
  ) as FilterFormOptionItem[];
}

function useBoardOptionsForScope(scope: ReportScope): FilterFormOptionItem[] {
  const trpc = useTRPC();
  const boardsQuery = useQuery({
    ...trpc.board.list.queryOptions({ workspaceId: scope.workspaceId }),
    enabled: scope.kind === 'workspace',
    staleTime: 60_000,
  });
  return (
    boardsQuery.data?.map((b) => ({ id: b.id, name: b.title })) ?? []
  );
}
