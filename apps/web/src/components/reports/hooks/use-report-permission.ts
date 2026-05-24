/**
 * Faz 13G (DEM-263) — client-side permission hint hook'u.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10 + docs/domain/09-
 * raporlama-kurallari.md §9.5 (yetki matrisi). Bu hook yalnız UI görünümü
 * (buton göster/gizle/disable) için kullanılır; KANONİK yetki kontrolü
 * server-side tRPC procedure içinde (`canPerformReportAction` aynı domain
 * helper'ı server'da da çağrılır). Client cache eskimişse procedure
 * UNAUTHORIZED döner — UI bunu zaten error toast'la handle eder.
 *
 * Workspace ve effective board rolü `useTRPC()` query'leriyle çekilir:
 *  - `workspace.get({ workspaceId })` → `role: WorkspaceRole`
 *  - `board.get({ boardId })` → `role: BoardRole` (`null` ise workspace
 *    rolü üzerinden `effectiveBoardRole` ile türetilir).
 *
 * Cached: ikisi de `apps/web` zaten board screen'inde fetch ediyor —
 * react-query cache reuse, ekstra istek yok.
 */
'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  canPerformReportAction,
  effectiveBoardRole,
  type BoardRole,
  type ReportAction,
  type ReportPermissionCtx,
  type ReportPermissionResult,
  type ReportScope,
  type WorkspaceRole,
} from '@pusula/domain';
import { useTRPC } from '@/trpc/client';

export interface UseReportPermissionArgs {
  scope: ReportScope;
}

export interface UseReportPermissionResult {
  /** Workspace üyelik rolü (çağıran kullanıcı için). Null = üye değil. */
  workspaceRole: WorkspaceRole | null;
  /** Effective board rolü (çağıran kullanıcı). Null = board erişimi yok. */
  boardRole: BoardRole | null;
  /** Spesifik action'a izin var mı? `canPerformReportAction` sonucu. */
  can(action: ReportAction): ReportPermissionResult;
  /**
   * Hızlı erişim hint'leri — JSX `{canSave && ...}` pattern'i için. Her
   * biri `can(...)` çağrısının `allowed` alanına eşit.
   */
  canGenerate: boolean;
  canRender: boolean;
  canSave: boolean;
  canDelete: boolean;
  canScheduleCreate: boolean;
  canRecipientEmail: boolean;
  /**
   * Yetki ctx yükleniyor (network veya cache). Hooks tüketicisi
   * `disabled + spinner` göstermek isteyebilir. Yükleme bitene kadar
   * tüm `can*` flag'leri `false`.
   */
  isLoading: boolean;
}

/**
 * Permission hook'u — board+workspace rolünü çözüp `canPerformReportAction`
 * sonuçlarını döner. Card/list scope için boardId scope'tan alınır; workspace
 * scope için board fetch'i atlanır.
 */
export function useReportPermission(args: UseReportPermissionArgs): UseReportPermissionResult {
  const trpc = useTRPC();

  const workspaceQuery = useQuery({
    ...trpc.workspace.get.queryOptions({ workspaceId: args.scope.workspaceId }),
    // Permission rolü uzun yaşar; staleTime cache reuse için kısa tut.
    staleTime: 30_000,
  });

  // Board fetch yalnız board/list/card scope için. Workspace scope'unda
  // board yok → query disable.
  const boardId =
    args.scope.kind === 'board'
      ? args.scope.boardId
      : args.scope.kind === 'list' || args.scope.kind === 'card'
        ? args.scope.boardId
        : null;
  const boardQuery = useQuery({
    ...trpc.board.get.queryOptions(boardId ? { boardId } : (undefined as never)),
    enabled: Boolean(boardId),
    staleTime: 30_000,
  });

  return useMemo<UseReportPermissionResult>(() => {
    const workspaceRole = (workspaceQuery.data?.role ?? null) as WorkspaceRole | null;
    // `board.get` response shape: `{ board: { role, ... }, lists, cards }`.
    // `board.role` zaten effective rolü taşır (server-side resolve);
    // workspace owner/admin fallback için `effectiveBoardRole` ile sar.
    const explicitBoardRole = (boardQuery.data?.board?.role ?? null) as BoardRole | null;
    const boardRole = boardId
      ? effectiveBoardRole({ workspaceRole, boardRole: explicitBoardRole })
      : null;

    const ctx: ReportPermissionCtx = { workspace: workspaceRole, board: boardRole };
    const can = (action: ReportAction): ReportPermissionResult =>
      canPerformReportAction(action, args.scope, ctx);

    const isLoading =
      workspaceQuery.isPending || (Boolean(boardId) && boardQuery.isPending);
    if (isLoading) {
      return {
        workspaceRole,
        boardRole,
        can,
        canGenerate: false,
        canRender: false,
        canSave: false,
        canDelete: false,
        canScheduleCreate: false,
        canRecipientEmail: false,
        isLoading: true,
      };
    }

    return {
      workspaceRole,
      boardRole,
      can,
      canGenerate: can('generate').allowed,
      canRender: can('render').allowed,
      canSave: can('save').allowed,
      canDelete: can('delete').allowed,
      canScheduleCreate: can('scheduleCreate').allowed,
      canRecipientEmail: can('recipientEmail').allowed,
      isLoading: false,
    };
  }, [args.scope, workspaceQuery.data, workspaceQuery.isPending, boardQuery.data, boardQuery.isPending, boardId]);
}
